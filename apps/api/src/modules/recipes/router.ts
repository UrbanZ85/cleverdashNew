import express, { Router, type Request } from 'express';
import { Types, type SortOrder } from 'mongoose';
import { resolveAutomationOwnerUserId } from '../../platform/auth/automation-owner.js';
import { requireScopes } from '../../platform/auth/scopes.js';
import { loadEnv } from '../../platform/config/env.js';
import { badRequest, notFound, ProblemError } from '../../platform/errors/problem.js';
import { isShareableUser, readUserSummaries } from '../../platform/users/directory.service.js';
import { capabilitiesFor, type MemberRole } from './domain/capabilities.js';
import { checkImageUpload, safeImageFileName } from './domain/image-type.js';
import {
  buildRecipesFilter,
  cookedSchema,
  imageUploadQuerySchema,
  importSchema,
  MAX_INGREDIENTS,
  MAX_INGREDIENT_LENGTH,
  MAX_STEPS,
  MAX_STEP_LENGTH,
  memberRoleSchema,
  normalizeCategories,
  normalizeTags,
  recipePatchSchema,
  recipeWriteSchema,
  recipesQuerySchema,
  splitLines,
} from './domain/recipe-input.js';
import { hostLabel, normalizeOptionalRecipeUrl } from './domain/recipe-url.js';
import { buildSearchText } from './domain/search-text.js';
import { buildRecipeShareUrl, generateRecipeShareToken } from './domain/share-token.js';
import { RecipeImageModel } from './models/recipe-image.model.js';
import { RecipeModel } from './models/recipe.model.js';
import {
  markSeen,
  removeMember,
  requireObjectId,
  requireRecipe,
  upsertMember,
} from './services/recipe-access.service.js';
import { ensureCategories } from './services/category.service.js';
import { importRecipeFromUrl } from './services/recipe-import.service.js';
import { RECIPE_SCOPES } from './scopes.js';

// Endpointi pod /api/v1/recipes* — glej specs/013-recipes/contracts/openapi.yaml.
// Javne poti (`/shared-recipes/*`) so v `public.router.ts`, ker zanje ne velja `requireScopes`.
//
// VRSTNI RED POTI JE POMEMBEN. Express ujame prvo ujemajočo se pot in `/recipes/:recipeId` bi
// ujel tudi morebitno statično pot z enim segmentom. Statične poti z enakim številom segmentov
// morajo biti zato deklarirane PRED parametričnimi (ista opomba kot modules/notes/router.ts,
// modules/saved-links/router.ts in modules/cameras/router.ts, kjer je bila to prava napaka v
// usmerjanju).
//
// DOSTOP gre IZKLJUČNO skozi `requireRecipe` (services/recipe-access.service.ts). Nikjer v tej
// datoteki ni `RecipeModel.findOne` z ročno sestavljenim pogojem lastništva — model dostopa je
// sestavljen (lastnik ALI soudeleženec) in bi se razpršen po dvajsetih poteh prej ali slej razšel.
export const recipesRouter = Router();

// ─────────────────────────── oblika odgovora ───────────────────────────

interface RecipeLean {
  _id: Types.ObjectId;
  ownerId: Types.ObjectId;
  title: string;
  url: string | null;
  description: string | null;
  ingredients: string[];
  steps: string[];
  prepMinutes: number | null;
  servings: number | null;
  tags: string[];
  categories: string[];
  rating: number | null;
  lastCookedAt: Date | null;
  cookCount: number;
  coverImageId: Types.ObjectId | null;
  members: { userId: Types.ObjectId; role: MemberRole; addedAt: Date; seenAt: Date | null }[];
  publicShare: { token: string; createdAt: Date; revokedAt: Date | null } | null;
  sourceStatus: 'none' | 'ok' | 'skipped' | 'failed';
  sourceFetchedAt: Date | null;
  lastModifiedBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

interface PersonSummary {
  id: string;
  displayName: string;
  initials: string;
}

/**
 * Oblika recepta v odgovoru (pogodba, `Recipe`).
 *
 * Trije podatki so tu IZPELJANI in ne shranjeni, vsak iz svojega razloga:
 *
 *  - `capabilities` — kaj ta klicatelj sme. Vmesnik iz tega izriše kontrole in ničesar ne ugiba
 *    (člen XI, FR-064). Brez tega bi vsak odjemalec po svoje sklepal iz vloge in bi se prej ali
 *    slej zmotil v smer, ki pokaže gumb, ki vrne 403 (SC-007).
 *  - `isNew` — ali soudeleženec recepta še ni odprl (FR-038). Izpeljano iz `seenAt` TEGA
 *    klicatelja; za lastnika je vedno `false`.
 *  - `publicLink` — sestavljen iz `PUBLIC_BASE_URL` ob branju in NE shranjen: naslov namestitve
 *    je nastavitev okolja in bi se ob selitvi domene tiho pokvaril v vsakem starem zapisu.
 *
 * `members` vsebuje IMENA, ki pridejo iz imenika (`people`), ne iz zapisa — v zapisu so samo
 * identifikatorji (FR-039), da preimenovanje v Keycloaku ne pusti zamrznjene kopije. Soudeleženec,
 * ki ga imenik ne pozna več, IZPADE iz izpisa namesto da bi obvisel kot prazna vrstica (Edge Case).
 */
function toRecipeResponse(
  doc: RecipeLean,
  viewerId: string,
  people: Map<string, PersonSummary>,
  imageCount: number,
) {
  const isOwner = String(doc.ownerId) === viewerId;
  const membership = doc.members.find((m) => String(m.userId) === viewerId);
  const role = isOwner ? 'owner' : (membership?.role ?? 'view');
  const publicShare = doc.publicShare && !doc.publicShare.revokedAt ? doc.publicShare : null;

  return {
    id: String(doc._id),
    title: doc.title,
    url: doc.url ?? null,
    /** Drobna oznaka vira v seznamu ("okusno.si"). Izpeljana, ne shranjena — naslov je resnica. */
    sourceHost: hostLabel(doc.url),
    description: doc.description ?? null,
    ingredients: doc.ingredients ?? [],
    steps: doc.steps ?? [],
    prepMinutes: doc.prepMinutes ?? null,
    servings: doc.servings ?? null,
    tags: doc.tags ?? [],
    categories: doc.categories ?? [],
    rating: doc.rating ?? null,
    lastCookedAt: doc.lastCookedAt ?? null,
    cookCount: doc.cookCount ?? 0,
    coverImageId: doc.coverImageId ? String(doc.coverImageId) : null,
    imageCount,
    sourceStatus: doc.sourceStatus,
    sourceFetchedAt: doc.sourceFetchedAt ?? null,
    isOwn: isOwner,
    owner: people.get(String(doc.ownerId)) ?? null,
    members: doc.members
      .map((m) => {
        const person = people.get(String(m.userId));
        return person ? { ...person, role: m.role, addedAt: m.addedAt, seenAt: m.seenAt ?? null } : null;
      })
      .filter((m): m is NonNullable<typeof m> => m !== null),
    isNew: Boolean(membership && membership.seenAt === null),
    publicLink: publicShare
      ? {
          url: buildRecipeShareUrl(loadEnv().PUBLIC_BASE_URL, publicShare.token),
          createdAt: publicShare.createdAt,
        }
      : null,
    lastModifiedBy: doc.lastModifiedBy ? (people.get(String(doc.lastModifiedBy)) ?? null) : null,
    capabilities: capabilitiesFor(role),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

/**
 * Imena vseh oseb, ki nastopajo v teh receptih, v ENI poizvedbi.
 *
 * Brez tega bi bil izpis seznama N+1: recept s tremi soudeleženci bi pomenil štiri poizvedbe, in
 * sto receptov nekaj sto. Enak vzorec kot v modulu 010.
 */
async function peopleFor(recipes: RecipeLean[]): Promise<Map<string, PersonSummary>> {
  const ids = new Set<string>();
  for (const recipe of recipes) {
    ids.add(String(recipe.ownerId));
    if (recipe.lastModifiedBy) ids.add(String(recipe.lastModifiedBy));
    for (const member of recipe.members) ids.add(String(member.userId));
  }
  const summaries = await readUserSummaries([...ids]);
  // `emailHint` se pri ŽE DODANIH soudeležencih NE pokaže (vzorec FR-074 iz modula 010): pri
  // izbiri osebe loči soimenjaka, pri izpisu pa je le e-pošta, razdana vsem, ki recept vidijo.
  return new Map(
    [...summaries].map(([id, s]) => [id, { id: s.id, displayName: s.displayName, initials: s.initials }]),
  );
}

/** Koliko slik ima vsak od teh receptov — ena združevalna poizvedba namesto N klicev. Bajtov NE
 * prenese (FR-025, SC-005): `$group` nad `recipeId` se `data` niti ne dotakne. */
async function imageCountsFor(recipeIds: Types.ObjectId[]): Promise<Map<string, number>> {
  if (recipeIds.length === 0) return new Map();
  const rows = await RecipeImageModel.aggregate<{ _id: Types.ObjectId; count: number }>([
    { $match: { recipeId: { $in: recipeIds } } },
    { $group: { _id: '$recipeId', count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((row) => [String(row._id), row.count]));
}

/**
 * V čigavem imenu teče ta zahteva.
 *
 * Klicatelj z API ključem nima osebnega `subjectId` (API ključi niso vezani na uporabnika — člen
 * III), zato se lastnik razreši enako kot pri 009/010 (FR-062). Brez tega US9 (n8n shrani recept)
 * ne bi imela komu zapisati.
 */
async function actorUserId(req: Request): Promise<string> {
  if (req.auth?.subjectType === 'user') return req.auth.subjectId;
  const ownerId = await resolveAutomationOwnerUserId();
  if (!ownerId) {
    throw notFound(
      'Avtomatizacija ne more ugotoviti, na katerega uporabnika se nanaša — ni podedovanih podatkov niti natanko enega uporabnika.',
    );
  }
  return ownerId;
}

/** Cel recept v obliki odgovora, prebran znova po pisanju. Pisanja gredo prek operatorjev in ne
 * vračajo celega dokumenta v obliki, ki jo potrebuje odgovor; enotno ponovno branje je ceneje od
 * tega, da bi vsaka pot sestavljala odgovor po svoje in se pri tem razhajala. */
async function respondWithRecipe(recipeId: string, viewerId: string): Promise<unknown> {
  const doc = await RecipeModel.findById(recipeId).lean<RecipeLean | null>();
  if (!doc) throw notFound('Recept ne obstaja.');
  const people = await peopleFor([doc]);
  const counts = await imageCountsFor([doc._id]);
  return toRecipeResponse(doc, viewerId, people, counts.get(String(doc._id)) ?? 0);
}

// ─────────────────────────── seznam in nastanek ───────────────────────────

recipesRouter.get('/recipes', requireScopes(RECIPE_SCOPES.read), async (req, res, next) => {
  try {
    const params = recipesQuerySchema.parse(req.query);
    const userId = await actorUserId(req);
    const filter = buildRecipesFilter({
      userId,
      query: params.q,
      tag: params.tag,
      category: params.category,
      scope: params.scope,
    });

    // `cooked` naraščajoče: Mongo uvrsti `null` NAJNIŽE, zato so nikoli kuhani na vrhu in za njimi
    // najdlje nekuhani — natanko vrstni red iz FR-053. Posebnega ravnanja z `null` zato ni treba.
    const sort: Record<string, SortOrder> =
      params.sort === 'title'
        ? { title: 1 }
        : params.sort === 'rating'
          ? { rating: -1, updatedAt: -1 }
          : params.sort === 'cooked'
            ? { lastCookedAt: 1 }
            : { updatedAt: -1 };

    const query = RecipeModel.find(filter).sort(sort);
    if (params.limit !== undefined) query.limit(params.limit);
    const recipes = await query.lean<RecipeLean[]>();

    const people = await peopleFor(recipes);
    const counts = await imageCountsFor(recipes.map((r) => r._id));

    res.json({
      recipes: recipes.map((recipe) =>
        toRecipeResponse(recipe, userId, people, counts.get(String(recipe._id)) ?? 0),
      ),
    });
  } catch (err) {
    next(err);
  }
});

recipesRouter.post('/recipes', requireScopes(RECIPE_SCOPES.write), async (req, res, next) => {
  try {
    const body = recipeWriteSchema.parse(req.body);
    const userId = await actorUserId(req);

    const url = normalizeOptionalRecipeUrl(body.url);
    if (!url.ok) throw badRequest(url.message);

    const ingredients = splitLines(body.ingredients ?? [], {
      maxItems: MAX_INGREDIENTS,
      maxLength: MAX_INGREDIENT_LENGTH,
    });
    const steps = splitLines(body.steps ?? [], { maxItems: MAX_STEPS, maxLength: MAX_STEP_LENGTH });
    const { tags, tagKeys } = normalizeTags(body.tags);
    const { categories, categoryKeys } = normalizeCategories(body.categories);

    // ZAPIS NASTANE PRED BRANJEM STRANI (FR-012). To ni optimizacija, ampak zahteva: shranjevanje
    // ne sme biti odvisno od dosegljivosti tuje strani, in ob neuspehu se zapis NE razveljavi.
    // Ista odločitev kot `POST /saved-links` v modulu 008, kjer je bila prvotna izvedba narobe.
    const created = await RecipeModel.create({
      ownerId: userId,
      title: body.title,
      url: url.url ?? null,
      description: body.description ?? null,
      ingredients: ingredients.items,
      steps: steps.items,
      prepMinutes: body.prepMinutes ?? null,
      servings: body.servings ?? null,
      tags,
      tagKeys,
      categories,
      categoryKeys,
      rating: body.rating ?? null,
      searchText: buildSearchText({
        title: body.title,
        description: body.description,
        ingredients: ingredients.items,
        tags,
        categories,
      }),
      sourceStatus: 'none',
      lastModifiedBy: userId,
    });

    // Besednjak se dopolni PO nastanku recepta in njegov neuspeh recepta ne razveljavi: imena
    // kategorij so zapisana v receptu in so veljavna tudi brez vnosa v besednjaku
    // (services/category.service.ts). Besednjak je udobje izbirnika, ne pogoj zapisa.
    await ensureCategories(userId, categories);

    // Šele zdaj branje strani, znotraj proračuna. Izid je v `sourceStatus` in ne v statusu
    // odgovora — 201 velja tudi, kadar strani ni bilo mogoče prebrati.
    if (url.url && body.importFromUrl) {
      await applyImport(String(created._id), url.url, {
        // Ob NASTANKU se izpolnijo samo polja, ki jih uporabnik ni poslal. Uvožena vrednost nikoli
        // ne prepiše vpisane (FR-014) — človek, ki je ime popravil, ga je popravil z namenom.
        overwrite: false,
        actorUserId: userId,
      });
    }

    res.status(201).json(await respondWithRecipe(String(created._id), userId));
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────── en recept ───────────────────────────

recipesRouter.get('/recipes/:recipeId', requireScopes(RECIPE_SCOPES.read), async (req, res, next) => {
  try {
    const userId = await actorUserId(req);
    const access = await requireRecipe(userId, String(req.params.recipeId), 'readRecipe');
    // Odprtje pobriše oznako "novo" (FR-038). Za lastnika je prazno dejanje.
    await markSeen(access.recipeId, userId);
    res.json(await respondWithRecipe(access.recipeId, userId));
  } catch (err) {
    next(err);
  }
});

recipesRouter.patch('/recipes/:recipeId', requireScopes(RECIPE_SCOPES.write), async (req, res, next) => {
  try {
    const body = recipePatchSchema.parse(req.body);
    const userId = await actorUserId(req);
    const access = await requireRecipe(userId, String(req.params.recipeId), 'editRecipe');

    // Ocena je LASTNIKOVA (FR-035). Preverba je ločena in ne del `editRecipe`, ker je to edino
    // polje v telesu, ki ima strožjo zahtevo od ostalih — soudeleženec z urejanjem sme popraviti
    // sestavino, ne pa oceniti tujega recepta.
    if (body.rating !== undefined) {
      await requireRecipe(userId, access.recipeId, 'rateRecipe');
    }

    const update: Record<string, unknown> = { lastModifiedBy: userId };

    if (body.title !== undefined) update.title = body.title;

    if (body.url !== undefined) {
      const url = normalizeOptionalRecipeUrl(body.url);
      if (!url.ok) throw badRequest(url.message);
      update.url = url.url ?? null;
      // Uvoz se ob spremembi naslova NE sproži samodejno (FR-013): popravek naslova ne sme
      // pomeniti tihega odhodnega klica. Za to je `POST /recipes/{id}/import`.
      //
      // Stanje vira se vseeno ponastavi na `none` — ne glede na to, ali je naslov nov ali
      // pobrisan. Star izid se je nanašal na STAR naslov in bi bil ob novem zavajajoč: "stran
      // prebrana" bi ostalo zapisano ob naslovu, ki ga ni nihče nikoli obiskal.
      update.sourceStatus = 'none';
      update.sourceFetchedAt = null;
    }

    // Prazen niz in `null` sta POMENSKI vrednosti ("pobriši") in se ločita od `undefined` ("ne
    // spreminjaj") — ne prek `??` (ista past kot pri beležkah in shranjenih straneh).
    if (body.description !== undefined) update.description = body.description === null ? null : body.description;
    if (body.prepMinutes !== undefined) update.prepMinutes = body.prepMinutes ?? null;
    if (body.servings !== undefined) update.servings = body.servings ?? null;
    if (body.rating !== undefined) update.rating = body.rating ?? null;

    if (body.ingredients !== undefined) {
      update.ingredients = splitLines(body.ingredients, {
        maxItems: MAX_INGREDIENTS,
        maxLength: MAX_INGREDIENT_LENGTH,
      }).items;
    }
    if (body.steps !== undefined) {
      update.steps = splitLines(body.steps, { maxItems: MAX_STEPS, maxLength: MAX_STEP_LENGTH }).items;
    }
    if (body.tags !== undefined) {
      const normalized = normalizeTags(body.tags);
      update.tags = normalized.tags;
      update.tagKeys = normalized.tagKeys;
    }
    if (body.categories !== undefined) {
      const normalized = normalizeCategories(body.categories);
      update.categories = normalized.categories;
      update.categoryKeys = normalized.categoryKeys;
      // Besednjak KLICATELJA, tudi kadar ureja tuj deljen recept — glej ensureCategories().
      await ensureCategories(userId, normalized.categories);
    }

    // `searchText` se izpelje iz STANJA PO posodobitvi, zato je treba poznati tudi polja, ki jih
    // to telo ni poslalo. Branje je zato tu in ne prej: brati je treba natanko enkrat.
    const current = await RecipeModel.findById(access.recipeId)
      .select('title description ingredients tags categories')
      .lean<{
        title: string;
        description: string | null;
        ingredients: string[];
        tags: string[];
        categories: string[];
      } | null>();
    if (!current) throw notFound('Recept ne obstaja.');

    update.searchText = buildSearchText({
      title: (update.title as string) ?? current.title,
      description: (update.description as string | null) ?? current.description,
      ingredients: (update.ingredients as string[]) ?? current.ingredients,
      tags: (update.tags as string[]) ?? current.tags,
      categories: (update.categories as string[]) ?? current.categories,
    });

    await RecipeModel.updateOne({ _id: access.recipeId }, { $set: update });
    res.json(await respondWithRecipe(access.recipeId, userId));
  } catch (err) {
    next(err);
  }
});

recipesRouter.delete('/recipes/:recipeId', requireScopes(RECIPE_SCOPES.write), async (req, res, next) => {
  try {
    const userId = await actorUserId(req);
    const access = await requireRecipe(userId, String(req.params.recipeId), 'deleteRecipe');

    // VRSTNI RED JE POMEMBEN: slike se pobrišejo PRED receptom. Obraten vrstni red bi ob napaki
    // med brisanjem pustil slike brez recepta — te ne bi bile vidne nikjer in jih ne bi imel kdo
    // pobrisati (FR-026). Recept brez slik je za trenutek veljavno stanje, slika brez recepta ni.
    await RecipeImageModel.deleteMany({ recipeId: access.recipeId });
    await RecipeModel.deleteOne({ _id: access.recipeId });

    // Izbris ubije tudi javno povezavo (FR-048) — brez posebnega koraka: žeton je živel v
    // izbrisanem dokumentu in ga javna pot od zdaj ne najde.
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

/** Odpira se lahko tudi brez branja celega recepta (npr. ploščica) — zato svoja pot in ne samo
 * stranski učinek `GET`. Za lastnika je prazno dejanje in ne napaka. */
recipesRouter.post('/recipes/:recipeId/seen', requireScopes(RECIPE_SCOPES.read), async (req, res, next) => {
  try {
    const userId = await actorUserId(req);
    const access = await requireRecipe(userId, String(req.params.recipeId), 'readRecipe');
    await markSeen(access.recipeId, userId);
    res.json(await respondWithRecipe(access.recipeId, userId));
  } catch (err) {
    next(err);
  }
});

/**
 * "Skuhal sem" (FR-008, US8).
 *
 * Datum in števec se spremenita SAMO tu in nikoli kot stranski učinek urejanja: recept, ki bi se
 * ob vsakem popravku tipkarske napake označil za skuhanega, bi razvrstitev "kaj že dolgo ni bilo
 * na mizi" naredil neuporabno.
 *
 * `$max` in ne `$set`: vnos za nazaj ("skuhal sem v nedeljo") ne sme pomakniti datuma NAZAJ, če je
 * bilo med tem kuhano pozneje. Števec se poveča v obeh primerih, ker je bilo kuhano res.
 */
recipesRouter.post('/recipes/:recipeId/cooked', requireScopes(RECIPE_SCOPES.write), async (req, res, next) => {
  try {
    const body = cookedSchema.parse(req.body ?? {});
    const userId = await actorUserId(req);
    const access = await requireRecipe(userId, String(req.params.recipeId), 'markCooked');

    const cookedAt = body.cookedAt ?? new Date();
    if (cookedAt.getTime() > Date.now() + 60_000) {
      throw badRequest('Datum kuhanja je v prihodnosti.');
    }

    await RecipeModel.updateOne(
      { _id: access.recipeId },
      { $max: { lastCookedAt: cookedAt }, $inc: { cookCount: 1 }, $set: { lastModifiedBy: userId } },
    );

    res.json(await respondWithRecipe(access.recipeId, userId));
  } catch (err) {
    next(err);
  }
});

/**
 * Ponovno branje izvorne strani — EDINI način, da se vsebina uvozi po nastanku zapisa (FR-013).
 * Samodejnega ponovnega branja ni, ker bi pomenilo klicanje tujih strani brez povoda (člen VIII).
 */
recipesRouter.post('/recipes/:recipeId/import', requireScopes(RECIPE_SCOPES.write), async (req, res, next) => {
  try {
    const body = importSchema.parse(req.body ?? {});
    const userId = await actorUserId(req);
    const access = await requireRecipe(userId, String(req.params.recipeId), 'editRecipe');

    const recipe = await RecipeModel.findById(access.recipeId).select('url').lean<{ url: string | null } | null>();
    if (!recipe) throw notFound('Recept ne obstaja.');
    if (!recipe.url) throw badRequest('Ta recept nima naslova strani, s katere bi bilo mogoče uvoziti vsebino.');

    await applyImport(access.recipeId, recipe.url, { overwrite: body.overwrite, actorUserId: userId });

    // 200 tudi ob `failed`: spodletelo branje NI napaka zahteve. Vmesnik je klical, da izve izid,
    // in `502` bi mu vzel prav tisti podatek (ista odločitev kot pri osveževanju v modulu 008).
    res.json(await respondWithRecipe(access.recipeId, userId));
  } catch (err) {
    next(err);
  }
});

/**
 * Uvoz s strani in vpis izida v zapis.
 *
 * `overwrite: false` (privzeto in edina pot ob nastanku) izpolni samo PRAZNA polja. To je
 * uveljavljanje FR-014 in velja za vsa polja, ne le za ime: uvoz je predlog, uporabnikov vnos pa
 * dejstvo, in predlog ne sme povoziti dejstva.
 *
 * `overwrite: true` je izrecna poteza v vmesniku ("prevzemi vse s strani") in prepiše tudi
 * izpolnjena polja — razen tistih, ki jih na strani ni: prazna uvožena vrednost nikoli ne izbriše
 * obstoječe, ker bi bil to izbris brez povoda.
 */
async function applyImport(
  recipeId: string,
  url: string,
  options: { overwrite: boolean; actorUserId: string },
): Promise<void> {
  const result = await importRecipeFromUrl(url);

  const update: Record<string, unknown> = {
    sourceStatus: result.status,
    sourceFetchedAt: result.status === 'skipped' ? null : new Date(),
    lastModifiedBy: options.actorUserId,
  };

  if (result.status === 'ok') {
    const current = await RecipeModel.findById(recipeId).lean<RecipeLean | null>();
    if (!current) return;

    const parsed = result.recipe;
    const take = <T>(incoming: T | null, existing: T, isEmpty: (value: T) => boolean): T => {
      if (incoming === null) return existing;
      if (options.overwrite) return incoming;
      return isEmpty(existing) ? incoming : existing;
    };

    const title = take(parsed.title, current.title, (v) => v.trim().length === 0);
    const description = take(parsed.description, current.description, (v) => !v || v.trim().length === 0);
    const ingredients = take(
      parsed.ingredients.length > 0 ? parsed.ingredients : null,
      current.ingredients,
      (v) => v.length === 0,
    );
    const steps = take(parsed.steps.length > 0 ? parsed.steps : null, current.steps, (v) => v.length === 0);
    const prepMinutes = take(parsed.prepMinutes, current.prepMinutes, (v) => v === null);
    const servings = take(parsed.servings, current.servings, (v) => v === null);
    const tagsSource = take(parsed.tags.length > 0 ? parsed.tags : null, current.tags, (v) => v.length === 0);
    const { tags, tagKeys } = normalizeTags(tagsSource);

    update.title = title;
    update.description = description;
    update.ingredients = splitLines(ingredients, {
      maxItems: MAX_INGREDIENTS,
      maxLength: MAX_INGREDIENT_LENGTH,
    }).items;
    update.steps = splitLines(steps, { maxItems: MAX_STEPS, maxLength: MAX_STEP_LENGTH }).items;
    update.prepMinutes = prepMinutes;
    update.servings = servings;
    update.tags = tags;
    update.tagKeys = tagKeys;
    update.searchText = buildSearchText({
      title,
      description,
      ingredients: update.ingredients as string[],
      tags,
      // Uvoz s strani kategorij NE postavlja — te so uporabnikova razvrstitev, ne podatek strani.
      // V izračun gredo obstoječe, sicer bi jih osvežitev vira tiho vrgla iz iskanja.
      categories: current.categories,
    });
  }

  await RecipeModel.updateOne({ _id: recipeId }, { $set: update });
}

// ─────────────────────────── slike ───────────────────────────

/**
 * `express.raw` samo za to pot: telo je binarna slika, ne JSON. Globalni `express.json()` bi jo
 * poskusil razčleniti in vrnil 400, preden bi pot sploh stekla. Vzorec je prevzet iz
 * `modules/notes/router.ts` (zvočni posnetki).
 *
 * Meja je tu podvojena: `express.raw({ limit })` zavrne prevelik vnos, PREDEN se zbere v pomnilnik,
 * `checkImageUpload` pa pove uporabniku, koliko je preveč. Prva je varovalo strežnika, druga
 * sporočilo — in obe sta potrebni, ker prva vrže napako, ki bi jo obravnavalec pokazal kot 500.
 */
const imageBodyParser: express.RequestHandler = (req, res, next) => {
  const maxMb = loadEnv().RECIPES_IMAGE_MAX_MB;
  express.raw({ type: ['image/*', 'application/octet-stream'], limit: `${maxMb}mb` })(req, res, (err: unknown) => {
    if (err && typeof err === 'object' && (err as { type?: string }).type === 'entity.too.large') {
      next(new ProblemError(413, 'Slika je prevelika', `Največja dovoljena velikost slike je ${maxMb} MB.`));
      return;
    }
    next(err as Error | undefined);
  });
};

recipesRouter.get(
  '/recipes/:recipeId/images',
  requireScopes(RECIPE_SCOPES.read),
  async (req, res, next) => {
    try {
      const userId = await actorUserId(req);
      const access = await requireRecipe(userId, String(req.params.recipeId), 'readRecipe');

      // `data` in `thumb` imata `select: false`, zato ta izpis bajtov NE prenese (FR-025, SC-005)
      // — tudi če bi kdo pozabil na projekcijo.
      const images = await RecipeImageModel.find({ recipeId: access.recipeId })
        .sort({ createdAt: 1 })
        .lean<
          {
            _id: Types.ObjectId;
            mimeType: string;
            byteSize: number;
            width: number | null;
            height: number | null;
            thumbMimeType: string | null;
            caption: string | null;
            createdAt: Date;
          }[]
        >();

      res.json({
        images: images.map((image) => ({
          id: String(image._id),
          mimeType: image.mimeType,
          byteSize: image.byteSize,
          width: image.width ?? null,
          height: image.height ?? null,
          hasThumb: image.thumbMimeType !== null,
          caption: image.caption ?? null,
          isCover: access.coverImageId === String(image._id),
          createdAt: image.createdAt,
        })),
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * Naloži sliko. Telo je SUROVA slika, pomanjšava pa gre v ločeni zahtevi z `?variant=thumb`
 * (glej spodaj) — ne kot multipart.
 *
 * Zakaj ne multipart: ena datoteka na zahtevo ne potrebuje ovoja, ki bi mu na strežniku sledila
 * nova odvisnost (`multer` ali `busboy`). Isti razlog kot pri zvoku beležk.
 */
recipesRouter.post(
  '/recipes/:recipeId/images',
  requireScopes(RECIPE_SCOPES.write),
  imageBodyParser,
  async (req, res, next) => {
    try {
      const params = imageUploadQuerySchema.parse(req.query);
      const userId = await actorUserId(req);
      const access = await requireRecipe(userId, String(req.params.recipeId), 'manageImages');
      const env = loadEnv();

      const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      const check = checkImageUpload(buffer, env.RECIPES_IMAGE_MAX_MB * 1024 * 1024);
      if (!check.ok || !check.mimeType) {
        // `413` za preveliko in `400` za vse ostalo: prva je meja namestitve, druga napaka vnosa,
        // in odjemalec se nanju odzove drugače (pomanjšaj proti izberi drugo datoteko).
        throw check.reason === 'too-large'
          ? new ProblemError(413, 'Slika je prevelika', check.message ?? '')
          : badRequest(check.message ?? 'Slike ni bilo mogoče prebrati.');
      }

      const existing = await RecipeImageModel.countDocuments({ recipeId: access.recipeId });
      if (existing >= env.RECIPES_MAX_IMAGES) {
        throw new ProblemError(
          409,
          'Preveč slik',
          `Recept ima lahko največ ${env.RECIPES_MAX_IMAGES} slik. Katero od obstoječih najprej izbriši.`,
        );
      }

      const image = await RecipeImageModel.create({
        recipeId: access.recipeId,
        ownerId: access.ownerId,
        uploadedBy: userId,
        // IZKLJUČNO iz podpisa datoteke, nikoli iz `Content-Type`, ki ga je poslal odjemalec
        // (FR-021, research.md §6).
        mimeType: check.mimeType,
        byteSize: buffer.length,
        width: params.width ?? null,
        height: params.height ?? null,
        data: buffer,
        caption: params.caption ?? null,
      });

      // Prva slika recepta postane naslovna sama od sebe (FR-024): recept z eno sliko, ki ni
      // naslovna, bi bil v seznamu brez slike, kar uporabnik razume kot napako nalaganja.
      const shouldBeCover = params.cover === true || access.coverImageId === null;
      if (shouldBeCover) {
        await RecipeModel.updateOne(
          { _id: access.recipeId },
          { $set: { coverImageId: image._id, lastModifiedBy: userId } },
        );
      } else {
        await RecipeModel.updateOne({ _id: access.recipeId }, { $set: { lastModifiedBy: userId } });
      }

      res.status(201).json({
        id: String(image._id),
        mimeType: image.mimeType,
        byteSize: image.byteSize,
        width: image.width ?? null,
        height: image.height ?? null,
        hasThumb: false,
        caption: image.caption ?? null,
        isCover: shouldBeCover,
        createdAt: image.createdAt,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * Pomanjšava k že naloženi sliki (research.md §5). Ločena zahteva in ne drugo polje iste, ker je
 * telo surovo in dveh teles ena zahteva nima.
 *
 * Pomanjšava pride od ODJEMALCA in je zato nepreverjen vnos — gre skozi isto preverbo podpisa kot
 * izvirnik, le z nižjo mejo (`RECIPES_THUMB_MAX_KB`). Brez tega bi bila `thumb` odprta vrata za
 * vse, česar `data` ne dovoli.
 */
recipesRouter.put(
  '/recipes/:recipeId/images/:imageId/thumb',
  requireScopes(RECIPE_SCOPES.write),
  imageBodyParser,
  async (req, res, next) => {
    try {
      const userId = await actorUserId(req);
      const access = await requireRecipe(userId, String(req.params.recipeId), 'manageImages');
      const env = loadEnv();

      const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      const check = checkImageUpload(buffer, env.RECIPES_THUMB_MAX_KB * 1024);
      if (!check.ok || !check.mimeType) {
        throw badRequest(check.message ?? 'Pomanjšave ni bilo mogoče prebrati.');
      }

      const updated = await RecipeImageModel.updateOne(
        { _id: requireObjectId(String(req.params.imageId), 'Slika'), recipeId: access.recipeId },
        { $set: { thumb: buffer, thumbMimeType: check.mimeType } },
      );
      if (updated.matchedCount === 0) throw notFound('Slika ne obstaja.');

      res.status(204).end();
    } catch (err) {
      next(err);
    }
  },
);

/**
 * Bajti slike.
 *
 * `?variant=thumb` postreže pomanjšavo, kadar obstaja, sicer izvirnik — odjemalcu ni treba vedeti,
 * ali je pomanjšava nastala, in seznam deluje v obeh primerih (research.md §5).
 *
 * Glave so tu varnostno bistvene in ne okrasne:
 *  - `Content-Type` je IZ ZAPISA, kamor je prišel iz podpisa datoteke — nikoli iz zahteve.
 *  - `X-Content-Type-Options: nosniff` prepove brskalniku, da bi vrsto uganil sam.
 *  - `Content-Disposition: inline` z OČIŠČENIM imenom: uporabnikovo ime datoteke gre v glavo in
 *    narekovaj ali prelom vrstice v njej bi bil vbrizg v glavo (domain/image-type.ts).
 *  - `Cache-Control: private`, ker gre pot skozi uporabnikovo sejo: pred nami je skupni Caddy in
 *    slika deljenega recepta ne sme pristati v skupnem predpomnilniku posrednika (člen II).
 */
recipesRouter.get(
  '/recipes/:recipeId/images/:imageId',
  requireScopes(RECIPE_SCOPES.read),
  async (req, res, next) => {
    try {
      const userId = await actorUserId(req);
      const access = await requireRecipe(userId, String(req.params.recipeId), 'readRecipe');

      // `+data +thumb` je nujen: obe polji imata `select: false` (glej recipe-image.model.ts), da
      // ju noben izpis ne prenese.
      const image = await RecipeImageModel.findOne({
        _id: requireObjectId(String(req.params.imageId), 'Slika'),
        recipeId: access.recipeId,
      }).select('+data +thumb');
      if (!image) throw notFound('Slika ne obstaja.');

      const wantsThumb = String(req.query.variant ?? '') === 'thumb';
      const useThumb = wantsThumb && image.thumb && image.thumbMimeType;
      const body = useThumb ? image.thumb : image.data;
      const mimeType = useThumb ? image.thumbMimeType! : image.mimeType;

      res.setHeader('Content-Type', mimeType);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${safeImageFileName(image.caption, mimeType)}"`,
      );
      res.setHeader('Cache-Control', 'private, max-age=86400');
      res.send(body);
    } catch (err) {
      next(err);
    }
  },
);

recipesRouter.patch(
  '/recipes/:recipeId/images/:imageId',
  requireScopes(RECIPE_SCOPES.write),
  async (req, res, next) => {
    try {
      const userId = await actorUserId(req);
      const access = await requireRecipe(userId, String(req.params.recipeId), 'manageImages');
      const imageId = requireObjectId(String(req.params.imageId), 'Slika');

      const image = await RecipeImageModel.findOne({ _id: imageId, recipeId: access.recipeId })
        .select('_id')
        .lean();
      if (!image) throw notFound('Slika ne obstaja.');

      const caption = req.body?.caption;
      if (caption !== undefined) {
        await RecipeImageModel.updateOne(
          { _id: imageId },
          { $set: { caption: caption === null ? null : String(caption).slice(0, 200) } },
        );
      }
      if (req.body?.cover === true) {
        await RecipeModel.updateOne(
          { _id: access.recipeId },
          { $set: { coverImageId: imageId, lastModifiedBy: userId } },
        );
      }

      res.json(await respondWithRecipe(access.recipeId, userId));
    } catch (err) {
      next(err);
    }
  },
);

recipesRouter.delete(
  '/recipes/:recipeId/images/:imageId',
  requireScopes(RECIPE_SCOPES.write),
  async (req, res, next) => {
    try {
      const userId = await actorUserId(req);
      const access = await requireRecipe(userId, String(req.params.recipeId), 'manageImages');
      const imageId = requireObjectId(String(req.params.imageId), 'Slika');

      const deleted = await RecipeImageModel.findOneAndDelete({ _id: imageId, recipeId: access.recipeId })
        .select('_id')
        .lean();
      if (!deleted) throw notFound('Slika ne obstaja.');

      // Naslovna slika je bila pravkar izbrisana → naslovna postane NAJSTAREJŠA preostala, sicer
      // `null` (FR-024). Recept brez slike je veljaven recept in "naslovne ni" je pravilno stanje,
      // ne napaka — zato tu ni nadomestne slike ne zavrnitve brisanja.
      if (access.coverImageId === String(imageId)) {
        const next = await RecipeImageModel.findOne({ recipeId: access.recipeId })
          .sort({ createdAt: 1 })
          .select('_id')
          .lean<{ _id: Types.ObjectId } | null>();
        await RecipeModel.updateOne(
          { _id: access.recipeId },
          { $set: { coverImageId: next ? next._id : null, lastModifiedBy: userId } },
        );
      } else {
        await RecipeModel.updateOne({ _id: access.recipeId }, { $set: { lastModifiedBy: userId } });
      }

      res.status(204).end();
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────── deljenje med uporabniki ───────────────────────────

/**
 * Doda soudeleženca ali mu spremeni vlogo (FR-030, FR-031).
 *
 * Pod obsegom `recipes:share` in NE `recipes:write` (FR-061): to je edina skupina operacij, ki
 * zadene človeka, ki ni klicatelj.
 */
recipesRouter.put(
  '/recipes/:recipeId/members/:userId',
  requireScopes(RECIPE_SCOPES.share),
  async (req, res, next) => {
    try {
      const body = memberRoleSchema.parse(req.body);
      const userId = await actorUserId(req);
      const access = await requireRecipe(userId, String(req.params.recipeId), 'manageSharing');
      const memberId = requireObjectId(String(req.params.userId), 'Uporabnik');

      // Lastnik samega sebe ne more dodati med soudeležence (FR-037): lastništvo ni stopnja
      // soudeleženca in dva vira vloge za isto osebo sta stanje, na katero `roleFor` nima
      // enoličnega odgovora.
      if (memberId === access.ownerId) {
        throw badRequest('Lastnik je že lastnik — med soudeležence se ne dodaja.');
      }

      // Uporabnik, ki se še nikoli ni prijavil, se ne more prijaviti tudi po tem, ko mu recept
      // delimo (FR-036) — ponudili bi mu dostop, ki ga ne more uporabiti.
      if (!(await isShareableUser(memberId))) {
        throw badRequest('Tega uporabnika ni ali se še nikoli ni prijavil, zato mu recepta ni mogoče deliti.');
      }

      const ok = await upsertMember(access.recipeId, memberId, body.role, userId);
      if (!ok) throw notFound('Recept ne obstaja.');

      res.json(await respondWithRecipe(access.recipeId, userId));
    } catch (err) {
      next(err);
    }
  },
);

recipesRouter.delete(
  '/recipes/:recipeId/members/:userId',
  requireScopes(RECIPE_SCOPES.share),
  async (req, res, next) => {
    try {
      const userId = await actorUserId(req);
      const access = await requireRecipe(userId, String(req.params.recipeId), 'manageSharing');
      const memberId = requireObjectId(String(req.params.userId), 'Uporabnik');

      await removeMember(access.recipeId, memberId, userId);
      res.json(await respondWithRecipe(access.recipeId, userId));
    } catch (err) {
      next(err);
    }
  },
);

/**
 * Soudeleženec zapusti recept sam (FR-032).
 *
 * Pod `recipes:write` in NE `recipes:share`: odhod ne odpre dostopa nikomur, ampak ga samemu sebi
 * zapre — obseg za deljenje bi tu pomenil, da lahko človek ostane priklenjen na tuj recept, ker
 * mu manjka pravica, ki je sploh ne potrebuje.
 *
 * Vrne `204` in ne recepta: klicatelj ga po tem ne sme več videti.
 */
recipesRouter.post('/recipes/:recipeId/leave', requireScopes(RECIPE_SCOPES.write), async (req, res, next) => {
  try {
    const userId = await actorUserId(req);
    const access = await requireRecipe(userId, String(req.params.recipeId), 'leaveRecipe');
    await removeMember(access.recipeId, userId, userId);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────── javna povezava ───────────────────────────

/**
 * Izda javno povezavo (FR-040).
 *
 * Pod `recipes:share`, skupaj z deljenjem uporabnikom in iz istega razloga — s to potezo recept
 * zapusti to namestitev.
 *
 * Ponovni klic pri ŽIVI povezavi vrne obstoječo in ne izda nove: dva naslova do istega recepta bi
 * pomenila, da preklic enega pusti drugega pri življenju, in lastnik bi mislil, da je zaprl dostop.
 * Za nov žeton je treba starega najprej preklicati (FR-045).
 */
recipesRouter.post(
  '/recipes/:recipeId/public-link',
  requireScopes(RECIPE_SCOPES.share),
  async (req, res, next) => {
    try {
      const userId = await actorUserId(req);
      const access = await requireRecipe(userId, String(req.params.recipeId), 'managePublicLink');

      if (!access.publicShareToken) {
        await RecipeModel.updateOne(
          { _id: access.recipeId },
          {
            $set: {
              publicShare: {
                token: generateRecipeShareToken(),
                createdAt: new Date(),
                revokedAt: null,
              },
              lastModifiedBy: userId,
            },
          },
        );
      }

      res.status(201).json(await respondWithRecipe(access.recipeId, userId));
    } catch (err) {
      next(err);
    }
  },
);

/**
 * Prekliče javno povezavo (FR-044).
 *
 * Zapis se OBDRŽI z `revokedAt` in se ne pobriše: brisanje bi izbrisalo tudi dejstvo, da je
 * povezava obstajala. Javna pot preverja `revokedAt`, zato je preklic takojšen.
 */
recipesRouter.delete(
  '/recipes/:recipeId/public-link',
  requireScopes(RECIPE_SCOPES.share),
  async (req, res, next) => {
    try {
      const userId = await actorUserId(req);
      const access = await requireRecipe(userId, String(req.params.recipeId), 'managePublicLink');

      await RecipeModel.updateOne(
        { _id: access.recipeId, 'publicShare.revokedAt': null },
        { $set: { 'publicShare.revokedAt': new Date(), lastModifiedBy: userId } },
      );

      res.json(await respondWithRecipe(access.recipeId, userId));
    } catch (err) {
      next(err);
    }
  },
);

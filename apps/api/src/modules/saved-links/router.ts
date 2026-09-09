import { Router, type Request } from 'express';
import { Types, type SortOrder } from 'mongoose';
import { resolveAutomationOwnerUserId } from '../../platform/auth/automation-owner.js';
import { requireScopes } from '../../platform/auth/scopes.js';
import { loadEnv } from '../../platform/config/env.js';
import { badRequest, notFound } from '../../platform/errors/problem.js';
import { SavedLinkModel } from './models/saved-link.model.js';
import { SavedLinkGroupModel } from './models/saved-link-group.model.js';
import { toOrderAssignments } from '../../domain/camera-order.js';
import {
  buildLinksFilter,
  deriveLinkTitle,
  groupCreateSchema,
  groupOrderSchema,
  groupPatchSchema,
  linkOrderSchema,
  linkPatchSchema,
  linkWriteSchema,
  linksQuerySchema,
  parseGroupIdParam,
  refreshMetadataSchema,
} from './domain/link-input.js';
import { hostLabel, normalizeLinkUrl } from './domain/link-url.js';
import { buildSearchText } from './domain/search-text.js';
import { readLinkMetadata } from './services/link-metadata.service.js';
import { FaviconUnavailableError, getFaviconBytes } from './services/favicon.service.js';
import { SAVED_LINK_SCOPES } from './scopes.js';

// Endpointi pod /api/v1/saved-links* in /api/v1/saved-link-groups* — glej
// specs/008-saved-links/contracts/openapi.yaml.
//
// VRSTNI RED POTI JE POMEMBEN. Express ujame prvo ujemajočo se pot, `/saved-links/:linkId` pa
// se ujame tudi z `/saved-links/order`. Statične poti z enakim številom segmentov morajo biti
// zato deklarirane PRED parametričnimi (ista opomba kot modules/notes/router.ts in
// modules/cameras/router.ts, kjer je bila to prava napaka v usmerjanju).
export const savedLinksRouter = Router();
export const savedLinkGroupsRouter = Router();

type SavedLinkLean = {
  _id: unknown;
  url: string;
  title: string;
  titleSource: 'manual' | 'auto';
  comment: string | null;
  icon: string | null;
  faviconUrl: string | null;
  groupId: unknown;
  order: number;
  metadataStatus: 'ok' | 'skipped' | 'failed';
  metadataFetchedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type SavedLinkGroupLean = {
  _id: unknown;
  name: string;
  order: number;
  collapsed: boolean;
};

/**
 * Oblika zapisa v odgovoru (pogodba, `SavedLink`).
 *
 * `faviconUrl` NI v odgovoru — namesto njega je `hasFavicon`. Naslov favicona kaže na tujega
 * gostitelja, in če bi ga odjemalec dobil, bi ga slej ko prej postavil v `<img src>` — kar je
 * natanko tisto, kar člen VIII prepoveduje (SC-005). Bajti gredo prek
 * `GET /saved-links/{linkId}/favicon`.
 */
function toLinkResponse(doc: SavedLinkLean) {
  return {
    id: String(doc._id),
    url: doc.url,
    title: doc.title,
    titleSource: doc.titleSource,
    comment: doc.comment ?? null,
    icon: doc.icon ?? null,
    hasFavicon: Boolean(doc.faviconUrl),
    groupId: doc.groupId ? String(doc.groupId) : null,
    order: doc.order,
    metadataStatus: doc.metadataStatus,
    metadataFetchedAt: doc.metadataFetchedAt ?? null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function toGroupResponse(doc: SavedLinkGroupLean, linkCount: number) {
  return {
    id: String(doc._id),
    name: doc.name,
    order: doc.order,
    collapsed: doc.collapsed,
    linkCount,
  };
}

/**
 * V čigavem imenu teče ta zahteva.
 *
 * Klicatelj z API ključem nima osebnega `subjectId` (API ključi niso vezani na uporabnika —
 * člen III), zato se lastnik razreši enako kot pri 009/010. Brez tega US6 (n8n shrani link)
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

/** Neveljaven ObjectId bi v Mongoose vrgel CastError, ki se navzven pokaže kot 500 — za
 * uporabnika, ki je odprl staro povezavo, je to 404 (enako kot modules/notes/router.ts). */
function requireObjectId(value: string, what: string): string {
  if (!Types.ObjectId.isValid(value)) throw notFound(`${what} ne obstaja.`);
  return value;
}

/** Zapis tega uporabnika ali 404 — nikoli 403: obstoj tujega zapisa ni podatek, ki bi ga
 * API smel razkriti (FR-006, vzorec `findCameraOr404` po 004). */
async function findLinkOr404(userId: string, linkId: string) {
  const link = await SavedLinkModel.findOne({ _id: requireObjectId(linkId, 'Zapis'), userId });
  if (!link) throw notFound('Zapis ne obstaja.');
  return link;
}

/** Mapa tega uporabnika ali 404 — iz istega razloga kot zgoraj. */
async function findGroupOr404(userId: string, groupId: string) {
  const group = await SavedLinkGroupModel.findOne({ _id: requireObjectId(groupId, 'Mapa'), userId });
  if (!group) throw notFound('Mapa ne obstaja.');
  return group;
}

// ─────────────────────────── zapisi ───────────────────────────

savedLinksRouter.get('/saved-links', requireScopes(SAVED_LINK_SCOPES.read), async (req, res, next) => {
  try {
    const params = linksQuerySchema.parse(req.query);
    const userId = await actorUserId(req);
    const filter = buildLinksFilter({
      userId,
      query: params.q,
      groupId: parseGroupIdParam(params.groupId),
    });

    // `manual` = uporabnikov vrstni red; `recent` = po času nastanka navzdol, kar uporablja
    // ploščica na nadzorni plošči (FR-050). Oba vrstna reda imata svoj indeks
    // (saved-link.model.ts), zato Mongo ne sortira v pomnilniku.
    const sort: Record<string, SortOrder> =
      params.sort === 'recent' ? { createdAt: -1 } : { groupId: 1, order: 1 };

    const query = SavedLinkModel.find(filter).sort(sort);
    if (params.limit !== undefined) query.limit(params.limit);
    const links = await query.lean<SavedLinkLean[]>();

    res.json({ links: links.map(toLinkResponse) });
  } catch (err) {
    next(err);
  }
});

savedLinksRouter.post('/saved-links', requireScopes(SAVED_LINK_SCOPES.write), async (req, res, next) => {
  try {
    const body = linkWriteSchema.parse(req.body);
    const userId = await actorUserId(req);

    const normalized = normalizeLinkUrl(body.url);
    if (!normalized.ok) throw badRequest(normalized.message);
    const url = normalized.url;

    // Mapa se preveri PRED nastankom zapisa: zapis, ki bi tiho pristal med nerazvrščenimi,
    // ker mapa ne obstaja, bi bil videti kot izgubljen (pogodba: 404).
    const groupId = body.groupId ? String((await findGroupOr404(userId, body.groupId))._id) : null;

    // Dvojnik je DOVOLJEN in se samo javi (research.md §10). Iščemo pred vstavljanjem, da
    // najdemo prejšnji zapis in ne tega, ki ga ravno ustvarjamo.
    const duplicate = await SavedLinkModel.findOne({ userId, url }).select('_id').lean();

    // Nov zapis gre na VRH svoje mape (FR-033): nazadnje shranjeno je najbolj verjetno
    // iskano. Najmanjši obstoječi `order` minus eno — brez prepisovanja vseh ostalih.
    const topmost = await SavedLinkModel.findOne({ userId, groupId }).sort({ order: 1 }).select('order').lean();
    const order = topmost ? topmost.order - 1 : 0;

    const title = deriveLinkTitle(body.title, url);
    const comment = body.comment ?? null;

    // ZAPIS NASTANE PRED BRANJEM STRANI (FR-004, research.md §2). To ni optimizacija, ampak
    // zahteva: shranjevanje ne sme biti odvisno od dosegljivosti strani, in ob neuspehu se
    // zapis NE razveljavi.
    const link = await SavedLinkModel.create({
      userId,
      url,
      title,
      titleSource: (body.title ?? '').trim().length > 0 ? 'manual' : 'auto',
      comment,
      icon: body.icon ?? null,
      groupId,
      order,
      searchText: buildSearchText({ title, url, comment }),
      metadataStatus: 'skipped',
    });

    // Šele zdaj branje strani, znotraj proračuna. Izid je v `metadataStatus` in ne v statusu
    // odgovora — 201 velja tudi, kadar strani ni bilo mogoče prebrati.
    const meta = await readLinkMetadata(url);
    link.metadataStatus = meta.status;
    link.metadataFetchedAt = meta.status === 'skipped' ? null : new Date();
    link.faviconUrl = meta.faviconUrl;
    // Prebrano ime se uporabi SAMO, kadar ga uporabnik ni vpisal (FR-014).
    if (meta.title && link.titleSource === 'auto') {
      link.title = meta.title.slice(0, 200);
      link.searchText = buildSearchText({ title: link.title, url, comment });
    }
    await link.save();

    res.status(201).json({
      ...toLinkResponse(link.toObject() as unknown as SavedLinkLean),
      duplicateOfId: duplicate ? String(duplicate._id) : null,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Vrstni red zapisov znotraj ENE mape (FR-032).
 *
 * MORA biti registrirana PRED `/saved-links/:linkId`, sicer bi usmerjevalnik "order" razumel
 * kot ID zapisa.
 *
 * Preslikava seznama v pare `{id, order}` je `toOrderAssignments` iz `domain/camera-order.ts`
 * — čista funkcija, ki je splošna in jo `domain/` sme uporabiti vsak modul (člen I omejuje
 * uvoze med MODULI, ne iz domenske plasti; research.md §7). Ime datoteke je zgodovinsko;
 * preimenovanje bi se dotaknilo 003 in sodi v ločen čistilni PR.
 */
savedLinksRouter.put(
  '/saved-links/order',
  requireScopes(SAVED_LINK_SCOPES.write),
  async (req, res, next) => {
    try {
      const body = linkOrderSchema.parse(req.body);
      const userId = await actorUserId(req);
      const groupId = body.groupId ? String((await findGroupOr404(userId, body.groupId))._id) : null;

      // Vsak poslani ID mora biti uporabnikov IN v navedeni mapi. Brez te preverbe bi seznam
      // z tujim ali drugačno-mapnim ID-jem tiho naredil pol posodobitve — vrstni red bi bil
      // videti shranjen, pa ne bi bil (pogodba: 400).
      const ids = body.linkIds.map(String);
      if (ids.some((id) => !Types.ObjectId.isValid(id))) {
        throw badRequest('Seznam vsebuje neveljaven ID zapisa.');
      }
      const owned = await SavedLinkModel.find({ _id: { $in: ids }, userId, groupId })
        .select('_id')
        .lean();
      if (owned.length !== new Set(ids).size) {
        throw badRequest('Seznam vsebuje ID, ki ni v navedeni mapi.');
      }

      // Posodobijo se SAMO poslani ID-ji; zapisi zunaj seznama ostanejo nedotaknjeni, zato
      // prerazporeditev ene mape ne premeša drugih.
      const assignments = toOrderAssignments(ids);
      await Promise.all(
        assignments.map(({ id, order }) =>
          SavedLinkModel.updateOne({ _id: id, userId, groupId }, { order }),
        ),
      );

      res.status(204).end();
    } catch (err) {
      next(err);
    }
  },
);

// ── En zapis ────────────────────────────────────────────────────────────────────────────
// Vse tri poti so parametrične in MORAJO biti registrirane ZA `/saved-links/order` zgoraj.

savedLinksRouter.get(
  '/saved-links/:linkId',
  requireScopes(SAVED_LINK_SCOPES.read),
  async (req, res, next) => {
    try {
      const userId = await actorUserId(req);
      const link = await findLinkOr404(userId, String(req.params.linkId));
      res.json(toLinkResponse(link.toObject() as unknown as SavedLinkLean));
    } catch (err) {
      next(err);
    }
  },
);

savedLinksRouter.patch(
  '/saved-links/:linkId',
  requireScopes(SAVED_LINK_SCOPES.write),
  async (req, res, next) => {
    try {
      const body = linkPatchSchema.parse(req.body);
      const userId = await actorUserId(req);
      const link = await findLinkOr404(userId, String(req.params.linkId));

      // Ali je ime samo NADOMESTEK (gostitelj starega naslova) — preveri se PRED zamenjavo
      // naslova, ker se po njej gostitelja ni več mogoče primerjati.
      const titleWasHostFallback = link.titleSource === 'auto' && link.title === hostLabel(link.url);

      if (body.url !== undefined) {
        const normalized = normalizeLinkUrl(body.url);
        if (!normalized.ok) throw badRequest(normalized.message);
        link.url = normalized.url;
        // Metapodatki se ob spremembi naslova NE preberejo samodejno (pogodba): popravek
        // naslova ne sme pomeniti tihega odhodnega klica. Za to je `/refresh-metadata`.
        //
        // Nadomestno ime pa mora slediti novemu naslovu: zapis, ki bi po zamenjavi naslova
        // ostal poimenovan po STAREM gostitelju, bi bil v seznamu zavajajoč. Ime, ki je bilo
        // prebrano s strani ali vpisano ročno, se NE dotakne — tam bi bila to izguba podatka.
        if (titleWasHostFallback) link.title = deriveLinkTitle('', link.url);
      }

      // Poslano ime pomeni ROČNI vnos in samodejno branje ga po tem ne prepiše več (FR-014).
      if (body.title !== undefined) {
        link.title = deriveLinkTitle(body.title, link.url);
        link.titleSource = 'manual';
      }

      // Prazen niz in `null` sta pomenski vrednosti ("pobriši") in se ločita od `undefined`
      // ("ne spreminjaj") — ne prek `??` (ista past kot pri beležkah).
      if (body.comment !== undefined) link.comment = body.comment === null ? null : body.comment;
      if (body.icon !== undefined) link.icon = body.icon === null ? null : body.icon;

      if (body.groupId !== undefined) {
        const nextGroupId = body.groupId ? String((await findGroupOr404(userId, body.groupId))._id) : null;
        if (String(link.groupId ?? '') !== String(nextGroupId ?? '')) {
          link.groupId = nextGroupId === null ? null : new Types.ObjectId(nextGroupId);
          // Premaknjen zapis gre na VRH nove mape — isto pravilo kot za nov zapis (FR-033).
          // Brez tega bi obdržal `order` iz stare mape in pristal sredi nove, kjer ga
          // uporabnik ne bi iskal.
          const topmost = await SavedLinkModel.findOne({ userId, groupId: nextGroupId })
            .sort({ order: 1 })
            .select('order')
            .lean();
          link.order = topmost ? topmost.order - 1 : 0;
        }
      }

      link.searchText = buildSearchText({ title: link.title, url: link.url, comment: link.comment });
      await link.save();

      res.json(toLinkResponse(link.toObject() as unknown as SavedLinkLean));
    } catch (err) {
      next(err);
    }
  },
);

savedLinksRouter.delete(
  '/saved-links/:linkId',
  requireScopes(SAVED_LINK_SCOPES.write),
  async (req, res, next) => {
    try {
      const userId = await actorUserId(req);
      const link = await findLinkOr404(userId, String(req.params.linkId));
      await link.deleteOne();
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  },
);

/**
 * Ponovno branje strani — EDINI način, da se metapodatki preberejo po nastanku zapisa
 * (FR-014). Samodejnega ponovnega branja ni, ker bi pomenilo klicanje tujih strani brez
 * povoda (člen VIII).
 *
 * Ime se prepiše samo, kadar je `titleSource: auto` ali kadar je poslano `force: true`.
 * Vmesnik `force` ponudi izrecno ("prevzemi ime s strani"), ne kot privzeto vedenje.
 */
savedLinksRouter.post(
  '/saved-links/:linkId/refresh-metadata',
  requireScopes(SAVED_LINK_SCOPES.write),
  async (req, res, next) => {
    try {
      const body = refreshMetadataSchema.parse(req.body ?? {});
      const userId = await actorUserId(req);
      const link = await findLinkOr404(userId, String(req.params.linkId));

      const meta = await readLinkMetadata(link.url);
      link.metadataStatus = meta.status;
      link.metadataFetchedAt = meta.status === 'skipped' ? link.metadataFetchedAt : new Date();
      link.faviconUrl = meta.faviconUrl;

      if (meta.title && (body.force || link.titleSource === 'auto')) {
        link.title = meta.title.slice(0, 200);
        // Prevzeto ime je od tu naprej SAMODEJNO: naslednje osveževanje ga sme popraviti brez
        // `force`. Sicer bi bil "prevzemi ime s strani" enkraten poseg, po katerem bi zapis
        // ostal zaklenjen, čeprav ime ni več uporabnikovo.
        link.titleSource = 'auto';
        link.searchText = buildSearchText({
          title: link.title,
          url: link.url,
          comment: link.comment,
        });
      }
      await link.save();

      // 200 tudi ob `failed`: spodletelo branje NI napaka zahteve. Vmesnik je klical, da izve
      // izid, in `502` bi mu vzel prav tisti podatek (ista odločitev kot pri prepisu beležk).
      res.json(toLinkResponse(link.toObject() as unknown as SavedLinkLean));
    } catch (err) {
      next(err);
    }
  },
);

/**
 * Favicon strani, postrežen prek strežnika (FR-012).
 *
 * Pot je namenoma vezana na ZAPIS in ne na poljuben gostitelj (`?host=`): sicer bi bila to
 * odprta slikovna preusmeritev, prek katere bi vsak prijavljen uporabnik prenašal poljubne
 * naslove.
 */
savedLinksRouter.get(
  '/saved-links/:linkId/favicon',
  requireScopes(SAVED_LINK_SCOPES.read),
  async (req, res, next) => {
    try {
      const userId = await actorUserId(req);
      // Zapis mora biti uporabnikov — tudi za sliko. Brez te preverbe bi bil favicon tuja
      // pot do vednosti, kaj ima kdo shranjeno.
      const link = await findLinkOr404(userId, String(req.params.linkId));

      const favicon = await getFaviconBytes(link.faviconUrl);

      res.setHeader('Content-Type', favicon.contentType);
      // `private`, ker gre pot skozi uporabnikovo sejo: slika sama je javna, a odgovor na TO
      // pot ne sme v skupni predpomnilnik posrednika (člen II — pred nami je skupni Caddy).
      res.setHeader('Cache-Control', `private, max-age=${loadEnv().SAVED_LINKS_FAVICON_TTL_SECONDS}`);
      if (favicon.fetchedAt) res.setHeader('X-Source-Fetched-At', favicon.fetchedAt.toISOString());
      res.send(favicon.body);
    } catch (err) {
      // Favicona ni (stran ga nima, naslov ni prestal varovala, prenos je spodletel) → 404 in
      // NE 500: odjemalec ob tem izriše ikono in uporabniku se ne javi nič (research.md §9).
      if (err instanceof FaviconUnavailableError) {
        next(notFound('Favicona za ta zapis ni.'));
        return;
      }
      next(err);
    }
  },
);

// ─────────────────────────── mape ───────────────────────────

savedLinkGroupsRouter.get(
  '/saved-link-groups',
  requireScopes(SAVED_LINK_SCOPES.read),
  async (req, res, next) => {
    try {
      const userId = await actorUserId(req);
      const groups = await SavedLinkGroupModel.find({ userId }).sort({ order: 1 }).lean<SavedLinkGroupLean[]>();

      // `linkCount` je tu zato, da vmesnik ob brisanju pove, koliko zapisov bo postalo
      // nerazvrščenih (FR-022) — brez tega bi bila potrditev brisanja brez vsebine. Ena
      // združevalna poizvedba namesto N+1 klicev.
      const counts = await SavedLinkModel.aggregate<{ _id: unknown; count: number }>([
        { $match: { userId: new Types.ObjectId(userId), groupId: { $ne: null } } },
        { $group: { _id: '$groupId', count: { $sum: 1 } } },
      ]);
      const countByGroup = new Map(counts.map((c) => [String(c._id), c.count]));

      res.json({
        groups: groups.map((group) => toGroupResponse(group, countByGroup.get(String(group._id)) ?? 0)),
      });
    } catch (err) {
      next(err);
    }
  },
);

savedLinkGroupsRouter.post(
  '/saved-link-groups',
  requireScopes(SAVED_LINK_SCOPES.write),
  async (req, res, next) => {
    try {
      const body = groupCreateSchema.parse(req.body);
      const userId = await actorUserId(req);

      await assertGroupNameFree(userId, body.name);

      // Nova mapa gre na KONEC seznama map — obratno od zapisov (ki gredo na vrh, FR-033).
      // Mapa je razvrstitev, ne najdba: uporabnik jo je pravkar ustvaril in ve, kje je.
      const last = await SavedLinkGroupModel.findOne({ userId }).sort({ order: -1 }).select('order').lean();

      const created = await SavedLinkGroupModel.create({
        userId,
        name: body.name,
        order: last ? last.order + 1 : 0,
      });
      res.status(201).json(toGroupResponse(created.toObject() as unknown as SavedLinkGroupLean, 0));
    } catch (err) {
      next(duplicateNameOr(err));
    }
  },
);

/** Vrstni red map. MORA biti PRED `/saved-link-groups/:groupId` (glej opombo na vrhu). */
savedLinkGroupsRouter.put(
  '/saved-link-groups/order',
  requireScopes(SAVED_LINK_SCOPES.write),
  async (req, res, next) => {
    try {
      const body = groupOrderSchema.parse(req.body);
      const userId = await actorUserId(req);
      const ids = body.groupIds.map(String);
      if (ids.some((id) => !Types.ObjectId.isValid(id))) {
        throw badRequest('Seznam vsebuje neveljaven ID mape.');
      }

      const owned = await SavedLinkGroupModel.find({ _id: { $in: ids }, userId }).select('_id').lean();
      if (owned.length !== new Set(ids).size) {
        throw badRequest('Seznam vsebuje ID mape, ki ni tvoja.');
      }

      await Promise.all(
        toOrderAssignments(ids).map(({ id, order }) =>
          SavedLinkGroupModel.updateOne({ _id: id, userId }, { order }),
        ),
      );
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  },
);

savedLinkGroupsRouter.patch(
  '/saved-link-groups/:groupId',
  requireScopes(SAVED_LINK_SCOPES.write),
  async (req, res, next) => {
    try {
      const body = groupPatchSchema.parse(req.body);
      const userId = await actorUserId(req);
      const group = await findGroupOr404(userId, String(req.params.groupId));

      if (body.name !== undefined && body.name !== group.name) {
        await assertGroupNameFree(userId, body.name, String(group._id));
      }

      // Delna posodobitev: navedejo se samo polja, ki se spremenijo. `collapsed: false` je
      // pomenska vrednost ("razpri") in se zato loči od `undefined` ("ne spreminjaj") — ne
      // prek `??` (ista past kot pri beležkah).
      if (body.name !== undefined) group.name = body.name;
      if (body.collapsed !== undefined) group.collapsed = body.collapsed;
      await group.save();

      const linkCount = await SavedLinkModel.countDocuments({ userId, groupId: group._id });
      res.json(toGroupResponse(group.toObject() as unknown as SavedLinkGroupLean, linkCount));
    } catch (err) {
      next(duplicateNameOr(err));
    }
  },
);

savedLinkGroupsRouter.delete(
  '/saved-link-groups/:groupId',
  requireScopes(SAVED_LINK_SCOPES.write),
  async (req, res, next) => {
    try {
      const userId = await actorUserId(req);
      const group = await findGroupOr404(userId, String(req.params.groupId));

      // VRSTNI RED JE POMEMBEN (research.md §8): zapisi se PREMAKNEJO med nerazvrščene PRED
      // brisanjem mape. Obraten vrstni red bi ob napaki med brisanjem pustil zapise s
      // `groupId`, ki kaže na neobstoječo mapo — vidni ne bi bili v nobenem razdelku.
      //
      // Brisanje mape NE SME nikoli izbrisati zapisa (FR-022, SC-006): zapis je delo
      // uporabnika, mapa je zgolj njegova razvrstitev.
      const moved = await SavedLinkModel.updateMany(
        { userId, groupId: group._id },
        { $set: { groupId: null } },
      );
      await group.deleteOne();

      res.json({ movedLinks: moved.modifiedCount });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * Ime mape, ki je pri tem uporabniku še prosto — sicer `400` s povedanim razlogom.
 *
 * Zakaj OBOJE, ta preverba IN prevod napake indeksa spodaj: nobeno samo zase ne zadošča.
 *
 *  - Ta preverba ne prepreči sočasnosti: dva vzporedna klica bi jo oba prestala.
 *  - Sam indeks pa se v Mongoose gradi ASINHRONO (`autoIndex`), zato ob zapisu takoj po
 *    zagonu procesa še ne obstaja — in podvojeno ime se tiho shrani. To ni teoretična
 *    možnost: prav tako je padel `tests/contract/saved-links/groups.spec.ts` v celotnem
 *    naboru, medtem ko je sam zase tekel zeleno.
 *
 * Preverba torej daje determinističen odgovor, indeks pa zapre okno med njo in zapisom.
 */
async function assertGroupNameFree(userId: string, name: string, exceptId?: string): Promise<void> {
  const filter: Record<string, unknown> = { userId, name };
  if (exceptId) filter._id = { $ne: exceptId };
  if (await SavedLinkGroupModel.exists(filter)) {
    throw badRequest('Mapa s tem imenom že obstaja.');
  }
}

/** Prevede kršitev edinstvenosti imena mape (Mongo `11000`) v `400` — glej opombo zgoraj.
 * Brez tega bi sočasni klic vrnil `500` "nepričakovana napaka". */
function duplicateNameOr(err: unknown): unknown {
  if (typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000) {
    return badRequest('Mapa s tem imenom že obstaja.');
  }
  return err;
}

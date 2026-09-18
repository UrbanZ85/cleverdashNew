import { z } from 'zod';
import { MAX_RECIPE_URL_LENGTH } from './recipe-url.js';
import { escapeRegExp, foldForSearch, foldTag } from './search-text.js';

// Čista domenska plast modula, po vzoru `modules/saved-links/domain/link-input.ts` in
// `modules/todos/domain/todo-input.ts`: brez uvozov iz express/mongoose, zato testabilna brez
// baze in brez strežnika (člen IX). Usmerjevalnik jo samo kliče.
//
// Dolžine so TU in ne le v shemi baze, ker mora predolg vnos vrniti `400` z imenom polja, ne
// `500` iz Mongoose validacije.

export const MAX_TITLE_LENGTH = 200;
export const MAX_DESCRIPTION_LENGTH = 5000;
export const MAX_INGREDIENT_LENGTH = 200;
export const MAX_INGREDIENTS = 100;
export const MAX_STEP_LENGTH = 2000;
export const MAX_STEPS = 100;
export const MAX_TAGS = 20;
export const MAX_TAG_LENGTH = 40;
/** Kategorij na recept je manj kot oznak in to je namerno: recept, ki je hkrati v osmih
 * kategorijah, ni razvrščen — kategorije so obrok in vrsta jedi ("Juhe", "Kosila"), ne opisi. */
export const MAX_CATEGORIES_PER_RECIPE = 8;
export const MAX_CATEGORY_NAME_LENGTH = 40;
/** Zgornja meja BESEDNJAKA. Seznam, ki se ne prilega na zaslon, ni več izbirnik. */
export const MAX_CATEGORIES = 50;
export const MAX_QUERY_LENGTH = 200;
/** Teden v minutah. Vzhajanje testa traja dan, suho zorenje mesa tudi teden — nad tem je vnos
 * skoraj gotovo pomota (npr. sekunde namesto minut) in zavrnitev koristi. */
export const MAX_PREP_MINUTES = 10_080;
export const MAX_SERVINGS = 100;

/**
 * Večvrstični vnos v seznam vnosov (FR-005).
 *
 * Človek sestavine PRILEPI — iz strani, iz sporočila, iz beležke — in pričakuje, da bo vsaka
 * vrstica svoja. Zato je razbijanje po vrsticah privzeto vedenje vnosnega polja in ne posebna
 * poteza.
 *
 * Kaj funkcija počne poleg deljenja:
 *  - prazne vrstice in same presledke zavrže (prilepljeno besedilo jih ima med odstavki);
 *  - odstrani vodilne oznake seznama (`-`, `*`, `•`, `1.`, `1)`), ki jih prilepljeno besedilo
 *    skoraj vedno prinese in bi sicer obvisele v zapisu kot del sestavine;
 *  - poreže na dovoljeno dolžino in dovoljeno število.
 *
 * Rezanje in NE zavrnitev: prilepljen seznam z 203 vrsticami je skoraj vedno pomota v izbiri
 * besedila, ne poskus zlorabe, in zavrnitev celotnega vnosa bi uporabniku vzela vse ostalo.
 * Klicatelj o rezanju obvesti prek `truncated`.
 */
export function splitLines(
  raw: string | readonly string[],
  limits: { maxItems: number; maxLength: number },
): { items: string[]; truncated: boolean } {
  const source = Array.isArray(raw) ? raw : String(raw).split(/\r?\n/);

  const cleaned = source
    .flatMap((line) => String(line).split(/\r?\n/))
    .map((line) => line.replace(/^\s*(?:[-*•‣·]|\d+[.)])\s+/, '').trim())
    .filter((line) => line.length > 0)
    .map((line) => line.slice(0, limits.maxLength));

  return {
    items: cleaned.slice(0, limits.maxItems),
    truncated: cleaned.length > limits.maxItems,
  };
}

/** Sprejme niz ALI seznam nizov — vmesnik pošlje seznam, n8n in prilepljeno besedilo pogosto en
 * niz z novimi vrsticami. Oboje je isti podatek in zavrnitev ene od oblik bi bila arbitrarna. */
const linesInput = z.union([z.string(), z.array(z.string())]);

/**
 * Oznake: očiščene, deduplicirane po ZLOŽENI obliki, prikazane kot vpisane (FR-006).
 *
 * Vrne oboje — `tags` za prikaz in `tagKeys` za primerjavo. Dve polji in ne eno, ker mora
 * `Sladice` ostati `Sladice` v izpisu, a se ujeti s filtrom `sladice`. Z enim poljem bi bilo
 * treba izbrati med lepim izpisom in delujočim filtrom.
 */
export function normalizeTags(
  raw: readonly string[] | string | undefined,
  limits: { maxItems: number; maxLength: number } = {
    maxItems: MAX_TAGS,
    maxLength: MAX_TAG_LENGTH,
  },
): {
  tags: string[];
  tagKeys: string[];
} {
  if (raw === undefined) return { tags: [], tagKeys: [] };
  const source = Array.isArray(raw) ? raw : String(raw).split(/[,\n]/);

  const tags: string[] = [];
  const tagKeys: string[] = [];
  for (const candidate of source) {
    const display = String(candidate).trim().slice(0, limits.maxLength);
    if (display.length === 0) continue;
    const key = foldTag(display);
    // Oznaka, od katere po zlaganju ne ostane nič (same ločila, sam emoji), ni oznaka: filtra
    // po njej ne bi bilo mogoče sestaviti.
    if (key.length === 0 || tagKeys.includes(key)) continue;
    tags.push(display);
    tagKeys.push(key);
    if (tags.length >= limits.maxItems) break;
  }
  return { tags, tagKeys };
}

/**
 * Kategorije recepta: isto pravilo kot pri oznakah — prikazna oblika ostane, ujemanje teče po
 * zloženi (FR-081).
 *
 * Ločena funkcija in ne ponovna uporaba `normalizeTags` z drugo mejo: meji sta res drugačni, a to
 * ni razlog. Razlog je, da sta to DVE različni stvari, ki se bosta razvijali narazen — kategorija
 * pride iz besednjaka, oznaka je prosto besedilo — in skupna funkcija z zastavico bi ju zlepila
 * ravno na mestu, kjer ju je treba ločevati.
 */
export function normalizeCategories(raw: readonly string[] | string | undefined): {
  categories: string[];
  categoryKeys: string[];
} {
  const { tags, tagKeys } = normalizeTags(raw, {
    maxItems: MAX_CATEGORIES_PER_RECIPE,
    maxLength: MAX_CATEGORY_NAME_LENGTH,
  });
  return { categories: tags, categoryKeys: tagKeys };
}

/** Telo za `POST /recipe-categories` in `PATCH /recipe-categories/{id}`. */
export const categoryWriteSchema = z.object({
  name: z.string().trim().min(1).max(MAX_CATEGORY_NAME_LENGTH),
});

/** Telo za `PUT /recipe-categories/order` — ena operacija s CELIM seznamom, ne zaporedje
 * posamičnih popravkov (isti vzorec kot vrstni red map v modulu 008). */
export const categoryOrderSchema = z.object({
  categoryIds: z.array(z.string()).max(MAX_CATEGORIES),
});

/**
 * Telo za `POST /recipes`. `title` je EDINO obvezno polje (FR-001).
 *
 * To je glavna pomenska razlika do modula 008, kjer je obvezen `url`: recept z lista nima
 * naslova in ga ne bo imel (US2, research.md §1).
 */
export const recipeWriteSchema = z.object({
  title: z.string().trim().min(1).max(MAX_TITLE_LENGTH),
  url: z.string().max(MAX_RECIPE_URL_LENGTH).nullish(),
  description: z.string().max(MAX_DESCRIPTION_LENGTH).nullish(),
  ingredients: linesInput.optional(),
  steps: linesInput.optional(),
  prepMinutes: z.coerce.number().int().min(1).max(MAX_PREP_MINUTES).nullish(),
  servings: z.coerce.number().int().min(1).max(MAX_SERVINGS).nullish(),
  tags: z.union([z.string(), z.array(z.string())]).optional(),
  categories: z.union([z.string(), z.array(z.string())]).optional(),
  rating: z.coerce.number().int().min(1).max(5).nullish(),
  /** Ali naj strežnik ob nastanku obišče stran in iz nje predlaga vsebino (FR-010). Privzeto
   * `true`, ker je to razlog, zakaj je uporabnik naslov sploh prilepil — a IZKLOPLJIVO, ker
   * odhodni klic ne sme biti neizogiben (člen VIII). Brez naslova nima učinka. */
  importFromUrl: z.boolean().default(true),
});

export type RecipeWriteInput = z.infer<typeof recipeWriteSchema>;

/**
 * Telo za `PATCH /recipes/{recipeId}`: vsa polja neobvezna, izpuščena ostanejo.
 *
 * Ločena shema in ne `.partial()`: ta bi tiho izgubila obveznost `title` tudi pri POST, kjer je
 * `title` edino, kar zapis sploh naredi zapisom.
 */
export const recipePatchSchema = z.object({
  title: z.string().trim().min(1).max(MAX_TITLE_LENGTH).optional(),
  url: z.string().max(MAX_RECIPE_URL_LENGTH).nullish(),
  description: z.string().max(MAX_DESCRIPTION_LENGTH).nullish(),
  ingredients: linesInput.optional(),
  steps: linesInput.optional(),
  prepMinutes: z.coerce.number().int().min(1).max(MAX_PREP_MINUTES).nullish(),
  servings: z.coerce.number().int().min(1).max(MAX_SERVINGS).nullish(),
  tags: z.union([z.string(), z.array(z.string())]).optional(),
  categories: z.union([z.string(), z.array(z.string())]).optional(),
  rating: z.coerce.number().int().min(1).max(5).nullish(),
});

export type RecipePatchInput = z.infer<typeof recipePatchSchema>;

/**
 * Parametri `GET /recipes`.
 *
 * `scope` loči lastne od deljenih (FR-054). Privzeto `all`: uporabnik, ki mu je nekdo ravno
 * delil recept, ga mora videti brez tega, da bi vedel za obstoj filtra.
 */
export const recipesQuerySchema = z.object({
  q: z.string().trim().max(MAX_QUERY_LENGTH).optional(),
  tag: z.string().trim().max(MAX_TAG_LENGTH).optional(),
  category: z.string().trim().max(MAX_CATEGORY_NAME_LENGTH).optional(),
  scope: z.enum(['all', 'own', 'shared']).default('all'),
  sort: z.enum(['recent', 'title', 'rating', 'cooked']).default('recent'),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export type RecipesQuery = z.infer<typeof recipesQuerySchema>;

export const memberRoleSchema = z.object({
  role: z.enum(['view', 'edit']),
});

export const imageUploadQuerySchema = z.object({
  caption: z.string().trim().max(200).optional(),
  width: z.coerce.number().int().positive().max(20_000).optional(),
  height: z.coerce.number().int().positive().max(20_000).optional(),
  /**
   * Ali naj postane naslovna. Prva slika recepta postane naslovna tudi brez tega (FR-024).
   *
   * NE `z.coerce.boolean()`: ta uporabi JavaScriptovo resničnost niza, zato bi bil `?cover=false`
   * enak `true` — parameter, ki pomeni natanko nasprotno od zapisanega. Preverja se dobesedna
   * vrednost, vse ostalo (vključno z izpuščenim) pa je `false`.
   */
  cover: z
    .enum(['true', 'false', '1', '0'])
    .optional()
    .transform((value) => value === 'true' || value === '1'),
});

/** `POST /recipes/{id}/cooked`. Datum je NEOBVEZEN, ker človek pogosto vpisuje za nazaj
 * ("skuhal sem v nedeljo"); brez njega je zdaj. */
export const cookedSchema = z.object({
  cookedAt: z.coerce.date().optional(),
});

export const importSchema = z.object({
  /** Kaj sme uvoz prepisati. Privzeto NIČ razen praznih polj — uvoz, ki bi tiho povozil
   * uporabnikov vnos, bi bil izguba podatka (FR-014). */
  overwrite: z.boolean().default(false),
});

/**
 * Mongo filter za seznam receptov.
 *
 * `ownerId` in `members.userId` sta ALTERNATIVI in ne dodatka: to je cel model dostopa za branje
 * (data-model.md). Funkcija brez `userId` filtra niti ne more sestaviti — kar je edino, kar
 * preprečuje, da bi seznam kdaj vrnil tuj recept.
 *
 * Razlika do modula 008 je prav tu: tam je bil filter `{ userId }` in je bila izolacija
 * dokazana z enim poljem. Tu sta pogoja dva in tretji ne sme obstajati.
 */
export function buildRecipesFilter(params: {
  userId: string;
  query?: string;
  tag?: string;
  category?: string;
  scope?: 'all' | 'own' | 'shared';
}): Record<string, unknown> {
  const own = { ownerId: params.userId };
  const shared = { 'members.userId': params.userId };

  const access =
    params.scope === 'own' ? own : params.scope === 'shared' ? shared : { $or: [own, shared] };

  const filter: Record<string, unknown> = { ...access };

  if (params.query) {
    const folded = foldForSearch(params.query.trim());
    if (folded.length > 0) {
      filter.searchText = { $regex: escapeRegExp(folded) };
    }
  }

  if (params.tag) {
    const key = foldTag(params.tag);
    // Oznaka, od katere po zlaganju ne ostane nič, ne sme pomeniti "brez filtra": uporabnik je
    // filter IZBRAL in prazen seznam je pošten odgovor, celoten seznam pa ne.
    //
    // `$in` s PRAZNIM seznamom je Mongov pogoj, ki se ne ujame z ničimer. Izbran namesto
    // posebne vrednosti (npr. nemogočega niza), ker ne potrebuje razlage, zakaj je prav ta
    // vrednost nemogoča — in ker se nemogoča vrednost sčasoma izkaže za mogočo.
    filter.tagKeys = key.length > 0 ? key : { $in: [] };
  }

  // Kategorija je SVOJ filter in ne posebna vrsta oznake (FR-082): oba je mogoče uporabiti hkrati
  // ("pokaži juhe, ki so vegi"), zato sta dva pogoja in ne en sam skupni.
  if (params.category) {
    const key = foldTag(params.category);
    filter.categoryKeys = key.length > 0 ? key : { $in: [] };
  }

  return filter;
}

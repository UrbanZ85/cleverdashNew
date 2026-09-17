// Čista domenska plast modula (člen IX): brez omrežja, brez baze, brez express. Dobi HTML kot
// niz in vrne, kar je v njem našla. Zato testabilna z vzorci strani in brez enega samega
// odhodnega klica — enak razlog kot `modules/saved-links/domain/link-metadata.ts`.
//
// research.md §9: strani z recepti skoraj brez izjeme nosijo `<script type="application/ld+json">`
// z objektom `@type: "Recipe"` po schema.org. To je edini razčlenjevalnik tukaj — HTML se NE
// razčlenjuje v drevo in sestavine se NE ugibajo iz razredov CSS. Ugibanje bi dalo videz, da uvoz
// deluje na vsaki strani, in bi na polovici vrnilo smeti, ki bi jih moral uporabnik brisati
// ročno. Boljše je prazno kot narobe.

export interface ParsedRecipe {
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  ingredients: string[];
  steps: string[];
  prepMinutes: number | null;
  servings: number | null;
  tags: string[];
}

export const EMPTY_PARSED_RECIPE: ParsedRecipe = {
  title: null,
  description: null,
  imageUrl: null,
  ingredients: [],
  steps: [],
  prepMinutes: null,
  servings: null,
  tags: [],
};

/** Trde meje, da stran s 400 sestavinami ne napihne zapisa (Edge Case). Rezanje in ne zavrnitev:
 * uvoz je predlog, ki ga uporabnik pregleda, in polovica predloga je boljša od nobenega. */
const MAX_ITEMS = 100;
const MAX_ITEM_LENGTH = 2000;

/** Največ toliko blokov `ld+json` na strani. Nekatere strani jih imajo ducat (organizacija,
 * drobtinice, video, komentarji); brati vse je poceni, brati neomejeno pa ne. */
const MAX_BLOCKS = 20;

function asArray(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function text(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = stripTags(value).trim();
    return trimmed.length > 0 ? trimmed.slice(0, MAX_ITEM_LENGTH) : null;
  }
  if (typeof value === 'number') return String(value);
  // schema.org dovoli `{ "@value": "..." }` in zavite objekte z `name`.
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return text(obj['@value'] ?? obj.name ?? obj.text ?? null);
  }
  return null;
}

/** Opisi v `ld+json` pogosto vsebujejo HTML. V zapis gre besedilo, ne značke — te bi se v
 * vmesniku bodisi izpisale dobesedno bodisi (huje) izrisale. */
function stripTags(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ');
}

/** `@type` je lahko niz ALI seznam (`["Recipe", "NewsArticle"]`) — research.md §9, rob 3. */
function isRecipeNode(node: unknown): node is Record<string, unknown> {
  if (!node || typeof node !== 'object') return false;
  const type = (node as Record<string, unknown>)['@type'];
  return asArray(type).some((t) => typeof t === 'string' && t.toLowerCase() === 'recipe');
}

/**
 * Poišče vozlišče Recipe kjer koli v razčlenjenem JSON — tudi v `@graph` (research.md §9, rob 1).
 *
 * Rekurzija je omejena z globino: `ld+json` je tuj vnos in cikla v njem ne more biti (JSON ga ne
 * pozna), lahko pa je globok na tisoče ravni, kar bi izčrpalo sklad.
 */
function findRecipeNode(value: unknown, depth = 0): Record<string, unknown> | null {
  if (depth > 8 || !value || typeof value !== 'object') return null;
  if (isRecipeNode(value)) return value as Record<string, unknown>;

  for (const child of Array.isArray(value) ? value : Object.values(value)) {
    const found = findRecipeNode(child, depth + 1);
    if (found) return found;
  }
  return null;
}

/**
 * `recipeInstructions` v treh oblikah, ki so v praksi vse tri običajne (research.md §9, rob 2):
 * seznam nizov, seznam objektov `HowToStep`, ali en dolg niz z odstavki. Tudi `HowToSection` z
 * ugnezdenim `itemListElement` — to je oblika, ki jo uporabljajo strani z recepti v več delih.
 */
function parseInstructions(value: unknown, depth = 0): string[] {
  if (depth > 4) return [];
  const out: string[] = [];

  for (const entry of asArray(value)) {
    if (entry && typeof entry === 'object') {
      const obj = entry as Record<string, unknown>;
      const nested = obj.itemListElement ?? obj.steps;
      if (nested !== undefined) {
        out.push(...parseInstructions(nested, depth + 1));
        continue;
      }
    }
    // Deljenje po vrsticah mora priti PRED `text()`: ta prek `stripTags` strne vse presledke,
    // vključno s prelomi vrstic, in po njem jih ni več mogoče najti. En sam dolg niz je pogosto
    // cel postopek z novimi vrsticami — ravno oblika, ki jo je treba razbiti.
    const parts = typeof entry === 'string' ? entry.split(/\r?\n+/) : [entry];
    for (const part of parts) {
      const line = text(part);
      if (line) out.push(line);
    }
  }

  return out.slice(0, MAX_ITEMS);
}

/**
 * ISO 8601 trajanje (`PT1H30M`) v minute — tako schema.org zapiše `prepTime`/`cookTime`.
 *
 * Dnevi so vključeni (`P1DT2H`), ker jih vzhajanje in mariniranje resnično uporabljata. Tedni,
 * meseci in leta niso: `P1M` je v ISO 8601 dvoumen (mesec ali minuta, odvisno od položaja) in
 * pri receptu ni pomena, ki bi opravičil ugibanje.
 */
export function parseIsoDuration(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:\d+S)?)?$/.exec(value.trim());
  if (!match) return null;
  const days = Number(match[1] ?? 0);
  const hours = Number(match[2] ?? 0);
  const minutes = Number(match[3] ?? 0);
  const total = days * 1440 + hours * 60 + minutes;
  return total > 0 ? total : null;
}

/** `recipeYield` je lahko `"4 porcije"`, `"4"` ali `4`. Vzame se prvo celo število. */
function parseYield(value: unknown): number | null {
  const raw = asArray(value)[0];
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.trunc(raw) || null;
  const match = /\d+/.exec(String(raw ?? ''));
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 100 ? parsed : null;
}

/** `image` je lahko niz, seznam ali `ImageObject` z `url`. Vzame se prva uporabna vrednost. */
function parseImage(value: unknown): string | null {
  for (const entry of asArray(value)) {
    if (typeof entry === 'string' && entry.trim().length > 0) return entry.trim();
    if (entry && typeof entry === 'object') {
      const url = (entry as Record<string, unknown>).url;
      if (typeof url === 'string' && url.trim().length > 0) return url.trim();
    }
  }
  return null;
}

/**
 * Izlušči vse bloke `application/ld+json` iz HTML in vrne prvi recept, ki ga najde.
 *
 * Regularni izraz in ne razčlenjevalnik HTML: iščemo natanko določeno značko z natanko določenim
 * atributom, celoten razčlenjevalnik pa bi bil nova odvisnost za en sam vzorec. Blok, ki ni
 * veljaven JSON, se PRESKOČI in ne prekine branja — ena pokvarjena drobtinica ne sme vzeti
 * recepta, ki je v naslednjem bloku.
 */
export function extractRecipeFromHtml(html: string): ParsedRecipe {
  const pattern = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  let blocks = 0;
  for (const match of html.matchAll(pattern)) {
    if (++blocks > MAX_BLOCKS) break;
    const raw = match[1];
    if (!raw) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    const node = findRecipeNode(parsed);
    if (node) return fromNode(node);
  }

  return EMPTY_PARSED_RECIPE;
}

function fromNode(node: Record<string, unknown>): ParsedRecipe {
  const ingredients = asArray(node.recipeIngredient ?? node.ingredients)
    .map((entry) => text(entry))
    .filter((entry): entry is string => Boolean(entry))
    .slice(0, MAX_ITEMS);

  const prep = parseIsoDuration(node.totalTime) ?? sumTimes(node.prepTime, node.cookTime);

  return {
    title: text(node.name),
    description: text(node.description),
    imageUrl: parseImage(node.image),
    ingredients,
    steps: parseInstructions(node.recipeInstructions),
    prepMinutes: prep,
    servings: parseYield(node.recipeYield),
    tags: asArray(node.recipeCategory)
      .concat(asArray(node.recipeCuisine))
      // `keywords` je po schema.org lahko en niz z vejicami — v praksi je to najpogostejša oblika.
      .concat(asArray(node.keywords).flatMap((k) => String(k).split(',')))
      .map((entry) => text(entry))
      .filter((entry): entry is string => entry !== null && entry.length > 0 && entry.length <= 40)
      .slice(0, 20),
  };
}

/** `totalTime` je zanesljivejši, kadar obstaja; sicer je vsota priprave in kuhanja najboljši
 * približek tega, koliko časa bo človek stal v kuhinji. */
function sumTimes(prepTime: unknown, cookTime: unknown): number | null {
  const prep = parseIsoDuration(prepTime) ?? 0;
  const cook = parseIsoDuration(cookTime) ?? 0;
  const total = prep + cook;
  return total > 0 ? total : null;
}

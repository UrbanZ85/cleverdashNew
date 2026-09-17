// Čista domenska plast modula: brez uvozov iz express/mongoose, zato testabilna brez baze in
// brez strežnika (člen IX). Usmerjevalnik jo samo kliče.
//
// POZOR na razliko do `domain/outbound-url.ts`. Ta datoteka odloča, ali je naslov veljaven
// ZAPIS — torej ali ga sme uporabnik shraniti in ga bo odprl njegov BRSKALNIK. Ali sme tak
// naslov obiskati STREŽNIK (za uvoz po schema.org), je drugo vprašanje in nanj odgovarja
// `validateOutboundUrl`, ki je strožji. Zamenjava teh dveh vlog bi pomenila, da uporabnik
// naslova iz domačega omrežja ne more shraniti — ali, v obratni smeri, da strežnik hodi v
// zasebno omrežje.
//
// Prepisano iz `modules/saved-links/domain/link-url.ts`, ne uvoženo (člen I). Ena pomenska
// razlika, in ta je razlog za obstoj tega modula: tam je naslov OBVEZEN, tu ni (FR-002,
// research.md §1). Zato tu obstaja `normalizeOptionalRecipeUrl`, ki prazen vnos prevede v
// `null` namesto v zavrnitev.

/** Ista zgornja meja kot `MAX_OUTBOUND_URL_LENGTH` — in tudi shema baze (2048). */
export const MAX_RECIPE_URL_LENGTH = 2048;

export type RecipeUrlRejection = 'invalid' | 'scheme' | 'too-long';

export type RecipeUrlResult =
  | { ok: true; url: string }
  | { ok: false; reason: RecipeUrlRejection; message: string };

/** Sheme, ki jih brskalnik odpre kot stran. `javascript:` in `data:` sta izvajalna konteksta,
 * ne strani; `file:` kaže na disk tistega, ki povezavo odpre. Vse tri so v shranjenem receptu
 * past, ne pripomoček. */
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

/**
 * Normalizira naslov, kot ga je vpisal ali prilepil uporabnik.
 *
 * Pravila so deterministična in zato enotsko testirana:
 *  - robni presledki se odstranijo (lepljenje iz naslovne vrstice jih pogosto prinese);
 *  - manjkajoča shema se dopolni v `https://` — `okusno.si/recept` je naslov strani, ne pot;
 *  - gostitelj gre v male črke (DNS je neobčutljiv na velikost), POT pa ostane nedotaknjena,
 *    ker je na strežnikih Linuxa občutljiva na velike črke in bi `/Recept` → `/recept`
 *    pripeljalo do 404;
 *  - shema, ki ni `http`/`https`, in naslov nad 2048 znaki sta zavrnjena z razlogom.
 */
export function normalizeRecipeUrl(raw: string): RecipeUrlResult {
  const value = raw.trim();

  if (value.length === 0) {
    return { ok: false, reason: 'invalid', message: 'Naslov strani je prazen.' };
  }
  if (value.length > MAX_RECIPE_URL_LENGTH) {
    return {
      ok: false,
      reason: 'too-long',
      message: `Naslov je predolg (največ ${MAX_RECIPE_URL_LENGTH} znakov).`,
    };
  }

  // Dopolnitev sheme se zgodi SAMO, kadar sheme ni. Prepoznava je "pred prvim `/` je `:`" in ne
  // `new URL()` v poskusu-ujemi: `javascript:alert(1)` se kot URL uspešno razčleni, zato bi ga
  // poskus-ujemi spustil naprej, ne pa zavrnil z razlogom `scheme`.
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(value);
  const candidate = hasScheme ? value : `https://${value}`;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return { ok: false, reason: 'invalid', message: 'Naslov ni veljaven URL.' };
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    return {
      ok: false,
      reason: 'scheme',
      message: `Shranim lahko samo naslov strani (http ali https). "${url.protocol.replace(':', '')}" ni naslov strani.`,
    };
  }

  // Brez gostitelja ni strani — `https:///pot` se razčleni, a nikamor ne kaže.
  if (url.hostname.length === 0) {
    return { ok: false, reason: 'invalid', message: 'Naslov ne vsebuje imena strani (gostitelja).' };
  }

  // `URL` gostitelja zniža sam; nastavitev je tu izrecna, da je pravilo razvidno iz kode in ne
  // odvisno od podrobnosti razčlenjevalnika.
  url.hostname = url.hostname.toLowerCase();

  const normalized = url.href;
  if (normalized.length > MAX_RECIPE_URL_LENGTH) {
    return {
      ok: false,
      reason: 'too-long',
      message: `Naslov je predolg (največ ${MAX_RECIPE_URL_LENGTH} znakov).`,
    };
  }

  return { ok: true, url: normalized };
}

/**
 * Različica za polje, ki je NEOBVEZNO (FR-002) — edina pomenska razlika do modula 008.
 *
 * Trije vhodi pomenijo tri različne stvari in se zato ne smejo zliti v enega:
 *  - `undefined` → klicatelj polja ni omenil. Vrne `{ ok: true, url: undefined }`; pri delni
 *    posodobitvi to pomeni "ne spreminjaj".
 *  - `null` ali prazen niz → klicatelj naslov IZRECNO briše. Vrne `{ ok: true, url: null }`.
 *  - niz → normalizira se kot zgoraj.
 *
 * Brez te ločnice bi `url: ''` pri urejanju pomenilo bodisi tiho zavrnitev bodisi tiho
 * ohranitev starega naslova — v obeh primerih uporabnik naslova ne bi mogel odstraniti.
 */
export function normalizeOptionalRecipeUrl(
  raw: string | null | undefined,
): { ok: true; url: string | null | undefined } | { ok: false; reason: RecipeUrlRejection; message: string } {
  if (raw === undefined) return { ok: true, url: undefined };
  if (raw === null || raw.trim().length === 0) return { ok: true, url: null };

  const result = normalizeRecipeUrl(raw);
  return result.ok ? { ok: true, url: result.url } : result;
}

/**
 * Gostitelj brez `www.` — za drobno oznako vira v seznamu ("okusno.si").
 *
 * Vrne `null` za karkoli, kar ni URL. NI nadomestek za ime recepta: ime je obvezno (FR-001), za
 * razliko od modula 008, kjer je bil gostitelj edini nadomestek za manjkajoče ime.
 */
export function hostLabel(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

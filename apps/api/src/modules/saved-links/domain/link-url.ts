// Čista domenska plast modula: brez uvozov iz express/mongoose, zato testabilna brez baze in
// brez strežnika (člen IX). Router jo samo kliče.
//
// POZOR na razliko do `domain/outbound-url.ts` (research.md §5). Ta datoteka odloča, ali je
// naslov veljaven ZAPIS — torej ali ga sme uporabnik shraniti in ga bo odprl njegov BRSKALNIK.
// Zato je `http://192.168.1.1` (usmerjevalnik v domačem omrežju) tu povsem legitimen. Ali sme
// tak naslov obiskati STREŽNIK, je drugo vprašanje in nanj odgovarja `validateOutboundUrl`,
// ki je strožji. Zamenjava teh dveh vlog bi pomenila, da uporabnik svoje lastne naprave ne
// more shraniti — ali, v obratni smeri, da strežnik hodi v zasebno omrežje.

/** Ista zgornja meja kot `MAX_OUTBOUND_URL_LENGTH` — FR-007, in tudi shema baze (2048). */
export const MAX_LINK_URL_LENGTH = 2048;

export type LinkUrlRejection = 'invalid' | 'scheme' | 'too-long';

export type LinkUrlResult =
  | { ok: true; url: string }
  | { ok: false; reason: LinkUrlRejection; message: string };

/** Sheme, ki jih odpre brskalnik kot stran. `javascript:` in `data:` sta izvajalna konteksta,
 * ne strani; `file:` kaže na disk tistega, ki povezavo odpre. Vse tri so v shranjenem
 * zaznamku past, ne pripomoček (FR-003). */
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

/**
 * Normalizira naslov, kot ga je vpisal ali prilepil uporabnik (FR-002).
 *
 * Pravila so deterministična in zato enotsko testirana:
 *  - robni presledki se odstranijo (lepljenje iz naslovne vrstice jih pogosto prinese);
 *  - manjkajoča shema se dopolni v `https://` — `primer.si/stran` je naslov strani, ne pot;
 *  - gostitelj gre v male črke (DNS je neobčutljiv na velikost), POT pa ostane nedotaknjena,
 *    ker je na strežnikih Linuxa občutljiva na velike črke in bi `/Pot` → `/pot` pripeljalo
 *    do 404;
 *  - shema, ki ni `http`/`https`, in naslov nad 2048 znaki sta zavrnjena z razlogom.
 */
export function normalizeLinkUrl(raw: string): LinkUrlResult {
  const value = raw.trim();

  if (value.length === 0) {
    return { ok: false, reason: 'invalid', message: 'Naslov strani je prazen.' };
  }
  if (value.length > MAX_LINK_URL_LENGTH) {
    return {
      ok: false,
      reason: 'too-long',
      message: `Naslov je predolg (največ ${MAX_LINK_URL_LENGTH} znakov).`,
    };
  }

  // Dopolnitev sheme se zgodi SAMO, kadar sheme ni. Prepoznava je "pred prvim `/` je `:`" in
  // ne `new URL()` v poskusu-ujemi: `javascript:alert(1)` se kot URL uspešno razčleni, zato bi
  // ga poskus-ujemi spustil naprej, ne pa zavrnil z razlogom `scheme`.
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

  // Brez gostitelja ni strani — `https:///pot` ali `http://` se razčlenita, a nikamor ne kažeta.
  if (url.hostname.length === 0) {
    return { ok: false, reason: 'invalid', message: 'Naslov ne vsebuje imena strani (gostitelja).' };
  }

  // `URL` gostitelja zniža sam; nastavitev je tu izrecna, da je pravilo razvidno iz kode in
  // ne odvisno od podrobnosti razčlenjevalnika.
  url.hostname = url.hostname.toLowerCase();

  const normalized = url.href;
  if (normalized.length > MAX_LINK_URL_LENGTH) {
    return {
      ok: false,
      reason: 'too-long',
      message: `Naslov je predolg (največ ${MAX_LINK_URL_LENGTH} znakov).`,
    };
  }

  return { ok: true, url: normalized };
}

/**
 * Gostitelj brez `www.` — nadomestno ime zapisa, kadar strani ni bilo mogoče prebrati in
 * uporabnik imena ni vpisal (FR-007, data-model.md: `title` ni nikoli prazen).
 *
 * Vrne prazen niz samo za nekaj, kar ni URL — klicatelj tega ne sme dobiti, ker naslov pred
 * tem že preide `normalizeLinkUrl`.
 */
export function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

// Oznaka postaje omrežja Neverin (neverin.hr) in naslovi, ki iz nje sledijo.
//
// Neverin je drugi ponudnik meritev poleg ARSO (011, razširitev): omrežje ~1335 zasebnih in
// javnih postaj v Sloveniji, na Hrvaškem, v BiH, Srbiji in Črni gori. Postajo označuje `slug`
// iz naslova strani — `https://www.neverin.hr/postaja/sveta-marina/` je `sveta-marina`.
//
// Zakaj v `domain/` in ne v modulu, ki postajo bere: oznako potrebujeta DVA modula — `meteo`
// (sestavi naslov in prenese vir) in `settings` (preveri, kar uporabnik shrani) — uvoz med
// moduloma pa prepoveduje člen I. Enak razlog kot pri `domain/arso-station.ts`.
//
// PREVERJENO NEPOSREDNO PROTI VIRU 9. 9. 2026:
//
// - Meritve so na `https://core.neverin.hr` in NE na `www.neverin.hr`: stran sama je prazna
//   lupina, ki podatke naloži z JavaScriptom (vsa polja v HTML so `--`). Razčlenjevanje HTML
//   tu torej ni mogoče niti v načelu.
// - Vir zahteva glavo `Origin` ali `Referer` z vrednostjo `https://www.neverin.hr`; brez nje
//   odgovori `403 {"error":{"code":"ORIGIN_BLOCKED"}}`. Glavo pošilja `modules/meteo/client.ts`
//   in razlog je zapisan tam, ne tu.
// - Arhiv NE pošilja `ETag` ali `Last-Modified` (za razliko od ARSO), zato pogojna zahteva ne
//   deluje in vsaka osvežitev prenese celo telo. Zato je privzeti TTL daljši od izvornega
//   `cache-control: max-age=60` — člen VIII: manj klicev, ne več.

/** Slug iz naslova postaje: male črke, števke in vezaji (`sveta-marina`, `parg-cabar`). */
const NEVERIN_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,63}$/;

/**
 * Koliko postaj vrne seznam. Vir jih ob 9. 9. 2026 pozna 1335, privzeto pa vrne le 100 —
 * brez izrecne meje bi bila vsebina seznama odvisna od njihovega privzetka. 2000 je največ,
 * kar vir sprejme (`limit=5000` vrne `VALIDATION_ERROR`).
 */
export const NEVERIN_STATION_LIMIT = 2000;

export function isValidNeverinSlug(value: string): boolean {
  return NEVERIN_SLUG_PATTERN.test(value);
}

/**
 * Naslov arhiva meritev postaje.
 *
 * `hours` je del NASLOVA in ne naknadni filter, ker vir po njem reže sam — 48 ur je ~460
 * meritev in ~59 kB, kar je desetkrat manj od ARSO strani z enakim obdobjem.
 */
export function neverinArchiveUrl(baseUrl: string, slug: string, hours: number): string {
  if (!isValidNeverinSlug(slug)) {
    throw new Error(`Neveljavna oznaka postaje Neverin: ${slug}`);
  }
  const url = new URL(`stations/${slug}/archive`, ensureTrailingSlash(baseUrl));
  url.searchParams.set('hours', String(hours));
  return url.href;
}

/**
 * Naslov seznama postaj.
 *
 * Bere se `type=weather` (vremenske postaje); `type=sea` so temperature morja in so drug
 * seznam, ki ga ta zavihek ne kaže. `fields=temp` je najmanjše, kar vir dovoli — zanima nas
 * ovojnica postaje (ime, koordinati, višina), ne njena zadnja meritev.
 */
export function neverinStationListUrl(baseUrl: string, limit = NEVERIN_STATION_LIMIT): string {
  const url = new URL('stations/readings', ensureTrailingSlash(baseUrl));
  url.searchParams.set('type', 'weather');
  url.searchParams.set('fields', 'temp');
  url.searchParams.set('limit', String(limit));
  return url.href;
}

function ensureTrailingSlash(url: string): string {
  return url.endsWith('/') ? url : `${url}/`;
}

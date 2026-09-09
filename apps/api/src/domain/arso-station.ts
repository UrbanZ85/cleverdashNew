// Oznaka ARSO samodejne postaje in naslovi, ki iz nje sledijo.
//
// ARSO postaje v naslovu ne označuje z imenom, ampak z `domain_meteosiId` BREZ zaključnega
// podčrtaja: postaja "Vrhnika" ima `VRHNIKA_` in naslov `observationAms_VRHNIKA_history.html`,
// postaja "Bilje Nova Gorica" pa `NOVA-GOR_BILJE_` in `observationAms_NOVA-GOR_BILJE_history.html`.
// Preverjeno neposredno proti živemu viru 9. 9. 2026: oblika iz imena postaje
// (`NOVA-GORICA-BILJE`, `BILJE`) vrne 404, oblika iz `domain_meteosiId` pa 200.
//
// Zakaj je oznaka omejena z vzorcem in ne prosto besedilo: iz nje se sestavi naslov, ki ga
// STREŽNIK sam prenese v uporabnikovem imenu (člen VIII). Brez vzorca bi bila vrednost iz
// nastavitev pot do potovanja po tuji strani (`../../..`) ali do drugega gostitelja.
// `domain/outbound-url.ts` preveri sestavljen naslov še enkrat — to tu je prva, ožja mreža.
//
// Zakaj v `domain/` in ne v modulu, ki postajo bere: oznako potrebujeta DVA modula — `meteo`
// (sestavi naslov in prenese vir) in `settings` (preveri, kar uporabnik shrani) — uvoz med
// moduloma pa prepoveduje člen I (eslint `cleverdash/module-boundary`). Enak razlog kot pri
// `domain/commute-route.ts` in `domain/outbound-url.ts`.

/** Znaki, ki se v `domain_meteosiId` pojavijo (velike črke, števke, `-`, `_`). Šumnikov ni:
 * ARSO jih v tej oznaki pretvori (BOHINJSKA ČEŠNJICA → `BOHIN-CES_`). */
const STATION_ID_PATTERN = /^[A-Z0-9][A-Z0-9_-]{1,39}$/;

/** Postaja, ki jo dobi uporabnik, dokler si svoje ne izbere. Bežigrad je izbran zato, ker je
 * privzeta lokacija vremena v isti aplikaciji Ljubljana (`ARSO_DEFAULT_LOCATION`) — nova
 * namestitev tako pokaže podatke istega kraja na obeh mestih. */
export const DEFAULT_STATION_ID = 'LJUBL-ANA_BEZIGRAD';

export function isValidStationId(value: string): boolean {
  return STATION_ID_PATTERN.test(value);
}

/**
 * Oznaka postaje iz `domain_meteosiId`, kakor je zapisana v ARSO seznamu postaj.
 * Vrne `null`, kadar iz vrednosti ne nastane veljavna oznaka (prazna, s presledki, s šumniki).
 */
export function stationIdFromMeteosiId(meteosiId: string): string | null {
  const candidate = meteosiId.trim().replace(/_+$/, '');
  return isValidStationId(candidate) ? candidate : null;
}

/** Naslov strani z dvodnevno zgodovino meritev postaje. */
export function stationHistoryUrl(baseUrl: string, stationId: string): string {
  if (!isValidStationId(stationId)) {
    throw new Error(`Neveljavna oznaka postaje: ${stationId}`);
  }
  return new URL(`observationAms_${stationId}_history.html`, ensureTrailingSlash(baseUrl)).href;
}

/** Naslov seznama vseh samodejnih postaj (zadnje meritve vseh postaj v eni datoteki). */
export function stationListUrl(baseUrl: string): string {
  return new URL('observationAms_si_latest.xml', ensureTrailingSlash(baseUrl)).href;
}

function ensureTrailingSlash(url: string): string {
  return url.endsWith('/') ? url : `${url}/`;
}

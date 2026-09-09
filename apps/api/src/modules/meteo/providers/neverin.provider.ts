import {
  isValidNeverinSlug,
  neverinArchiveUrl,
  neverinStationListUrl,
} from '../../../domain/neverin-station.js';
import { createNeverinFetcher } from '../client.js';
import { parseNeverinHistory, parseNeverinStationList } from '../domain/neverin-parse.js';
import type { Env, SourceRequest, StationProvider } from './types.js';

// Ponudnik Neverin (neverin.hr) — omrežje ~1335 zasebnih in javnih postaj v Sloveniji, na
// Hrvaškem, v BiH, Srbiji in Črni gori.
//
// Zakaj poleg ARSO: ARSO meri s ~106 postajami in samo v Sloveniji. Postaje, ki jih ta zavihek
// dobi z Neverinom, so drugod (Sveta Marina v Istri) ali gosteje razporejene tam, kjer je ARSO
// redek — 111 njihovih postaj je vseeno v Sloveniji in se z ARSO ponekod prekrivajo.
//
// Vse, kar je bilo treba o tem viru izmeriti (enota vetra, pomen padavin, referenca tlaka,
// zahtevana glava `Origin`), je zapisano v `domain/neverin-parse.ts` in `client.ts`. Tu je
// samo vezava: kateri naslov, kateri ključ, kateri TTL.

/** Koliko ur zgodovine se prenese. Enako kot ARSO hrani (dva dneva) in enako kot je zgornja
 * meja `?hours=` — daljše okno v pogodbi ne obstaja, ker ga ne bi imel kdo napolniti. */
const NEVERIN_ARCHIVE_HOURS = 48;

export const neverinProvider: StationProvider = {
  id: 'neverin',
  label: 'Neverin',
  attribution: { text: 'Vir: Neverin.hr', url: 'https://www.neverin.hr' },

  stationPageUrl(env: Env, stationId: string): string {
    // Človeku se ponudi njihova stran postaje in NE naslova, s katerega bere strežnik: ta je
    // JSON na `core.neverin.hr` in v brskalniku ni berljiv.
    return new URL(`postaja/${stationId}/`, ensureTrailingSlash(env.NEVERIN_WEB_URL)).href;
  },

  historyRequest(env: Env, stationId: string): SourceRequest {
    if (!isValidNeverinSlug(stationId)) {
      throw new Error(`Neveljavna oznaka postaje Neverin: ${stationId}`);
    }
    // Vedno 48 ur, tudi za 6-urni graf: okno prikaza reže `withinHours`, vsote padavin za 24
    // in 48 ur pa se računajo iz celotne serije (glej `StationProvider.historyRequest`).
    // 48 ur je ~460 meritev in ~59 kB — manj kot desetina ARSO strani za isto obdobje.
    const sourceUrl = neverinArchiveUrl(env.NEVERIN_BASE_URL, stationId, NEVERIN_ARCHIVE_HOURS);
    return {
      key: `meteo:history:neverin:${stationId}`,
      sourceUrl,
      ttlSeconds: env.NEVERIN_CACHE_SECONDS,
      fetcher: createNeverinFetcher(sourceUrl, env.NEVERIN_WEB_URL, `arhiv postaje ${stationId}`),
    };
  },

  parseHistory: parseNeverinHistory,

  stationsRequest(env: Env): SourceRequest {
    const sourceUrl = neverinStationListUrl(env.NEVERIN_BASE_URL);
    return {
      key: 'meteo:stations:neverin',
      sourceUrl,
      ttlSeconds: env.NEVERIN_STATIONS_CACHE_SECONDS,
      fetcher: createNeverinFetcher(sourceUrl, env.NEVERIN_WEB_URL, 'seznam postaj'),
    };
  },

  parseStations: parseNeverinStationList,
};

function ensureTrailingSlash(url: string): string {
  return url.endsWith('/') ? url : `${url}/`;
}

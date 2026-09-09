import { isValidStationId, stationHistoryUrl, stationListUrl } from '../../../domain/arso-station.js';
import { createStationHistoryFetcher, createStationListFetcher } from '../client.js';
import { parseStationHistory } from '../domain/history-parse.js';
import { parseStationList } from '../domain/station-list-parse.js';
import { STATION_CATALOG, mergeStationCatalog } from '../domain/station-catalog.js';
import type { ProviderStation } from '../domain/measurement.js';
import type { Env, SourceRequest, StationProvider } from './types.js';

// Ponudnik ARSO — državna mreža samodejnih postaj, prvotni in privzeti vir tega zavihka.
//
// Vsa posebnost tega vira (zgodovina samo kot HTML, seznam postaj kot posnetek cikla in ne
// imenik) je zapisana v `domain/history-parse.ts` oziroma `domain/station-catalog.ts`. Tu je
// samo vezava: kateri naslov, kateri ključ, kateri TTL.

export const arsoProvider: StationProvider = {
  id: 'arso',
  label: 'ARSO',
  attribution: { text: 'Vir: ARSO', url: 'https://meteo.arso.gov.si' },

  stationPageUrl(env: Env, stationId: string): string {
    // Pri ARSO je stran, ki jo bere strežnik, ista stran, ki jo odpre človek.
    return stationHistoryUrl(env.ARSO_STATION_BASE_URL, stationId);
  },

  historyRequest(env: Env, stationId: string): SourceRequest {
    if (!isValidStationId(stationId)) {
      throw new Error(`Neveljavna oznaka ARSO postaje: ${stationId}`);
    }
    return {
      key: `meteo:history:arso:${stationId}`,
      sourceUrl: stationHistoryUrl(env.ARSO_STATION_BASE_URL, stationId),
      ttlSeconds: env.METEO_CACHE_SECONDS,
      fetcher: createStationHistoryFetcher(stationHistoryUrl(env.ARSO_STATION_BASE_URL, stationId)),
    };
  },

  parseHistory: parseStationHistory,

  stationsRequest(env: Env): SourceRequest {
    const sourceUrl = stationListUrl(env.ARSO_STATION_BASE_URL);
    return {
      key: 'meteo:stations:arso',
      sourceUrl,
      ttlSeconds: env.METEO_STATIONS_CACHE_SECONDS,
      fetcher: createStationListFetcher(sourceUrl),
    };
  },

  /**
   * Živi vir se ZLIJE z zapisanim imenikom.
   *
   * `observationAms_si_latest.xml` ni imenik postaj, ampak posnetek zadnjega objavnega cikla
   * (razlogi in izmerjeni primeri v `domain/station-catalog.ts`). Brez zlitja uporabnik svoje
   * postaje ob napačnem trenutku na seznamu ne bi našel.
   */
  parseStations(body: string): ProviderStation[] {
    return mergeStationCatalog(STATION_CATALOG, parseStationList(body)).map((station) => ({
      ...station,
      // ARSO meri samo v Sloveniji; oznake države ne pošilja, ker je zanj samoumevna.
      countryCode: 'SI',
    }));
  },
};

import { Router } from 'express';
import { z } from 'zod';
import { loadEnv } from '../../platform/config/env.js';
import { requireScopes } from '../../platform/auth/scopes.js';
import { badRequest, serviceUnavailable } from '../../platform/errors/problem.js';
import { getOrRefresh, CacheMissError } from '../../platform/cache/service.js';
import { resolveMeteoStation } from '../../platform/settings/meteo.service.js';
import { isValidStationId, stationHistoryUrl, stationListUrl } from '../../domain/arso-station.js';
import { validateOutboundUrl } from '../../domain/outbound-url.js';
import { createStationHistoryFetcher, createStationListFetcher } from './client.js';
import { ArsoHistoryFormatError, parseStationHistory } from './domain/history-parse.js';
import { parseStationList } from './domain/station-list-parse.js';
import { STATION_CATALOG, mergeStationCatalog } from './domain/station-catalog.js';
import { detectAvailableSeries, summarize, toHourlyBuckets, withinHours } from './domain/hourly.js';
import { buildMeteoSourceMeta } from './mappers/source.mapper.js';
import { METEO_SCOPES } from './scopes.js';

// 011: meritve ARSO samodejne postaje — dvodnevna zgodovina po urah (temperatura, padavine,
// veter, vlaga, tlak, sevanje, sneg).
//
// Zakaj svoj modul in ne ploščica na nadzorni plošči: nadzorna plošča kaže TRENUTNO stanje v
// enem pogledu, tu pa gre za pregled ČASOVNEGA POTEKA z grafi in izbiro postaje — svoj zaslon,
// svoj namespace, svoja odstranljivost (člen I). Ploščica na nadzorni plošči vseeno obstaja,
// a je samo povzetek (urne padavine zadnjih 24 h), ki odpre ta zavihek.
//
// Člen VIII: vsak prenos gre prek `platform/cache/service.ts`; odjemalec ARSO nikoli ne kliče
// sam. Vir pošilja `ETag`, zato je osvežitev znotraj TTL praviloma odgovor 304 brez telesa.
export const meteoRouter = Router();

/** Klicatelj z API ključem osebnih nastavitev nima (isti dogovor kot pri `resolveTabs`). */
function personalUserId(req: { auth?: { subjectType: string; subjectId: string } }): string | null {
  return req.auth?.subjectType === 'user' ? req.auth.subjectId : null;
}

const historyQuerySchema = z.object({
  /** Prepis izbrane postaje za ta klic — člen III: kar zmore vmesnik, mora zmoči tudi HTTP klic. */
  station: z.string().trim().min(1).max(40).optional(),
  /** Dolžina okna v urah. Vir hrani dva dneva; več od tega ni od kod vzeti. */
  hours: z.coerce.number().int().min(1).max(48).optional(),
  /** `true` doda posamezne meritve (10- ali 30-minutne) — za grafe z gladko črto.
   * Privzeto jih NI: ploščici zadostujejo urne vrednosti, njen odgovor pa je s tem
   * desetkrat manjši. */
  raw: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

meteoRouter.get('/meteo/history', requireScopes(METEO_SCOPES.read), async (req, res, next) => {
  try {
    const env = loadEnv();
    const query = historyQuerySchema.safeParse(req.query);
    if (!query.success) {
      next(badRequest(query.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')));
      return;
    }

    const requested = query.data.station?.toUpperCase();
    if (requested !== undefined && !isValidStationId(requested)) {
      next(badRequest('Oznaka postaje ni veljavna. Izberi jo s seznama iz GET /meteo/stations.'));
      return;
    }

    const settingsStation = await resolveMeteoStation(personalUserId(req));
    const stationId = requested ?? settingsStation.id;
    const sourceUrl = stationHistoryUrl(env.ARSO_STATION_BASE_URL, stationId);

    // Naslov je sestavljen iz naše osnove in preverjene oznake, a se preveri še kot naslov:
    // `ARSO_STATION_BASE_URL` pride iz okolja in bi lahko kazal kamor koli (člen VIII, SSRF).
    const urlCheck = validateOutboundUrl(sourceUrl);
    if (!urlCheck.ok) {
      next(badRequest(`Naslov vira meritev ni uporaben: ${urlCheck.message}`));
      return;
    }

    const result = await getOrRefresh({
      // Ključ je po POSTAJI in ne po uporabniku: vsebina je javna in enaka za vse, zato si
      // dva uporabnika z isto postajo delita en prenos (člen VIII).
      key: `meteo:history:${stationId}`,
      sourceUrl: urlCheck.url.href,
      ttlSeconds: env.METEO_CACHE_SECONDS,
      fetcher: createStationHistoryFetcher(urlCheck.url.href),
    });

    const parsed = parseStationHistory(asText(result.payload));
    const hours = query.data.hours ?? 48;
    const measurements = withinHours(parsed.measurements, hours);
    const summary = summarize(measurements);
    if (!summary) {
      next(serviceUnavailable('Postaja v zadnjih urah ni poslala nobene meritve.'));
      return;
    }

    res.json({
      station: {
        id: stationId,
        title: parsed.station.title,
        altitudeM: parsed.station.altitudeM,
        latitude: parsed.station.latitude,
        longitude: parsed.station.longitude,
        /** Ali je postaja uporabnikova izbira ali privzetek namestitve — vmesnik to pove. */
        chosen: requested !== undefined || settingsStation.chosen,
      },
      hours,
      /** Urne vrednosti — os, po kateri se berejo padavine (kot na Bergfexu). */
      buckets: toHourlyBuckets(measurements),
      /** Posamezne meritve; prisotne samo ob `?raw=true`. */
      measurements: query.data.raw ? measurements : undefined,
      summary,
      available: detectAvailableSeries(measurements),
      source: buildMeteoSourceMeta(urlCheck.url.href, result.freshness, result.ageSeconds, env.METEO_CACHE_SECONDS),
    });
  } catch (err) {
    if (err instanceof CacheMissError) {
      next(
        serviceUnavailable(
          'Meritev te postaje še ni na voljo. Poskusi znova čez nekaj trenutkov; če se ponavlja, preveri oznako postaje v nastavitvah.',
        ),
      );
      return;
    }
    if (err instanceof ArsoHistoryFormatError) {
      // Struktura vira se je spremenila — to ni uporabnikova napaka in ne prazna ploščica
      // (člen VII: sistem, ki je pokvarjen, mora povedati, da je pokvarjen).
      next(serviceUnavailable(`Oblika ARSO strani se je spremenila: ${err.message}`));
      return;
    }
    next(err);
  }
});

meteoRouter.get('/meteo/stations', requireScopes(METEO_SCOPES.read), async (req, res, next) => {
  try {
    const env = loadEnv();
    const sourceUrl = stationListUrl(env.ARSO_STATION_BASE_URL);
    const urlCheck = validateOutboundUrl(sourceUrl);
    if (!urlCheck.ok) {
      next(badRequest(`Naslov seznama postaj ni uporaben: ${urlCheck.message}`));
      return;
    }

    const result = await getOrRefresh({
      key: 'meteo:stations',
      sourceUrl: urlCheck.url.href,
      ttlSeconds: env.METEO_STATIONS_CACHE_SECONDS,
      fetcher: createStationListFetcher(urlCheck.url.href),
    });

    // Živi vir je posnetek ZADNJEGA OBJAVNEGA CIKLA in ne imenik postaj: ob 08:00 UTC je
    // vseboval 106 postaj, ob 09:25 istega dne 19 (glej domain/station-catalog.ts). Zato se
    // zlije z zapisanim imenikom — sicer uporabnik svoje postaje ob napačnem trenutku na
    // seznamu ne bi našel.
    const live = parseStationList(asText(result.payload));
    const stations = mergeStationCatalog(STATION_CATALOG, live);
    if (live.length === 0) {
      // Seznam je še vedno uporaben (zapisani imenik), a prazen živi vir pomeni, da se je
      // oblika najbrž spremenila — to mora biti vidno v dnevniku in ne samo v tišini (člen VII).
      req.log?.warn({ sourceUrl: urlCheck.url.href }, 'ARSO seznam postaj je prišel brez postaj');
    }

    const selected = await resolveMeteoStation(personalUserId(req));
    res.json({
      stations,
      /** Trenutno veljavna postaja, da vmesnik ne ugiba, katero naj v seznamu označi. */
      selected: { id: selected.id, chosen: selected.chosen },
      source: buildMeteoSourceMeta(
        urlCheck.url.href,
        result.freshness,
        result.ageSeconds,
        env.METEO_STATIONS_CACHE_SECONDS,
      ),
    });
  } catch (err) {
    if (err instanceof CacheMissError) {
      next(serviceUnavailable('Seznama postaj še ni na voljo. Poskusi znova čez nekaj trenutkov.'));
      return;
    }
    next(err);
  }
});

/** Telo iz predpomnilnika je niz (glej client.ts). Buffer se pojavi samo pri zapisih, ki so
 * nastali pred to obliko — preberemo ga kot besedilo namesto da bi vrgli. */
function asText(payload: unknown): string {
  if (typeof payload === 'string') return payload;
  if (Buffer.isBuffer(payload)) return payload.toString('utf8');
  throw new ArsoHistoryFormatError('Predpomnjeno telo vira ni besedilo.');
}

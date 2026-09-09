import { Router } from 'express';
import { z } from 'zod';
import { loadEnv } from '../../platform/config/env.js';
import { requireScopes } from '../../platform/auth/scopes.js';
import { badRequest, serviceUnavailable } from '../../platform/errors/problem.js';
import { getOrRefresh, CacheMissError, type CacheResult } from '../../platform/cache/service.js';
import { resolveMeteoStation, resolveMeteoStations } from '../../platform/settings/meteo.service.js';
import {
  formatStationRef,
  isValidProvider,
  parseStationRef,
  stationRefEquals,
  type MeteoStationRef,
} from '../../domain/meteo-station-ref.js';
import { validateOutboundUrl } from '../../domain/outbound-url.js';
import { StationHistoryFormatError, type ProviderStation } from './domain/measurement.js';
import {
  STATION_ZONE,
  detectAvailableSeries,
  precipitationWindows,
  summarize,
  toHourlyBuckets,
  withinHours,
} from './domain/hourly.js';
import { buildMeteoSourceMeta } from './mappers/source.mapper.js';
import { ALL_PROVIDERS, providerFor, type SourceRequest, type StationProvider } from './providers/index.js';
import { METEO_SCOPES } from './scopes.js';

// 011: meritve samodejnih postaj — dvodnevna zgodovina po urah (temperatura, padavine,
// veter, vlaga, tlak, sevanje, sneg).
//
// Zakaj svoj modul in ne ploščica na nadzorni plošči: nadzorna plošča kaže TRENUTNO stanje v
// enem pogledu, tu pa gre za pregled ČASOVNEGA POTEKA z grafi in izbiro postaje — svoj zaslon,
// svoj namespace, svoja odstranljivost (člen I). Ploščica na nadzorni plošči vseeno obstaja,
// a je samo povzetek (urne padavine zadnjih 24 h), ki odpre ta zavihek.
//
// DVA PONUDNIKA, VEČ POSTAJ (razširitev): postaja je sklic `<ponudnik>:<oznaka>`
// (`domain/meteo-station-ref.ts`), uporabnik jih ima izbranih več in med njimi na zavihku
// preklaplja. Router ne ve, kako se kateri vir bere — to zna ponudnik (`providers/`); router
// zna samo to, da gre VSAK prenos prek `platform/cache/service.ts` (člen VIII).
export const meteoRouter = Router();

/** Klicatelj z API ključem osebnih nastavitev nima (isti dogovor kot pri `resolveTabs`). */
function personalUserId(req: { auth?: { subjectType: string; subjectId: string } }): string | null {
  return req.auth?.subjectType === 'user' ? req.auth.subjectId : null;
}

const historyQuerySchema = z.object({
  /** Prepis izbrane postaje za ta klic — člen III: kar zmore vmesnik, mora zmoči tudi HTTP
   * klic. Sprejme se `arso:VRHNIKA`, `neverin:sveta-marina` in gola ARSO oznaka (`VRHNIKA`),
   * ker so take vrednosti pošiljali klicatelji pred razširitvijo na več ponudnikov. */
  station: z.string().trim().min(1).max(80).optional(),
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

    let requested: MeteoStationRef | null = null;
    if (query.data.station !== undefined) {
      requested = parseStationRef(query.data.station);
      if (!requested) {
        next(
          badRequest(
            'Oznaka postaje ni veljavna. Izberi jo s seznama iz GET /meteo/stations — sklic je ' +
              'oblike "arso:VRHNIKA" ali "neverin:sveta-marina".',
          ),
        );
        return;
      }
    }

    const settings = await resolveMeteoStation(personalUserId(req));
    const ref = requested ?? settings.station;
    const provider = providerFor(ref.provider);
    const request = provider.historyRequest(env, ref.id);

    // Naslov je sestavljen iz naše osnove in preverjene oznake, a se preveri še kot naslov:
    // osnova pride iz okolja in bi lahko kazala kamor koli (člen VIII, SSRF).
    const urlCheck = validateOutboundUrl(request.sourceUrl);
    if (!urlCheck.ok) {
      next(badRequest(`Naslov vira meritev ni uporaben: ${urlCheck.message}`));
      return;
    }

    const result = await getOrRefresh({ ...request, sourceUrl: urlCheck.url.href });

    const parsed = provider.parseHistory(asText(result.payload));
    const hours = query.data.hours ?? 48;
    const measurements = withinHours(parsed.measurements, hours);
    const summary = summarize(measurements);
    if (!summary) {
      next(serviceUnavailable('Postaja v zadnjih urah ni poslala nobene meritve.'));
      return;
    }

    // Ura v grafu je koledarska ura POSTAJE in ne brskalnika (člen V.4). Cono pove vir, kadar
    // jo pozna (Neverin pri vsaki postaji), sicer velja privzetek.
    const zone = parsed.station.timezone ?? STATION_ZONE;

    res.json({
      station: {
        ref: formatStationRef(ref),
        provider: provider.id,
        providerLabel: provider.label,
        id: ref.id,
        title: parsed.station.title,
        altitudeM: parsed.station.altitudeM,
        latitude: parsed.station.latitude,
        longitude: parsed.station.longitude,
        timezone: zone,
        /** Kdo postajo upravlja, kadar to ni ponudnik sam (Neverin je omrežje tujih postaj). */
        operator: parsed.station.operator,
        /** Ali je postaja uporabnikova izbira ali privzetek namestitve — vmesnik to pove. */
        chosen: requested !== null || settings.chosen,
      },
      hours,
      /** Urne vrednosti — os, po kateri se berejo padavine (kot na Bergfexu). */
      buckets: toHourlyBuckets(measurements, zone),
      /** Posamezne meritve; prisotne samo ob `?raw=true`. */
      measurements: query.data.raw ? measurements : undefined,
      summary,
      /** Vsote padavin po oknih (4/8/12/24/48 h). Računajo se iz CELOTNE prebrane serije in ne
       * iz prikazanega okna — "koliko je padlo v 48 urah" je smiselno vprašanje tudi ob
       * 6-urnem grafu. */
      precipitationWindows: precipitationWindows(parsed.measurements),
      available: detectAvailableSeries(measurements),
      source: buildMeteoSourceMeta(
        // Človeku se ponudi STRAN postaje in ne naslov, s katerega bere strežnik: pri
        // Neverinu je to JSON, ki v brskalniku ni berljiv.
        provider.stationPageUrl(env, ref.id),
        provider.attribution,
        result.freshness,
        result.ageSeconds,
        request.ttlSeconds,
      ),
    });
  } catch (err) {
    next(translateSourceError(err, 'Meritev te postaje še ni na voljo.'));
  }
});

const stationsQuerySchema = z.object({
  /** Samo postaje enega ponudnika. Člen III: vmesnik zna filtrirati, torej mora znati tudi
   * klic — in odjemalec, ki ga zanima samo ARSO, ne prenaša 1335 tujih postaj. */
  provider: z.string().trim().toLowerCase().optional(),
  /** Iskanje po imenu ali oznaki postaje. */
  q: z.string().trim().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(3000).optional(),
});

meteoRouter.get('/meteo/stations', requireScopes(METEO_SCOPES.read), async (req, res, next) => {
  try {
    const env = loadEnv();
    const query = stationsQuerySchema.safeParse(req.query);
    if (!query.success) {
      next(badRequest(query.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')));
      return;
    }
    if (query.data.provider !== undefined && !isValidProvider(query.data.provider)) {
      next(badRequest(`Ponudnik "${query.data.provider}" ne obstaja. Na voljo sta "arso" in "neverin".`));
      return;
    }

    const wanted = query.data.provider;
    const providers = wanted ? ALL_PROVIDERS.filter((p) => p.id === wanted) : ALL_PROVIDERS;
    const loaded = await Promise.all(providers.map((provider) => loadStations(provider, env, req)));

    const needle = foldForSearch(query.data.q ?? '');
    let stations = loaded.flatMap((entry) =>
      entry.stations.map((station) => ({
        ref: `${entry.provider.id}:${station.id}`,
        provider: entry.provider.id,
        id: station.id,
        title: station.title,
        altitudeM: station.altitudeM,
        latitude: station.latitude,
        longitude: station.longitude,
        countryCode: station.countryCode,
      })),
    );
    if (needle.length > 0) {
      stations = stations.filter(
        (station) => foldForSearch(station.title).includes(needle) || foldForSearch(station.id).includes(needle),
      );
    }
    // Po imenu in po slovensko, čez oba ponudnika skupaj: seznam je namenjen iskanju s
    // pogledom in človek ne išče "najprej ARSO, potem Neverin", ampak kraj.
    stations.sort((a, b) => a.title.localeCompare(b.title, 'sl'));

    const total = stations.length;
    const limit = query.data.limit;
    if (limit !== undefined && total > limit) stations = stations.slice(0, limit);

    const selected = await resolveMeteoStations(personalUserId(req));
    res.json({
      stations,
      /** Koliko postaj se ujema z iskanjem, tudi kadar jih je vrnjenih manj (`?limit=`). */
      total,
      providers: loaded.map((entry) => ({
        id: entry.provider.id,
        label: entry.provider.label,
        attribution: entry.provider.attribution,
        stationCount: entry.stations.length,
        /** Seznama tega ponudnika ni bilo mogoče prenesti. Ostali so vseeno v odgovoru —
         * izpad enega vira ne sme pomeniti praznega seznama (člen VII: vidno, ne tiho). */
        unavailable: entry.unavailable,
        source: entry.source,
      })),
      /** Trenutno veljavne postaje, da vmesnik ne ugiba, katere naj v seznamu označi. */
      selected: selected.stations.map(formatStationRef),
      chosen: selected.chosen,
    });
  } catch (err) {
    next(translateSourceError(err, 'Seznama postaj še ni na voljo.'));
  }
});

/**
 * Izbrane postaje z imeni — za preklopnik na zavihku.
 *
 * Zakaj svoj endpoint in ne branje iz `/settings`: nastavitve hranijo samo sklice
 * (`neverin:sveta-marina`), preklopnik pa potrebuje IMENA. Brez tega bi moral zavihek
 * prenesti seznam vseh 1441 postaj, da izriše tri čipe.
 */
meteoRouter.get('/meteo/selection', requireScopes(METEO_SCOPES.read), async (req, res, next) => {
  try {
    const env = loadEnv();
    const selected = await resolveMeteoStations(personalUserId(req));

    // Seznami se preberejo samo za ponudnike, ki v izbiri sploh nastopajo — kdor ima izbrane
    // le ARSO postaje, zaradi preklopnika ne sproži prenosa pri Neverinu.
    const used = [...new Set(selected.stations.map((ref) => ref.provider))];
    const catalogs = new Map<string, ProviderStation[]>();
    await Promise.all(
      used.map(async (id) => {
        const entry = await loadStations(providerFor(id), env, req);
        catalogs.set(id, entry.stations);
      }),
    );

    res.json({
      stations: selected.stations.map((ref) => {
        const provider = providerFor(ref.provider);
        const known = catalogs.get(ref.provider)?.find((station) => station.id === ref.id);
        return {
          ref: formatStationRef(ref),
          provider: provider.id,
          providerLabel: provider.label,
          id: ref.id,
          // Ime iz seznama; kadar seznama ni bilo mogoče prenesti ali postaje v njem ni,
          // ostane oznaka. Čip brez imena je še vedno uporaben preklopnik, prazen čip ni.
          title: known?.title ?? ref.id,
          altitudeM: known?.altitudeM ?? null,
          latitude: known?.latitude ?? null,
          longitude: known?.longitude ?? null,
          countryCode: known?.countryCode ?? null,
          /** Ali je ta postaja tista, ki jo dobi klic brez `?station=` (in ploščica). */
          primary: stationRefEquals(ref, selected.stations[0]!),
        };
      }),
      chosen: selected.chosen,
    });
  } catch (err) {
    next(translateSourceError(err, 'Izbranih postaj še ni bilo mogoče prebrati.'));
  }
});

interface LoadedStations {
  provider: StationProvider;
  stations: ProviderStation[];
  unavailable: boolean;
  source: ReturnType<typeof buildMeteoSourceMeta> | null;
}

/**
 * Seznam postaj enega ponudnika — brez metanja.
 *
 * Izpad enega ponudnika NE sme izprazniti seznama drugega: uporabnik, ki išče Vrhniko, je ne
 * sme izgubiti zato, ker je nedosegljiv hrvaški vir. Napaka se zato zabeleži in pove v
 * odgovoru (`unavailable`), namesto da bi postala 503 za vse (člen VII: vidno, ne tiho).
 */
async function loadStations(
  provider: StationProvider,
  env: Parameters<StationProvider['stationsRequest']>[0],
  req: { log?: { warn: (obj: unknown, msg: string) => void } },
): Promise<LoadedStations> {
  const unavailable: LoadedStations = { provider, stations: [], unavailable: true, source: null };

  let request: SourceRequest;
  try {
    request = provider.stationsRequest(env);
  } catch (err) {
    req.log?.warn({ provider: provider.id, err }, 'Seznama postaj ni bilo mogoče sestaviti');
    return unavailable;
  }

  const urlCheck = validateOutboundUrl(request.sourceUrl);
  if (!urlCheck.ok) {
    req.log?.warn(
      { provider: provider.id, sourceUrl: request.sourceUrl, reason: urlCheck.reason },
      'Naslov seznama postaj ni uporaben',
    );
    return unavailable;
  }

  let result: CacheResult;
  try {
    result = await getOrRefresh({ ...request, sourceUrl: urlCheck.url.href });
  } catch (err) {
    req.log?.warn({ provider: provider.id, err }, 'Seznama postaj ni bilo mogoče prenesti');
    return unavailable;
  }

  let stations: ProviderStation[];
  try {
    stations = provider.parseStations(asText(result.payload));
  } catch (err) {
    req.log?.warn({ provider: provider.id, err }, 'Seznama postaj ni bilo mogoče razčleniti');
    return unavailable;
  }

  if (stations.length === 0) {
    // Prazen seznam pri viru, ki ga sicer pozna na stotine, pomeni, da se je oblika najbrž
    // spremenila — to mora biti vidno v dnevniku in ne samo v tišini (člen VII).
    req.log?.warn({ provider: provider.id, sourceUrl: urlCheck.url.href }, 'Seznam postaj je prišel prazen');
  }

  return {
    provider,
    stations,
    unavailable: false,
    source: buildMeteoSourceMeta(
      urlCheck.url.href,
      provider.attribution,
      result.freshness,
      result.ageSeconds,
      request.ttlSeconds,
    ),
  };
}

/**
 * Napaka pri branju vira → odgovor, ki pove, kaj je narobe.
 *
 * Nikoli prazne serije: tiha napaka je hrošč najvišje resnosti (člen VII). Napaka, ki ni od
 * vira, gre nespremenjena naprej — ta funkcija ne sme pogoltniti hrošča v naši kodi.
 */
function translateSourceError(err: unknown, missMessage: string): unknown {
  if (err instanceof CacheMissError) {
    return serviceUnavailable(
      `${missMessage} Poskusi znova čez nekaj trenutkov; če se ponavlja, preveri izbrano postajo v nastavitvah.`,
    );
  }
  if (err instanceof StationHistoryFormatError) {
    // Struktura vira se je spremenila — to ni uporabnikova napaka in ne prazna ploščica.
    return serviceUnavailable(`Oblika vira meritev se je spremenila: ${err.message}`);
  }
  return err;
}

/**
 * Male črke brez diakritike — oblika, v kateri se primerja iskani niz ("sveta" najde "Sveta",
 * "cesnjica" najde "Češnjica").
 *
 * Isto pravilo je v `modules/saved-links/domain/search-text.ts` in v
 * `apps/web/src/app/core/search/fold-text.ts`. Prepisano in ne uvoženo: uvoz med moduli
 * prepoveduje člen I (enak dogovor kot pri `mappers/source.mapper.ts`), funkcija pa je pet
 * vrstic brez tabele — `normalize('NFD')` razstavi `č` na `c` in kljukico, ki jo odstranimo.
 */
function foldForSearch(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Telo iz predpomnilnika je niz (glej client.ts). Buffer se pojavi samo pri zapisih, ki so
 * nastali pred to obliko — preberemo ga kot besedilo namesto da bi vrgli. */
function asText(payload: unknown): string {
  if (typeof payload === 'string') return payload;
  if (Buffer.isBuffer(payload)) return payload.toString('utf8');
  throw new StationHistoryFormatError('Predpomnjeno telo vira ni besedilo.');
}

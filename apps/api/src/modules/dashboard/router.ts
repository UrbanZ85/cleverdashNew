import { Router } from 'express';
import { loadEnv } from '../../platform/config/env.js';
import { getOrRefresh, CacheMissError } from '../../platform/cache/service.js';
import { createArsoWeatherFetcher, parseArsoWeather } from '../../platform/arso/weather.client.js';
import { resolveRadarSource, resolveWeatherSource } from '../../platform/sources/resolution.service.js';
import { createArsoRadarFetcher } from './clients/arso-radar.client.js';
import { createComputeRoutesFetcher } from './clients/google-routes.client.js';
import { toWeatherReading, toForecastResponse, buildSourceMeta } from './mappers/weather.mapper.js';
import {
  GOOGLE_ROUTES_ATTRIBUTION,
  isStale,
  legLabel,
  type CommuteLegResponse,
  type CommuteResponse,
} from './mappers/commute.mapper.js';
import { resolveCommutePlaces } from '../../platform/settings/commute.service.js';
import {
  NoRouteError,
  buildComputeRoutesBody,
  commuteCacheKey,
  parseComputeRoutesResponse,
  type CommuteDirection,
  type CommutePlace,
} from '../../domain/commute-route.js';
import { buildDirectionsEmbedUrl } from '../../domain/map-embed.js';
import { serviceUnavailable } from '../../platform/errors/problem.js';
import { requireScopes } from '../../platform/auth/scopes.js';

// FR-025: zunanji podatki gredo izključno prek strežniškega predpomnilnika (getOrRefresh);
// odjemalec ARSO nikoli ne kliče neposredno — člen VIII.
export const dashboardRouter = Router();

/** Klicatelj z API ključem nima osebnih nastavitev (isti dogovor kot pri `resolveTabs`) —
 * zanj veljajo sistemski privzetki iz `.env`. */
function personalUserId(req: { auth?: { subjectType: string; subjectId: string } }): string | null {
  return req.auth?.subjectType === 'user' ? req.auth.subjectId : null;
}

dashboardRouter.get('/dashboard/weather', requireScopes(), async (req, res, next) => {
  try {
    const env = loadEnv();
    // 005: lokacija in naslov vira prideta iz OSEBNIH nastavitev, s `.env` kot privzetkom.
    // Do zdaj je bila `Settings.weather` shranjena, a je ni bral nihče.
    const source = await resolveWeatherSource(personalUserId(req), req.query.location);
    const fetcher = createArsoWeatherFetcher(source.weatherUrl, source.location.name);

    const result = await getOrRefresh({
      key: source.cacheKey,
      sourceUrl: source.weatherUrl,
      ttlSeconds: env.WEATHER_CACHE_SECONDS,
      fetcher,
    });

    const data = parseArsoWeather(result.payload);
    const reading = toWeatherReading(
      data,
      source.location,
      result.freshness,
      result.ageSeconds,
      env.WEATHER_CACHE_SECONDS,
    );
    res.json(reading);
  } catch (err) {
    if (err instanceof CacheMissError) {
      next(serviceUnavailable('Vremenski podatek za to lokacijo še ni na voljo. Poskusi znova čez nekaj trenutkov.'));
      return;
    }
    next(err);
  }
});

dashboardRouter.get('/dashboard/forecast', requireScopes(), async (req, res, next) => {
  try {
    const env = loadEnv();
    const source = await resolveWeatherSource(personalUserId(req), req.query.location);
    // Ista predpomnjena osnova kot trenutno vreme (FR-024) — brez nove zunanje odvisnosti.
    const fetcher = createArsoWeatherFetcher(source.weatherUrl, source.location.name);

    const result = await getOrRefresh({
      key: source.cacheKey,
      sourceUrl: source.weatherUrl,
      ttlSeconds: env.WEATHER_CACHE_SECONDS,
      fetcher,
    });

    const data = parseArsoWeather(result.payload);
    const forecast = toForecastResponse(
      data,
      { name: source.location.name },
      result.freshness,
      result.ageSeconds,
      env.WEATHER_CACHE_SECONDS,
    );
    res.json(forecast);
  } catch (err) {
    if (err instanceof CacheMissError) {
      next(serviceUnavailable('Napoved za to lokacijo še ni na voljo. Poskusi znova čez nekaj trenutkov.'));
      return;
    }
    next(err);
  }
});

dashboardRouter.get('/dashboard/radar', requireScopes(), async (req, res, next) => {
  try {
    const env = loadEnv();
    const source = await resolveRadarSource(personalUserId(req));
    const fetcher = createArsoRadarFetcher(source.radarUrl);

    const result = await getOrRefresh({
      key: source.cacheKey,
      sourceUrl: source.radarUrl,
      ttlSeconds: env.RADAR_CACHE_SECONDS,
      fetcher,
    });

    const meta = buildSourceMeta(result.freshness, result.ageSeconds, env.RADAR_CACHE_SECONDS);
    res.set({
      'X-Source-Fetched-At': meta.fetchedAt,
      'X-Source-Stale': String(meta.stale),
      'X-Source-Next-Poll-Seconds': String(meta.nextPollSeconds),
      'X-Source-Attribution': meta.attribution.text,
    });
    res.type(result.contentType).send(result.payload);
  } catch (err) {
    if (err instanceof CacheMissError) {
      next(serviceUnavailable('Radarska slika še ni na voljo. Poskusi znova čez nekaj trenutkov.'));
      return;
    }
    next(err);
  }
});

// Ploščica "Pot" (nadzorna plošča): za obe smeri čas poti z upoštevanim prometom in naslov
// vdelanega zemljevida. Zunanji vir (Google Routes API) gre IZKLJUČNO prek strežniškega
// predpomnilnika — člen VIII in člen IV: ključ ostane tu, odjemalec ga nikoli ne vidi.
//
// Ena pot in ne dve (`/dashboard/commute/to-work`): odjemalec vedno potrebuje obe smeri
// (obe sta v ploščici hkrati), dve poti pa bi pomenili dve zahtevi za isti podatek.
//
// Izpad ene smeri ne sme odnesti druge: napaka se prevede v `travelUnavailable` na tisti
// smeri, ne v napako celega odgovora (FR-026). Zato tu ni `next(err)` za napake vira.
dashboardRouter.get('/dashboard/commute', requireScopes(), async (req, res, next) => {
  try {
    const env = loadEnv();
    const userId = personalUserId(req);
    const places = await resolveCommutePlaces(userId);
    const apiKey = env.GOOGLE_MAPS_SERVER_KEY?.trim() ?? '';

    // Pot domov je ista pot v nasprotni smeri — zato dva kraja in ne štirje.
    const directions: Array<{ direction: CommuteDirection; from: CommutePlace; to: CommutePlace }> = [
      { direction: 'to-work', from: places.home, to: places.work },
      { direction: 'to-home', from: places.work, to: places.home },
    ];

    const legs: CommuteLegResponse[] = [];
    for (const { direction, from, to } of directions) {
      const base = {
        direction,
        label: legLabel(direction),
        from: from.label,
        to: to.label,
        // Zemljevid je odvisen SAMO od krajev, zato je na voljo tudi brez ključa za Routes
        // API — ploščica takrat pokaže zemljevida in pove, da časa poti ni.
        mapEmbedUrl: buildDirectionsEmbedUrl(from, to, { embedApiKey: env.GOOGLE_MAPS_EMBED_KEY }),
      };

      // `userId` je `null` samo pri klicatelju z API ključem — ta osebnih krajev nima, zato
      // je zanj `configured` že `false`. Preverjena sta oba, da ključ predpomnilnika ni
      // odvisen od tega sklepanja.
      if (!userId || !places.configured) {
        legs.push({ ...base, travel: null, travelUnavailable: 'not-configured', stale: false, ageSeconds: null });
        continue;
      }
      if (apiKey.length === 0) {
        legs.push({ ...base, travel: null, travelUnavailable: 'no-api-key', stale: false, ageSeconds: null });
        continue;
      }

      try {
        const result = await getOrRefresh({
          key: commuteCacheKey(userId, direction, from, to),
          sourceUrl: env.GOOGLE_ROUTES_URL,
          ttlSeconds: env.COMMUTE_CACHE_SECONDS,
          fetcher: createComputeRoutesFetcher({
            url: env.GOOGLE_ROUTES_URL,
            apiKey,
            body: buildComputeRoutesBody(from, to, new Date()),
            timeoutMs: env.COMMUTE_ROUTES_TIMEOUT_MS,
          }),
        });

        legs.push({
          ...base,
          travel: parseComputeRoutesResponse(result.payload),
          travelUnavailable: null,
          stale: isStale(result.freshness),
          ageSeconds: result.ageSeconds,
        });
      } catch (err) {
        // Člen VI: tiha napaka ni sprejemljiva. `getOrRefresh` neuspeh vira že zabeleži v
        // `lastError`; tu se zabeleži še odločitev, ki jo je zaradi tega sprejela ta pot.
        const unavailable = err instanceof NoRouteError ? 'no-route' : 'source-unavailable';
        req.log.warn(
          { event: 'dashboard.commute.unavailable', direction, reason: unavailable, err },
          'Časa poti ni bilo mogoče izračunati',
        );
        legs.push({ ...base, travel: null, travelUnavailable: unavailable, stale: false, ageSeconds: null });
      }
    }

    const response: CommuteResponse = {
      configured: places.configured,
      legs,
      source: { nextPollSeconds: env.COMMUTE_CACHE_SECONDS, attribution: GOOGLE_ROUTES_ATTRIBUTION },
    };
    res.json(response);
  } catch (err) {
    next(err);
  }
});

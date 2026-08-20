import { Router } from 'express';
import { loadEnv } from '../../platform/config/env.js';
import { getOrRefresh, CacheMissError } from '../../platform/cache/service.js';
import { createArsoWeatherFetcher, parseArsoWeather } from './clients/arso-weather.client.js';
import { createArsoRadarFetcher } from './clients/arso-radar.client.js';
import { toWeatherReading, toForecastResponse, buildSourceMeta } from './mappers/weather.mapper.js';
import { serviceUnavailable } from '../../platform/errors/problem.js';
import { requireScopes } from '../../platform/auth/scopes.js';

// FR-025: zunanji podatki gredo izključno prek strežniškega predpomnilnika (getOrRefresh);
// odjemalec ARSO nikoli ne kliče neposredno — člen VIII.
export const dashboardRouter = Router();

// TODO(US3/US6, T081+): ko obstaja Settings model, naj privzeta lokacija pride od tam;
// query parameter `location` ostane in ima prednost — pogodba se s tem ne spremeni.
function resolveLocation(queryLocation: unknown, defaultLocation: string): string {
  return typeof queryLocation === 'string' && queryLocation.length > 0 ? queryLocation : defaultLocation;
}

dashboardRouter.get('/dashboard/weather', requireScopes(), async (req, res, next) => {
  try {
    const env = loadEnv();
    const location = resolveLocation(req.query.location, env.ARSO_DEFAULT_LOCATION);
    const fetcher = createArsoWeatherFetcher(env.ARSO_WEATHER_URL, location);

    const result = await getOrRefresh({
      key: `weather:${location}`,
      sourceUrl: env.ARSO_WEATHER_URL,
      ttlSeconds: env.WEATHER_CACHE_SECONDS,
      fetcher,
    });

    const data = parseArsoWeather(result.payload);
    const reading = toWeatherReading(
      data,
      { name: location, latitude: null, longitude: null },
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
    const location = resolveLocation(req.query.location, env.ARSO_DEFAULT_LOCATION);
    // Ista predpomnjena osnova kot trenutno vreme (FR-024) — brez nove zunanje odvisnosti.
    const fetcher = createArsoWeatherFetcher(env.ARSO_WEATHER_URL, location);

    const result = await getOrRefresh({
      key: `weather:${location}`,
      sourceUrl: env.ARSO_WEATHER_URL,
      ttlSeconds: env.WEATHER_CACHE_SECONDS,
      fetcher,
    });

    const data = parseArsoWeather(result.payload);
    const forecast = toForecastResponse(
      data,
      { name: location },
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

dashboardRouter.get('/dashboard/radar', requireScopes(), async (_req, res, next) => {
  try {
    const env = loadEnv();
    const fetcher = createArsoRadarFetcher(env.ARSO_RADAR_URL);

    const result = await getOrRefresh({
      key: 'radar:si0-rm-anim',
      sourceUrl: env.ARSO_RADAR_URL,
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

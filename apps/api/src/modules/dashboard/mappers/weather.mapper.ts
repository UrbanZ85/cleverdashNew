import type { FreshnessState } from '../../../domain/freshness.js';
import type { ArsoTimelineEntry, ArsoWeatherData } from '../clients/arso-weather.client.js';

// FR-027, SC-009: navedba vira je funkcionalna zahteva. Strežnik jo postavi tukaj, enkrat,
// za oba odgovora — odjemalec je ne more pozabiti izrisati, ker je del podatka samega.
const ARSO_ATTRIBUTION = {
  text: 'Vir: ARSO',
  url: 'https://meteo.arso.gov.si',
} as const;

export interface SourceMeta {
  fetchedAt: string;
  ageSeconds: number;
  stale: boolean;
  nextPollSeconds: number;
  attribution: typeof ARSO_ATTRIBUTION;
}

export function buildSourceMeta(freshness: FreshnessState, ageSeconds: number, nextPollSeconds: number): SourceMeta {
  const fetchedAt = freshness.kind === 'never-fetched' ? new Date(0).toISOString() : freshness.fetchedAt.toISOString();
  return {
    fetchedAt,
    ageSeconds,
    stale: freshness.kind === 'stale',
    nextPollSeconds,
    attribution: ARSO_ATTRIBUTION,
  };
}

export interface WeatherReading {
  location: { name: string; latitude: number | null; longitude: number | null };
  observation: {
    temperatureC: number | null;
    humidityPercent: number | null;
    windSpeed: string | null;
    windDirection: string | null;
    skyCondition: string | null;
    icon: string | null;
    measuredAt: string | null;
  };
  source: SourceMeta;
}

export interface ForecastResponse {
  location: { name: string };
  entries: Array<{
    validAt: string;
    temperatureC: number | null;
    skyCondition: string | null;
    icon: string | null;
  }>;
  source: SourceMeta;
}

function toEntry(e: ArsoTimelineEntry | null) {
  return {
    temperatureC: e?.temperatureC ?? null,
    humidityPercent: e?.humidityPercent ?? null,
    windSpeed: e?.windSpeed ?? null,
    windDirection: e?.windDirection ?? null,
    skyCondition: e?.skyCondition ?? null,
    icon: e?.icon ?? null,
    measuredAt: e?.validAt ?? null,
  };
}

export function toWeatherReading(
  data: ArsoWeatherData,
  location: { name: string; latitude: number | null; longitude: number | null },
  freshness: FreshnessState,
  ageSeconds: number,
  nextPollSeconds: number,
): WeatherReading {
  return {
    location,
    observation: toEntry(data.current),
    source: buildSourceMeta(freshness, ageSeconds, nextPollSeconds),
  };
}

export function toForecastResponse(
  data: ArsoWeatherData,
  location: { name: string },
  freshness: FreshnessState,
  ageSeconds: number,
  nextPollSeconds: number,
): ForecastResponse {
  return {
    location,
    entries: data.forecast.map((e) => ({
      validAt: e.validAt,
      temperatureC: e.temperatureC,
      skyCondition: e.skyCondition,
      icon: e.icon,
    })),
    source: buildSourceMeta(freshness, ageSeconds, nextPollSeconds),
  };
}

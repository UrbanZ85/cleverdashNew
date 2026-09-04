import { z } from 'zod';
import type { ConditionalFetchResult } from '../cache/service.js';

// research.md §3 (001) in §2 (003). Oblika preverjena neposredno proti živemu odgovoru
// 19. 8. 2026: https://vreme.arso.gov.si/api/1.0/location/?location=Ljubljana
// `observation` ima en dan z enim vnosom v timeline (trenutna meritev); `forecast3h` ima
// do 7 dni po 8 vnosov na 3 ure. Vsa številska polja ARSO vrača kot nize.
//
// `.passthrough()` povsod: berejo se samo polja, ki jih FR-023/FR-024 (001) in FR-037 (003)
// zahtevajo; sprememba v neuporabljenem delu odgovora ne sme podreti ploščice/predloge.
// Sprememba v UPORABLJENEM delu pa zavrne `.parse()` in sproži pot "spremenjena struktura"
// iz research.md §13 (001).
//
// Ta datoteka je premaknjena iz `modules/dashboard/clients/arso-weather.client.ts`
// (003, research.md §2, plan.md Complexity Tracking) — dashboard (001, vreme) in cameras
// (003, webcam predloga FR-037) potrebujeta isti predpomnjen zapis; premik v `platform/`
// prepreči podvojen klic ARSO (člen VIII) in klic enega modula v drugega (člen I).

const webcamSchema = z
  .object({
    direction: z.string(),
    image: z.string(),
  })
  .passthrough();

const timelineEntrySchema = z
  .object({
    t: z.string().optional(),
    rh: z.string().optional(),
    ff_val: z.string().optional(),
    ff_shortText: z.string().optional(),
    dd_shortText: z.string().optional(),
    clouds_shortText: z.string().optional(),
    clouds_icon_wwsyn_icon: z.string().optional(),
    webcam: z.array(webcamSchema).optional(),
    valid: z.string(),
  })
  .passthrough();

const daySchema = z
  .object({
    date: z.string(),
    timeline: z.array(timelineEntrySchema),
  })
  .passthrough();

const sourceSectionSchema = z
  .object({
    features: z
      .array(
        z
          .object({
            properties: z.object({ days: z.array(daySchema) }).passthrough(),
          })
          .passthrough(),
      )
      .min(1),
  })
  .passthrough();

const arsoResponseSchema = z
  .object({
    observation: sourceSectionSchema,
    forecast3h: sourceSectionSchema,
  })
  .passthrough();

export interface ArsoWebcam {
  direction: string;
  image: string;
}

export interface ArsoTimelineEntry {
  temperatureC: number | null;
  humidityPercent: number | null;
  windSpeed: string | null;
  windDirection: string | null;
  skyCondition: string | null;
  icon: string | null;
  validAt: string;
  /** FR-037 (003): slike spletnih kamer za ta odčitek, če jih ARSO za lokacijo ponuja. */
  webcam: ArsoWebcam[];
}

export interface ArsoWeatherData {
  current: ArsoTimelineEntry | null;
  forecast: ArsoTimelineEntry[];
}

function toNumber(v: string | undefined): number | null {
  if (v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function mapEntry(raw: z.infer<typeof timelineEntrySchema>): ArsoTimelineEntry {
  return {
    temperatureC: toNumber(raw.t),
    humidityPercent: toNumber(raw.rh),
    windSpeed: raw.ff_shortText ?? null,
    windDirection: raw.dd_shortText ?? null,
    skyCondition: raw.clouds_shortText ?? null,
    icon: raw.clouds_icon_wwsyn_icon ?? null,
    validAt: raw.valid,
    webcam: raw.webcam ?? [],
  };
}

/** Razčleni surov odgovor ARSO v ozek nabor polj. Vrže, če se struktura uporabljenega dela
 * spremeni — klicatelj (cache/service.ts prek fetcherja) to obravnava kot neuspel poskus. */
export function parseArsoWeather(raw: unknown): ArsoWeatherData {
  const parsed = arsoResponseSchema.parse(raw);
  const currentRaw = parsed.observation.features[0]?.properties.days[0]?.timeline[0];
  const forecastRaw = parsed.forecast3h.features[0]?.properties.days.flatMap((d) => d.timeline).slice(0, 8) ?? [];

  return {
    current: currentRaw ? mapEntry(currentRaw) : null,
    forecast: forecastRaw.map(mapEntry),
  };
}

/** Fetcher za `getOrRefresh`. ARSO na tem viru ne pošilja `ETag`/`Last-Modified`
 * (research.md §3, 001), zato pogojnih glav ni — vsaka osvežitev je poln prenos. */
export function createArsoWeatherFetcher(sourceUrl: string, location: string) {
  // Sprejme pogojne glave zaradi skupnega tipa `Fetcher`, a jih ne uporabi — ARSO jih na
  // tem viru ne pošilja (research.md §3); vsaka osvežitev je poln prenos.
  return async function fetchArsoWeather(_conditional: {
    etag: string | null;
    lastModified: string | null;
  }): Promise<ConditionalFetchResult> {
    const url = new URL(sourceUrl);
    url.searchParams.set('location', location);
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok) {
      throw new Error(`ARSO (vreme) je vrnil ${res.status}`);
    }
    const json = await res.json();
    // Validacija se izvede tukaj, ne šele v mapperju — napačna struktura mora šteti kot
    // neuspel poskus osvežitve (getOrRefresh jo ujame in vrne zadnji znani podatek).
    parseArsoWeather(json);
    return { status: 200, body: json, contentType: 'application/json' };
  };
}

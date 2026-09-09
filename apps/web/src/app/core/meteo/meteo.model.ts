// Čisti model meritev ARSO postaje — BREZ uvozov iz @angular/*, da je preverljiv brez
// TestBed-a (isti razlog kot pri core/plugins/plugin.model.ts in core/settings/settings.model.ts).
//
// Zakaj v `core/` in ne v `features/meteo/`: potrebujeta ga DVA zavihka — zavihek z grafi in
// zaslon z nastavitvami (izbira postaje) — uvoz med zavihkoma pa prepoveduje člen I
// (eslint `cleverdash/module-boundary`). Ploščica na nadzorni plošči je tretji odjemalec.

/** Ena meritev, kot jo vrne `GET /meteo/history?raw=true`. Vsako polje je lahko `null`:
 * postaja merilnika nima ali meritev tisti trenutek ni prišla. `null` ni `0`. */
export interface MeteoMeasurement {
  validUtc: string;
  temperatureC: number | null;
  humidityPct: number | null;
  windAvgKmh: number | null;
  windMaxKmh: number | null;
  windDirectionDeg: number | null;
  precipitationMm: number | null;
  precipitation12hMm: number | null;
  pressureMslHpa: number | null;
  pressureHpa: number | null;
  globalRadiationWm2: number | null;
  diffuseRadiationWm2: number | null;
  snowCm: number | null;
  waterTemperatureC: number | null;
  cloudsIcon: string | null;
}

/** Urna vrednost — os, po kateri se berejo padavine. */
export interface MeteoHourBucket {
  startUtc: string;
  label: string;
  dayLabel: string;
  precipitationMm: number | null;
  temperatureAvgC: number | null;
  temperatureMinC: number | null;
  temperatureMaxC: number | null;
  humidityAvgPct: number | null;
  windAvgKmh: number | null;
  windMaxKmh: number | null;
  windDirectionDeg: number | null;
  pressureHpa: number | null;
  globalRadiationWm2: number | null;
  snowCm: number | null;
  samples: number;
}

export interface MeteoStation {
  id: string;
  title: string;
  altitudeM: number | null;
  latitude: number | null;
  longitude: number | null;
  /** `false` pomeni, da je to privzetek namestitve in ne uporabnikova izbira. */
  chosen: boolean;
}

export interface MeteoSummary {
  fromUtc: string;
  toUtc: string;
  temperatureMinC: number | null;
  temperatureMaxC: number | null;
  precipitationTotalMm: number | null;
  precipitation24hMm: number | null;
  windMaxKmh: number | null;
  latest: MeteoMeasurement;
}

export interface MeteoAvailableSeries {
  temperature: boolean;
  humidity: boolean;
  wind: boolean;
  precipitation: boolean;
  pressure: boolean;
  radiation: boolean;
  snow: boolean;
  waterTemperature: boolean;
}

export interface MeteoSource {
  url: string;
  fetchedAt: string;
  ageSeconds: number;
  stale: boolean;
  nextPollSeconds: number;
  attribution: { text: string; url: string };
}

export interface MeteoHistory {
  station: MeteoStation;
  hours: number;
  buckets: MeteoHourBucket[];
  /** Prisotno samo, kadar je bil klic z `raw=true`. */
  measurements?: MeteoMeasurement[];
  summary: MeteoSummary;
  available: MeteoAvailableSeries;
  source: MeteoSource;
}

export interface MeteoStationOption {
  id: string;
  title: string;
  altitudeM: number | null;
  latitude: number | null;
  longitude: number | null;
}

export interface MeteoStationList {
  stations: MeteoStationOption[];
  selected: { id: string; chosen: boolean };
  source: MeteoSource;
}

/** Okna, med katerimi se preklaplja na zavihku. Vir hrani dva dneva; več od tega ni od kod
 * vzeti (in `GET /meteo/history` več kot 48 ur zavrne). */
export const METEO_WINDOWS = [
  { hours: 6, label: '6 h' },
  { hours: 24, label: '24 h' },
  { hours: 48, label: '48 h' },
] as const;

export type MeteoWindowHours = (typeof METEO_WINDOWS)[number]['hours'];

/**
 * Osem smeri po slovensko — natanko toliko, kolikor jih poimenuje ARSO (`dd_shortText`).
 *
 * Šestnajst smeri bi bilo natančnejše, a bi pomenilo, da za isto meritev ARSO-jeva stran piše
 * "Z", naša pa "ZJZ" — in človek, ki oboje gleda, mora vedeti, da gre za isti veter. Natančno
 * smer pove puščica (`windArrowRotation`), ki ni zaokrožena na nobeno od osmih smeri.
 */
const DIRECTION_LABELS = ['S', 'SV', 'V', 'JV', 'J', 'JZ', 'Z', 'SZ'] as const;

/** Kratka oznaka smeri, iz katere piha veter (`255°` → `Z`). */
export function windDirectionLabel(degrees: number | null | undefined): string | null {
  if (typeof degrees !== 'number' || !Number.isFinite(degrees)) return null;
  const normalized = ((degrees % 360) + 360) % 360;
  const index = Math.round(normalized / 45) % 8;
  return DIRECTION_LABELS[index] ?? null;
}

/**
 * Kot, pod katerim se izriše puščica vetra.
 *
 * Vir pove smer, IZ KATERE veter piha, puščica pa kaže, KAM piha — zato +180°. Brez tega bi
 * puščice kazale natanko narobe, kar je napaka, ki je na sliki ni videti (obrnjena piha je
 * še vedno videti kot piha).
 */
export function windArrowRotation(degrees: number | null | undefined): number | null {
  if (typeof degrees !== 'number' || !Number.isFinite(degrees)) return null;
  return (((degrees + 180) % 360) + 360) % 360;
}

/** Ura in minuta v slovenski coni (`2026-09-09T07:40:00.000Z` → `09:40`). Čas meritve je
 * vedno v `Europe/Ljubljana` in ne v coni brskalnika (člen V.4). */
export function localTimeLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('sl-SI', {
    timeZone: 'Europe/Ljubljana',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/** Dan, ura in minuta — za oznako "kdaj je bila zadnja meritev". */
export function localDateTimeLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('sl-SI', {
    timeZone: 'Europe/Ljubljana',
    day: 'numeric',
    month: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/**
 * Oznake pod grafom urnih vrednosti: ura, in ob polnoči (ter na prvem vedru) tudi dan.
 *
 * Brez dneva je graf 48 ur dolg niz ponovljenih ur, v katerem ni mogoče povedati, ali "14"
 * pomeni danes ali včeraj.
 */
export function bucketAxisLabels(buckets: readonly MeteoHourBucket[]): string[] {
  return buckets.map((bucket, index) => {
    const isDayStart = index === 0 || bucket.dayLabel !== buckets[index - 1]!.dayLabel;
    return isDayStart ? `${bucket.label} | ${bucket.dayLabel}` : bucket.label;
  });
}

/** Vrednost s enoto za prikaz, ali pomišljaj, kadar meritve ni. `null` NI 0. */
export function formatValue(
  value: number | null | undefined,
  unit: string,
  decimals = 1,
): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '–';
  return `${value.toFixed(decimals).replace('.', ',')} ${unit}`.trim();
}

/** Ali je v oknu sploh kaj padlo — po tem se odloči, ali graf padavin kaj pove. */
export function hasPrecipitation(buckets: readonly MeteoHourBucket[]): boolean {
  return buckets.some((b) => (b.precipitationMm ?? 0) > 0);
}

/** Naraščajoča vsota padavin skozi okno (mm) — druga os grafa padavin, ki pokaže, koliko
 * je padlo SKUPAJ, medtem ko stolpci povedo, kdaj. */
export function cumulativePrecipitation(buckets: readonly MeteoHourBucket[]): number[] {
  let total = 0;
  return buckets.map((bucket) => {
    total += bucket.precipitationMm ?? 0;
    // Zaokrožitev na desetinko ob vsakem koraku, da se napaka plavajoče vejice ne kopiči.
    total = Math.round(total * 10) / 10;
    return total;
  });
}

/**
 * Zgornja meja osi padavin. Brez spodnje meje bi bil ob 0,2 mm dežja stolpec videti kot
 * naliv, ker bi se os prilagodila edini vrednosti; 2 mm je meja, pri kateri je desetinka
 * še vidna, naliv pa ne izgleda kot rosenje.
 */
export function precipitationAxisMax(buckets: readonly MeteoHourBucket[]): number {
  const peak = Math.max(0, ...buckets.map((b) => b.precipitationMm ?? 0));
  return Math.max(2, Math.ceil(peak * 1.15));
}

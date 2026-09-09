import { DateTime } from 'luxon';
import type { StationMeasurement } from './history-parse.js';

// Urne vrednosti iz posameznih meritev — os, po kateri se bere padavine ("koliko je padlo
// med 14. in 15. uro"), kakor jih kaže Bergfex.
//
// Člen V.4: ura je KOLEDARSKA ura v `Europe/Ljubljana`, ne "vsakih 60 minut od zadnje
// meritve" in ne ura po UTC. Ob prehodu na zimski čas se ura 02:00 zgodi dvakrat; ker je
// vedro ključeno po dejanskem instantu začetka ure (`startOf('hour')` v coni), sta to dve
// LOČENI vedri z istim napisom "02" in ne eno z dvojno vsoto padavin.
//
// Ločljivost vira je odvisna od postaje (10 ali 30 minut) — tu se nikjer ne domneva, koliko
// meritev je v uri; `samples` to preprosto pove.

export const STATION_ZONE = 'Europe/Ljubljana';

export interface HourBucket {
  /** Začetek ure kot instant (ISO) — edini ključ, po katerem je vedro nedvoumno. */
  startUtc: string;
  /** Ura v lokalni coni, dvomestno ("14"). */
  label: string;
  /** Dan v lokalni coni ("sre. 9. 9."), za oznake pod grafom in za ločnico med dnevi. */
  dayLabel: string;
  /** Vsota padavin v uri (mm). `null` pomeni, da postaja padavin ne meri. */
  precipitationMm: number | null;
  temperatureAvgC: number | null;
  temperatureMinC: number | null;
  temperatureMaxC: number | null;
  humidityAvgPct: number | null;
  windAvgKmh: number | null;
  /** Najmočnejši sunek v uri (km/h). */
  windMaxKmh: number | null;
  /** Prevladujoča smer vetra v uri (°) — vektorsko povprečje, glej `meanDirection`. */
  windDirectionDeg: number | null;
  pressureHpa: number | null;
  globalRadiationWm2: number | null;
  snowCm: number | null;
  /** Koliko meritev je v uri sodelovalo (6 pri desetminutni postaji, 2 pri polurni). */
  samples: number;
}

/** Katere veličine ta postaja dejansko meri. Odjemalec po tem ve, katerih grafov NE riše —
 * prazen graf z osjo in brez črte je videti kot okvara (člen VII). */
export interface AvailableSeries {
  temperature: boolean;
  humidity: boolean;
  wind: boolean;
  precipitation: boolean;
  pressure: boolean;
  radiation: boolean;
  snow: boolean;
  waterTemperature: boolean;
}

export interface HistorySummary {
  /** Prva in zadnja meritev v obravnavanem oknu (ISO). */
  fromUtc: string;
  toUtc: string;
  temperatureMinC: number | null;
  temperatureMaxC: number | null;
  /** Vsota vseh padavin v oknu (mm). */
  precipitationTotalMm: number | null;
  /** Vsota padavin v zadnjih 24 urah okna (mm). */
  precipitation24hMm: number | null;
  windMaxKmh: number | null;
  /** Zadnja meritev — kar ploščica pokaže kot "zdaj". */
  latest: StationMeasurement;
}

/** Meritve, ki niso starejše od `hours` ur od zadnje meritve. Okno se meri od ZADNJE
 * meritve in ne od "zdaj": če vir zastane, mora ploščica pokazati zadnje znano stanje in
 * njegovo starost (FR-026), ne prazne osi. */
export function withinHours(measurements: readonly StationMeasurement[], hours: number): StationMeasurement[] {
  if (measurements.length === 0) return [];
  const last = Date.parse(measurements[measurements.length - 1]!.validUtc);
  const from = last - hours * 3600_000;
  // Meja je vključujoča, da je pri 24 urah v oknu tudi meritev natanko pred 24 urami.
  return measurements.filter((m) => Date.parse(m.validUtc) >= from);
}

export function toHourlyBuckets(measurements: readonly StationMeasurement[], zone = STATION_ZONE): HourBucket[] {
  const groups = new Map<string, StationMeasurement[]>();

  for (const measurement of measurements) {
    const local = DateTime.fromISO(measurement.validUtc, { zone });
    if (!local.isValid) continue;
    // Meritev ob 14:00 pripada uri 13:00–14:00: vir jo označi s KONCEM intervala
    // ("Vsota padavin v časovnem intervalu"), zato bi ob naivnem ključanju padavine
    // pretekle ure pripadle uri, ki se je pravkar začela.
    const start = local.minus({ milliseconds: 1 }).startOf('hour');
    const key = start.toUTC().toISO()!;
    const bucket = groups.get(key);
    if (bucket) bucket.push(measurement);
    else groups.set(key, [measurement]);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([startUtc, items]) => {
      const start = DateTime.fromISO(startUtc, { zone });
      return {
        startUtc,
        label: start.toFormat('HH'),
        dayLabel: start.setLocale('sl').toFormat('ccc d. M.'),
        precipitationMm: sum(items.map((m) => m.precipitationMm)),
        temperatureAvgC: round(average(items.map((m) => m.temperatureC)), 1),
        temperatureMinC: round(minimum(items.map((m) => m.temperatureC)), 1),
        temperatureMaxC: round(maximum(items.map((m) => m.temperatureC)), 1),
        humidityAvgPct: round(average(items.map((m) => m.humidityPct)), 0),
        windAvgKmh: round(average(items.map((m) => m.windAvgKmh)), 1),
        windMaxKmh: round(maximum(items.map((m) => m.windMaxKmh)), 1),
        windDirectionDeg: meanDirection(items),
        pressureHpa: round(average(items.map((m) => m.pressureMslHpa ?? m.pressureHpa)), 1),
        globalRadiationWm2: round(average(items.map((m) => m.globalRadiationWm2)), 0),
        snowCm: lastNonNull(items.map((m) => m.snowCm)),
        samples: items.length,
      };
    });
}

export function detectAvailableSeries(measurements: readonly StationMeasurement[]): AvailableSeries {
  const any = (pick: (m: StationMeasurement) => number | null): boolean =>
    measurements.some((m) => pick(m) !== null);

  return {
    temperature: any((m) => m.temperatureC),
    humidity: any((m) => m.humidityPct),
    wind: any((m) => m.windAvgKmh) || any((m) => m.windMaxKmh),
    precipitation: any((m) => m.precipitationMm),
    pressure: any((m) => m.pressureMslHpa) || any((m) => m.pressureHpa),
    radiation: any((m) => m.globalRadiationWm2) || any((m) => m.diffuseRadiationWm2),
    snow: any((m) => m.snowCm),
    waterTemperature: any((m) => m.waterTemperatureC),
  };
}

export function summarize(measurements: readonly StationMeasurement[]): HistorySummary | null {
  if (measurements.length === 0) return null;
  const latest = measurements[measurements.length - 1]!;
  const last24h = withinHours(measurements, 24);

  return {
    fromUtc: measurements[0]!.validUtc,
    toUtc: latest.validUtc,
    temperatureMinC: round(minimum(measurements.map((m) => m.temperatureC)), 1),
    temperatureMaxC: round(maximum(measurements.map((m) => m.temperatureC)), 1),
    precipitationTotalMm: sum(measurements.map((m) => m.precipitationMm)),
    precipitation24hMm: sum(last24h.map((m) => m.precipitationMm)),
    windMaxKmh: round(maximum(measurements.map((m) => m.windMaxKmh)), 1),
    latest,
  };
}

/**
 * Vektorsko povprečje smeri vetra, uteženo s hitrostjo.
 *
 * Aritmetično povprečje stopinj je za smer napačno: 350° in 10° dasta 180° (južnik) namesto
 * 0° (severnik). Utež je hitrost, ker smer ob brezvetrju ni nosilna informacija.
 */
function meanDirection(items: readonly StationMeasurement[]): number | null {
  let x = 0;
  let y = 0;
  let used = 0;

  for (const item of items) {
    if (item.windDirectionDeg === null) continue;
    const weight = item.windAvgKmh ?? 1;
    if (weight <= 0) continue;
    const radians = (item.windDirectionDeg * Math.PI) / 180;
    x += weight * Math.cos(radians);
    y += weight * Math.sin(radians);
    used += 1;
  }

  if (used === 0) return null;
  if (x === 0 && y === 0) return null;
  const degrees = (Math.atan2(y, x) * 180) / Math.PI;
  return Math.round((degrees + 360) % 360);
}

function values(list: readonly (number | null)[]): number[] {
  return list.filter((v): v is number => v !== null);
}

function sum(list: readonly (number | null)[]): number | null {
  const present = values(list);
  if (present.length === 0) return null;
  // Vsota desetink v plavajoči vejici (0.2 + 0.1) da 0.30000000000000004; padavine so v
  // viru na desetinko natančne, zato je zaokrožitev na dve mesti pravi zapis, ne olepšava.
  return round(
    present.reduce((a, b) => a + b, 0),
    2,
  );
}

function average(list: readonly (number | null)[]): number | null {
  const present = values(list);
  if (present.length === 0) return null;
  return present.reduce((a, b) => a + b, 0) / present.length;
}

function minimum(list: readonly (number | null)[]): number | null {
  const present = values(list);
  return present.length === 0 ? null : Math.min(...present);
}

function maximum(list: readonly (number | null)[]): number | null {
  const present = values(list);
  return present.length === 0 ? null : Math.max(...present);
}

/** Zadnja znana vrednost — za veličine, ki niso vsota ali povprečje (višina snega). */
function lastNonNull(list: readonly (number | null)[]): number | null {
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const value = list[i];
    if (value !== null && value !== undefined) return value;
  }
  return null;
}

function round(value: number | null, decimals: number): number | null {
  if (value === null) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

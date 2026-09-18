import { DateTime } from 'luxon';
import { ljubljanaCalendarDay } from '../../../domain/timezone.js';

// Obdobje pregleda uporabe — čista funkcija nad koledarjem (člen IX).
//
// Obdobje je ŠTEVILO KOLEDARSKIH DNI NAZAJ in ne zadnjih N×24 ur. Dnevni števci drugega ne znajo,
// in "zadnji teden" v pogovoru pomeni prav to — sedem dni, ne 168 ur.
//
// Vsi dnevi so v `Europe/Ljubljana` (člen V.4). Dan s 23 urami (prehod na poletni čas) in dan s
// 25 urami (prehod na zimski) sta vsak en dan z enim ključem: enota je dan, ne ura, zato prehod na
// števce ne vpliva. To je zapisano kot test, ne kot trditev.

const ZONE = 'Europe/Ljubljana';
const DAY_FORMAT = 'yyyy-LL-dd';

/** Dovoljena obdobja (FR-037). Zaprt seznam in ne poljubno število: vsaka vrednost je ena
 * poizvedba čez druge količine podatkov, in "365" bi bilo obljubljeno, a nepokrito z rokom hrambe
 * na vsaki namestitvi. */
export const ALLOWED_WINDOW_DAYS = [7, 30, 90] as const;
export type WindowDays = (typeof ALLOWED_WINDOW_DAYS)[number];

export interface UsageWindow {
  days: number;
  fromDay: string;
  toDay: string;
}

export interface UsageCoverage {
  /** Najstarejši dan, za katerega meritve obstajajo. `null` = zbirka je prazna. */
  dataSince: string | null;
  retentionDays: number;
  /** Izbrano obdobje sega pred `dataSince` ali pred rok hrambe. */
  truncated: boolean;
}

export function isAllowedWindow(days: number): days is WindowDays {
  return (ALLOWED_WINDOW_DAYS as readonly number[]).includes(days);
}

/**
 * Okno od vključno `fromDay` do vključno `toDay` (danes).
 *
 * `days: 7` pomeni danes in šest dni nazaj — sedem koledarskih dni, ne osem. Meja `-(days - 1)` je
 * edino mesto, kjer je to mogoče zgrešiti, in razlika se pokaže šele pri seštevku.
 */
export function buildWindow(days: number, now: Date): UsageWindow {
  const today = DateTime.fromJSDate(now, { zone: 'utc' }).setZone(ZONE);
  return {
    days,
    fromDay: today.minus({ days: days - 1 }).toFormat(DAY_FORMAT),
    toDay: ljubljanaCalendarDay(now),
  };
}

/**
 * Kaj je od izbranega obdobja sploh pokrito z meritvami (FR-038).
 *
 * Brez tega podatka je prazno obdobje NELOČLJIVO od "nihče se ni prijavljal" — in to je napačen
 * sklep s posledicami za račune ljudi. Telemetrija se je začela zbirati ob uvedbi te
 * funkcionalnosti in za nazaj je ni mogoče izpeljati.
 *
 * `truncated` je `true` v treh primerih, ker so za bralca isti: meritev sploh ni, obdobje sega
 * pred prvo meritev, ali obdobje sega pred rok hrambe (starejše je že pobrisano).
 */
export function buildCoverage(params: {
  window: UsageWindow;
  dataSince: string | null;
  retentionDays: number;
  now: Date;
}): UsageCoverage {
  const { window, dataSince, retentionDays, now } = params;
  const retentionFloor = DateTime.fromJSDate(now, { zone: 'utc' })
    .setZone(ZONE)
    .minus({ days: retentionDays })
    .toFormat(DAY_FORMAT);

  // Primerjava nizov je pri obliki `yyyy-LL-dd` enaka primerjavi datumov — leksikografsko in
  // koledarsko zaporedje sovpadata. To je edini razlog, da je ta oblika izbrana.
  const truncated = dataSince === null || window.fromDay < dataSince || window.fromDay < retentionFloor;

  return { dataSince, retentionDays, truncated };
}

import { DateTime } from 'luxon';
import type { DayWindowInput, SearchInput } from './rule-input.js';
import { isOneWay } from './rule-validation.js';

// Datumska aritmetika iskanja (FR-005 do FR-009), čista in brez baze (člen IX). Vse v Luxonu
// nad KOLEDARSKIMI dnevi (`yyyy-LL-dd`) v coni odhodnega letališča — nikoli `toISOString().split`
// (člen V.4). Odločitve so v specs/015-flight-deals/research.md §11.

export interface DateRange {
  /** `yyyy-LL-dd`, vključno. */
  from: string;
  to: string;
}

export interface Windows {
  outbound: DateRange;
  /** `null` pri enosmernem iskanju. */
  inbound: DateRange | null;
  oneWay: boolean;
  /** Dovoljene nočitve; pri enosmernem `null`. */
  nights: { min: number; max: number } | null;
  warnings: string[];
  /** Kadar okno ne vsebuje nobenega dne (vse v preteklosti). */
  empty: boolean;
}

export type DateRuleFields = Pick<SearchInput, 'dates' | 'flexDays' | 'returnWithinWindow' | 'minNights' | 'maxNights'>;

const DAY = 'yyyy-LL-dd';

function day(s: string): DateTime {
  return DateTime.fromFormat(s, DAY, { zone: 'utc' });
}

function fmt(d: DateTime): string {
  return d.toFormat(DAY);
}

/** Število koledarskih dni med dvema dnevoma (`b − a`). */
export function daysBetween(a: string, b: string): number {
  return Math.round(day(b).diff(day(a), 'days').days);
}

/**
 * Dejansko obdobje iskanja (FR-007). `now` se prevede v "danes" po coni odhodnega letališča —
 * uporabnik na LJU ob 23:30 še išče današnje večerne lete, čeprav je po UTC že jutri.
 */
export function computeWindows(rule: DateRuleFields, now: Date, originTz: string): Windows {
  const today = DateTime.fromJSDate(now, { zone: 'utc' }).setZone(originTz).startOf('day');
  const todayStr = today.toFormat(DAY);
  const warnings: string[] = [];
  const oneWay = isOneWay(rule);
  const flex = rule.dates.mode === 'rolling' ? 0 : rule.flexDays;

  let outFrom: DateTime;
  let outTo: DateTime;
  let nights: { min: number; max: number } | null = null;

  if (rule.dates.mode === 'fixed') {
    const depart = day(rule.dates.departDate ?? todayStr);
    outFrom = depart.minus({ days: flex });
    outTo = depart.plus({ days: flex });
    if (!oneWay && rule.dates.returnDate) {
      const base = daysBetween(rule.dates.departDate ?? todayStr, rule.dates.returnDate);
      nights =
        rule.minNights !== null && rule.maxNights !== null
          ? { min: rule.minNights, max: rule.maxNights }
          : { min: base, max: base };
    }
  } else if (rule.dates.mode === 'range') {
    outFrom = day(rule.dates.from ?? todayStr).minus({ days: flex });
    outTo = day(rule.dates.to ?? todayStr).plus({ days: flex });
    if (!oneWay) nights = { min: rule.minNights ?? 0, max: rule.maxNights ?? 0 };
  } else {
    outFrom = today;
    // 31. 8. + 6 mesecev konča zadnji dan februarja, ne "31. 2." (edge case).
    outTo = today.plus({ months: rule.dates.months ?? 1 }).endOf('month').startOf('day');
    if (!oneWay) nights = { min: rule.minNights ?? 0, max: rule.maxNights ?? 0 };
  }

  if (outFrom < today) {
    if (outTo < today) {
      warnings.push('Celotno obdobje je v preteklosti — iskanje ne bo našlo ničesar.');
      return {
        outbound: { from: todayStr, to: todayStr },
        inbound: null,
        oneWay,
        nights,
        warnings,
        empty: true,
      };
    }
    warnings.push(`Okno sega v preteklost; dnevi pred ${today.toFormat('d. L. yyyy')} so izpuščeni.`);
    outFrom = today;
  }

  let inbound: DateRange | null = null;
  if (!oneWay && nights) {
    if (rule.dates.mode === 'fixed' && rule.dates.returnDate) {
      const ret = day(rule.dates.returnDate);
      inbound = { from: fmt(ret.minus({ days: flex })), to: fmt(ret.plus({ days: flex })) };
    } else if (rule.returnWithinWindow && rule.dates.mode === 'range') {
      // Oba znotraj razširjenega okna (FR-008). Povratek ne more biti pred prvim odhodom + min nočitev.
      inbound = { from: fmt(outFrom.plus({ days: nights.min })), to: fmt(outTo) };
      if (daysBetween(inbound.from, inbound.to) < 0) {
        warnings.push('Najmanjše trajanje je daljše od obdobja — kombinacij ni. Dovoli povratek zunaj okna ali podaljšaj obdobje.');
      }
    } else {
      inbound = { from: fmt(outFrom.plus({ days: nights.min })), to: fmt(outTo.plus({ days: nights.max })) };
    }
  }

  return { outbound: { from: fmt(outFrom), to: fmt(outTo) }, inbound, oneWay, nights, warnings, empty: false };
}

/** ISO dan v tednu (1 = pon … 7 = ned) za koledarski dan. */
export function isoWeekdayOf(dayStr: string): number {
  return day(dayStr).weekday;
}

export function weekdayAllowed(window: Pick<DayWindowInput, 'weekdays'>, dayStr: string): boolean {
  return window.weekdays.length === 0 || window.weekdays.includes(isoWeekdayOf(dayStr));
}

/** Vsi dnevi v območju, vključno z obema robovoma. Prazno, kadar je `to < from`. */
export function eachDay(range: DateRange): string[] {
  const out: string[] = [];
  let cur = day(range.from);
  const end = day(range.to);
  while (cur <= end) {
    out.push(fmt(cur));
    cur = cur.plus({ days: 1 });
  }
  return out;
}

/** Varovalka pred eksplozijo: 365 dni × 60 nočitev je 21 900 parov in jih naštejemo; več ne. */
const MAX_COMBINATIONS_ENUMERATED = 50_000;

/**
 * Pari (odhod, povratek), ki ustrezajo dnevom v tednu in trajanju (FR-007). Pri enosmernem
 * iskanju so to samo dnevi odhoda. Izračunano, ne ocenjeno.
 */
export function countDateCombinations(
  windows: Windows,
  rule: Pick<SearchInput, 'outbound' | 'inbound'>,
): number {
  if (windows.empty) return 0;
  const departures = eachDay(windows.outbound).filter((d) => weekdayAllowed(rule.outbound, d));
  if (windows.oneWay || !windows.inbound || !windows.nights) return departures.length;

  const inboundFrom = day(windows.inbound.from);
  const inboundTo = day(windows.inbound.to);
  let count = 0;
  for (const d of departures) {
    const dep = day(d);
    for (let n = windows.nights.min; n <= windows.nights.max; n += 1) {
      const ret = dep.plus({ days: n });
      if (ret < inboundFrom || ret > inboundTo) continue;
      if (!weekdayAllowed(rule.inbound, fmt(ret))) continue;
      count += 1;
      if (count >= MAX_COMBINATIONS_ENUMERATED) return count;
    }
  }
  return count;
}

/** Meseci (`yyyy-LL`), ki jih območje pokriva — ena poizvedba na mesec pri virih, ki iščejo po
 * mesecih (research.md §4). */
export function monthsCovered(range: DateRange): string[] {
  const out: string[] = [];
  let cur = day(range.from).startOf('month');
  const end = day(range.to).startOf('month');
  while (cur <= end) {
    out.push(cur.toFormat('yyyy-LL'));
    cur = cur.plus({ months: 1 });
  }
  return out;
}

export interface SearchPreview {
  outboundWindow: DateRange;
  returnWindow: DateRange | null;
  dateCombinations: number;
  queries: number;
  truncated: boolean;
  warnings: string[];
}

/**
 * Predogled za obrazec in za odgovor iskanja (FR-007). Število poizvedb je ocena za vir, ki
 * išče po mesecih: letališča × cilji × meseci; pri "kamor koli" se cilj šteje kot 1 in predogled
 * to pove, ker števila destinacij ne poznamo.
 */
export function buildPreview(
  rule: SearchInput,
  now: Date,
  originTz: string,
  limits: { maxQueriesPerRule: number },
): SearchPreview {
  const windows = computeWindows(rule, now, originTz);
  const warnings = [...windows.warnings];
  const combinations = countDateCombinations(windows, rule);
  if (!windows.empty && combinations === 0) {
    warnings.push('Z izbranimi dnevi in trajanjem v tem obdobju ni nobene kombinacije datumov.');
  }
  const destinations =
    rule.destination.mode === 'airports'
      ? Math.max(1, rule.destination.airports.length)
      : rule.destination.mode === 'countries'
        ? Math.max(1, rule.destination.countries.length)
        : 1;
  if (rule.destination.mode === 'any') {
    warnings.push('Pri cilju "kamor koli" je število poizvedb ocenjeno na eno na letališče in mesec; vir vrne vse destinacije hkrati.');
  }
  const months = windows.empty ? 0 : monthsCovered(windows.outbound).length;
  const queries = rule.departureAirports.length * (rule.destination.mode === 'countries' ? 1 : destinations) * months;
  const truncated = queries > limits.maxQueriesPerRule;
  if (truncated) {
    warnings.push(
      `Iskanje bi zahtevalo ${queries} poizvedb, dovoljenih je ${limits.maxQueriesPerRule} — preverjeni bodo samo prvi meseci. Zoži obdobje ali število letališč.`,
    );
  }
  return {
    outboundWindow: windows.outbound,
    returnWindow: windows.inbound,
    dateCombinations: combinations,
    queries,
    truncated,
    warnings,
  };
}

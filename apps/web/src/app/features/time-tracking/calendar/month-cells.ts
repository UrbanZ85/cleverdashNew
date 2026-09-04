import type { CalendarCell } from './calendar-grid.component.js';

/** Datumska aritmetika teče v UTC, ker so to koledarski datumi in ne trenutki — tako poletni
 * čas ne more premakniti dneva. `month` je 0-osnovan, kot pri `Date.getUTCMonth()`. */
export function isoDate(year: number, month: number, day: number): string {
  return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
}

/** Vsi datumi od `startDate` do `endDate`, oba VKLJUČENA (enako kot `AbsencePeriod`). */
export function daysBetween(startDate: string, endDate: string): string[] {
  const out: string[] = [];
  for (
    const d = new Date(`${startDate}T00:00:00Z`);
    d <= new Date(`${endDate}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/** ISO dan tedna: 1 = ponedeljek … 7 = nedelja. `getUTCDay()` šteje 0 = nedelja, zato +6 % 7. */
export function isoWeekday(date: string): number {
  return ((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
}

/** Ena vrstica odgovora `GET /time-tracking/calendar` — po ena na (dan, urnik). */
export interface DayRow {
  localDate: string;
  profileId: string;
  status: string;
  reason: string;
}

/** Status enega dne, potem ko so vrstice VSEH urnikov združene v eno. */
export interface MergedDay {
  status: string;
  reason: string;
  /** Urnik, ki temu dnevu da status — pri delovnem dnevu tisti, ki ta dan dela. */
  profileId: string | null;
}

/**
 * Prednost pri združevanju. Vsak urnik dan ocenjuje samo po SVOJIH `daysOfWeek`, zato urnik za
 * pon–sre četrtek poroča kot "ni v dneh profila" (status `weekend`), čeprav ta dan dela drugi
 * urnik. Brez lestvice obvelja prva vrstica in drugi urnik iz koledarja izgine.
 *
 * Delovni dan zato prevlada nad prostim: dan JE delovni, če ga dela katerikoli viden urnik.
 * Odsotnost prevlada nad vikendom (vnesena je bila namenoma), vsiljen delovni dan nad vsem.
 */
const STATUS_RANK: Record<string, number> = {
  forced: 6,
  workday: 5,
  sick: 4,
  vacation: 3,
  other: 2,
  holiday: 1,
  weekend: 0,
};

export function mergeDays(rows: readonly DayRow[]): Record<string, MergedDay> {
  const merged: Record<string, MergedDay & { rank: number }> = {};
  for (const row of rows) {
    const rank = STATUS_RANK[row.status] ?? 0;
    const current = merged[row.localDate];
    if (current && current.rank >= rank) continue;
    merged[row.localDate] = { status: row.status, reason: row.reason, profileId: row.profileId, rank };
  }
  return Object.fromEntries(
    Object.entries(merged).map(([date, { status, reason, profileId }]) => [date, { status, reason, profileId }]),
  );
}

export interface MonthCellsInput {
  year: number;
  /** 0-osnovan. */
  month: number;
  /** Današnji datum v Ljubljani (`YYYY-MM-DD`). */
  today: string;
  /** Status dneva, kot ga je izračunal strežnik (`GET /time-tracking/calendar`). */
  statuses: Record<string, { status: string; reason: string }>;
  /** Ure DEJANSKO načrtovanih akcij po datumu (`HH:MM`). */
  plannedTimes: Record<string, string[]>;
  /** Ure, ki jih urnik predvideva za ta delovni dan — uporabijo se, kadar načrta še ni.
   * Funkcija in ne en sam seznam, ker vsak dan lahko pripada DRUGEMU urniku: pon–sre eden,
   * čet–pet drugi. */
  expectedTimes: (date: string) => string[];
  /** Kratko ime lokacije tega dne (`null`, kadar se ne dela) — značka v celici. */
  locationLabel: (date: string) => string | null;
  /** Nadomestni status, kadar strežnik za ta dan ničesar ni vrnil (npr. urnika ni). */
  fallback: (date: string) => { status: string; reason: string };
  selectionStart: string | null;
  selectionEnd: string | null;
}

/**
 * Sestavi mrežo meseca: polne tedne od ponedeljka do nedelje, z dopolnilnimi celicami iz
 * sosednjih mesecev, da se stolpci dnevov med meseci ne premikajo.
 *
 * Čista funkcija zunaj komponente zato, ker je to edini pravi izračun na tej strani — vse
 * ostalo je prikaz. Robni primeri (mesec, ki se začne v ponedeljek in ima natanko 28 dni, torej
 * BREZ dopolnil; prehod na poletni čas sredi meseca; prelom leta) so pokriti v
 * tests/unit/calendar-month-cells.spec.ts.
 */
export function buildMonthCells(input: MonthCellsInput): CalendarCell[][] {
  const { year, month, today, statuses, plannedTimes, expectedTimes, locationLabel, fallback } = input;
  const start = input.selectionStart;
  const end = input.selectionEnd;

  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const leading = isoWeekday(isoDate(year, month, 1)) - 1;
  const cells: CalendarCell[] = [];

  for (let i = 0; i < leading; i++) {
    cells.push(padCell(isoDate(year, month, i - leading + 1)));
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const date = isoDate(year, month, day);
    const info = statuses[date] ?? fallback(date);
    const planned = plannedTimes[date] ?? [];
    const isWorkday = info.status === 'workday' || info.status === 'forced';

    cells.push({
      date,
      dayOfMonth: day,
      inMonth: true,
      isToday: date === today,
      status: info.status,
      reason: info.reason,
      times: planned.length > 0 ? planned : isWorkday ? expectedTimes(date) : [],
      planned: planned.length > 0,
      locationLabel: isWorkday ? locationLabel(date) : null,
      selected: date === start || date === end,
      inRange: start !== null && end !== null && date > start && date < end,
    });
  }

  for (let trailing = 1; cells.length % 7 !== 0; trailing++) {
    cells.push(padCell(isoDate(year, month, daysInMonth + trailing)));
  }

  const weeks: CalendarCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

function padCell(date: string): CalendarCell {
  return {
    date,
    dayOfMonth: Number(date.slice(8, 10)),
    inMonth: false,
    isToday: false,
    status: 'pad',
    reason: '',
    times: [],
    planned: false,
    locationLabel: null,
    selected: false,
    inRange: false,
  };
}

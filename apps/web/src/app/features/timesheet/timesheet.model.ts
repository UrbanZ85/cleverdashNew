// Oblike podatkov in pretvorbe modula "Evidenca delovnega časa".
//
// Datoteka NAMENOMA ne uvozi ničesar iz Angularja: `tests/unit/timesheet-payload.spec.ts` jo
// tako naloži brez DI in brez prevajalnika (enak razlog kot pri core/network-status.service).
// HTTP klici so v `timesheet.api.ts`.

export interface TimeHm {
  h: number;
  m: number;
}

export interface DaySchedule {
  arrival: TimeHm;
  departure: TimeHm;
  breakStart: TimeHm;
  breakEnd: TimeHm;
}

export type DayKind = 'work' | 'weekend' | 'sick' | 'holiday' | 'off' | 'pad';

/** Vrste dni, ki jih uporabnik nastavlja s klikom po mreži; vikend in `pad` nista med njimi. */
export const SELECTABLE_KINDS = ['work', 'off', 'sick', 'holiday'] as const;
export type SelectableKind = (typeof SELECTABLE_KINDS)[number];

export const KIND_LABELS: Record<SelectableKind, string> = {
  work: 'Delo',
  off: 'Dopust',
  sick: 'Bolniška',
  holiday: 'Praznik',
};

export interface PreviewDay {
  date: string;
  dayOfMonth: number;
  inMonth: boolean;
  isoWeekday: number;
  kind: DayKind;
  minutes: number;
}

export interface Totals {
  work: number;
  holiday: number;
  sick: number;
  off: number;
}

export interface PreviewWeek {
  days: PreviewDay[];
  totals: Totals;
}

export interface TimesheetPreview {
  year: number;
  month: number;
  fullName: string;
  weeklyWorkHours: number;
  schedule: DaySchedule;
  nominalMonthHours: number;
  breakMinutes: number;
  totals: Totals;
  weeks: PreviewWeek[];
  fileName: string;
}

export interface StoredDefaults {
  fullName: string | null;
  weeklyWorkHours: number;
  schedule: DaySchedule;
}

/** Stanje obrazca. Časi so nizi `"HH:MM"`, ker jih tak daje `<input type="time">`. */
export interface TimesheetForm {
  year: number;
  month: number;
  fullName: string;
  weeklyWorkHours: number;
  arrival: string;
  departure: string;
  breakStart: string;
  breakEnd: string;
  sickDays: number[];
  holidays: number[];
  offDays: number[];
}

export const MONTH_NAMES = [
  'januar',
  'februar',
  'marec',
  'april',
  'maj',
  'junij',
  'julij',
  'avgust',
  'september',
  'oktober',
  'november',
  'december',
];

/**
 * Trenutni mesec v koledarju uporabnika. Člen V: koledarski dan se NE bere iz UTC — v
 * poletnem času bi prvi dan meseca ob polnoči po Ljubljani dal še prejšnji mesec.
 */
export function currentYearMonth(now: Date = new Date()): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Ljubljana',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now);
  const value = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { year: value('year'), month: value('month') };
}

export function parseHm(value: string): TimeHm {
  const [h, m] = value.split(':');
  return { h: Number(h ?? 0), m: Number(m ?? 0) };
}

export function formatHm(time: TimeHm): string {
  return `${String(time.h).padStart(2, '0')}:${String(time.m).padStart(2, '0')}`;
}

/** Minute → "8:00". Predogled vrne minute (cela števila), da se ure nikjer ne zaokrožujejo. */
export function formatMinutes(minutes: number): string {
  const sign = minutes < 0 ? '-' : '';
  const abs = Math.abs(minutes);
  return `${sign}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, '0')}`;
}

export function toRequestBody(form: TimesheetForm): Record<string, unknown> {
  return {
    year: form.year,
    month: form.month,
    fullName: form.fullName.trim(),
    weeklyWorkHours: form.weeklyWorkHours,
    sickDays: [...form.sickDays].sort((a, b) => a - b),
    holidays: [...form.holidays].sort((a, b) => a - b),
    offDays: [...form.offDays].sort((a, b) => a - b),
    schedule: {
      arrival: parseHm(form.arrival),
      departure: parseHm(form.departure),
      breakStart: parseHm(form.breakStart),
      breakEnd: parseHm(form.breakEnd),
    },
  };
}

/** Naslednja vrsta dneva v krogu klikanja po mreži. */
export function nextKind(current: DayKind): SelectableKind {
  const order: SelectableKind[] = ['work', 'off', 'sick', 'holiday'];
  const index = order.indexOf(current as SelectableKind);
  return order[(index + 1) % order.length] ?? 'off';
}

/** Vrne nove sezname dni po kliku na dan — brez mutacije obstoječih (signali). */
export function applyKind(
  form: Pick<TimesheetForm, 'sickDays' | 'holidays' | 'offDays'>,
  dayOfMonth: number,
  kind: SelectableKind,
): Pick<TimesheetForm, 'sickDays' | 'holidays' | 'offDays'> {
  const without = (days: number[]) => days.filter((d) => d !== dayOfMonth);
  const next = {
    sickDays: without(form.sickDays),
    holidays: without(form.holidays),
    offDays: without(form.offDays),
  };
  if (kind === 'sick') next.sickDays = [...next.sickDays, dayOfMonth];
  if (kind === 'holiday') next.holidays = [...next.holidays, dayOfMonth];
  if (kind === 'off') next.offDays = [...next.offDays, dayOfMonth];
  return next;
}

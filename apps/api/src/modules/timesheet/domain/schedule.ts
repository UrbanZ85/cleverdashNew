import type { DaySchedule, DayScheduleInput, TimeHm } from './types.js';

// Privzetki iz izvirne aplikacije: 9:00–17:00, malica 12:30–13:00.
export const DEFAULT_DAY_SCHEDULE: DaySchedule = {
  arrival: { h: 9, m: 0 },
  departure: { h: 17, m: 0 },
  breakStart: { h: 12, m: 30 },
  breakEnd: { h: 13, m: 0 },
};

export const MINUTES_PER_DAY = 24 * 60;

function mergeHm(base: TimeHm, override?: Partial<TimeHm>): TimeHm {
  return {
    h: override?.h ?? base.h,
    m: override?.m ?? base.m,
  };
}

/**
 * Delno poslan urnik dopolni z osnovo — npr. samo `{ arrival: { h: 7 } }` je veljaven vnos.
 * Osnova je uporabnikov shranjeni privzetek (models/timesheet-preset.model.ts), če ga ima,
 * sicer `DEFAULT_DAY_SCHEDULE`.
 */
export function mergeDaySchedule(
  input?: DayScheduleInput,
  base: DaySchedule = DEFAULT_DAY_SCHEDULE,
): DaySchedule {
  return {
    arrival: mergeHm(base.arrival, input?.arrival),
    departure: mergeHm(base.departure, input?.departure),
    breakStart: mergeHm(base.breakStart, input?.breakStart),
    breakEnd: mergeHm(base.breakEnd, input?.breakEnd),
  };
}

export function toMinutes(t: TimeHm): number {
  return t.h * 60 + t.m;
}

/**
 * "Redne ure" so odhod − prihod, BREZ odbitka malice — tako je izvirna predloga: stolpec I
 * je `E − D`, malica pa ima svoj stolpec H. Odbijanje malice tu bi tiho spremenilo mesečni
 * seštevek glede na dokument, ki ga uporabnik oddaja.
 */
export function workedMinutes(schedule: DaySchedule): number {
  return toMinutes(schedule.departure) - toMinutes(schedule.arrival);
}

export function breakMinutes(schedule: DaySchedule): number {
  return toMinutes(schedule.breakEnd) - toMinutes(schedule.breakStart);
}

/**
 * Čas dneva kot delež enega dneva (17:00 → 17/24). Excel tako zapiše uro brez pretvorbe
 * prek `Date`, ki je v izvirni aplikaciji dajala 16:59 oz. 12:29 zaradi zaokroževanja
 * serijske številke.
 */
export function timeDayFraction(t: TimeHm): number {
  return toMinutes(t) / MINUTES_PER_DAY;
}

export function minutesToDayFraction(minutes: number): number {
  return minutes / MINUTES_PER_DAY;
}

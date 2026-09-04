import { isoWeekday, monthWeekGrid, nominalMonthHours } from './calendar.js';
import { breakMinutes, workedMinutes } from './schedule.js';
import type { DayKind, DaySchedule, TimesheetRequest } from './types.js';

// Člen IX: celotna odločitev "kateri dan je kakšen in koliko ur nosi" je čista funkcija brez
// ExcelJS. Isti rezultat porabita OBA endpointa — `/timesheet/workbook` ga izriše v .xlsx,
// `/timesheet/preview` ga vrne kot JSON — zato UI ne podvaja koledarske logike in je edina
// kopija te logike enotsko testirana (tests/unit/timesheet-month.spec.ts).

export interface ResolvedDay {
  /** Vedno izpolnjen, tudi za `pad` dneve — predogled jih tako lahko pokaže obledele,
   * preglednica pa jim pusti prazno celico datuma (services/workbook.service.ts). */
  date: string;
  dayOfMonth: number;
  /** `false` za dneve sosednjega meseca, ki samo dopolnijo teden do ponedeljek–nedelja. */
  inMonth: boolean;
  /** 1 = ponedeljek … 7 = nedelja. */
  isoWeekday: number;
  kind: DayKind;
  /** Minute, ki jih ta dan prispeva v svoj stolpec (redne ure ali odsotnost). */
  minutes: number;
}

export interface ResolvedWeekTotals {
  work: number;
  holiday: number;
  sick: number;
  off: number;
}

export interface ResolvedWeek {
  days: ResolvedDay[];
  /** Minute po vrsti — tedenski seštevek ur v predlogi. */
  totals: ResolvedWeekTotals;
}

export interface ResolvedMonth {
  year: number;
  month: number;
  fullName: string;
  weeklyWorkHours: number;
  schedule: DaySchedule;
  weeks: ResolvedWeek[];
  /** Mesečna delovna obveza (delovniki × 8 h) v urah — polje v glavi predloge. */
  nominalMonthHours: number;
  /** Trajanje malice v minutah; enako za vsak delovni dan. */
  breakMinutes: number;
  totals: ResolvedWeekTotals;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Vrstni red je pomemben in namerno enak izvirni aplikaciji: vikend pobije vse (sobota ni
 * delovni dan, tudi če je njena številka v seznamu dopusta), nato bolniška, praznik, dopust.
 * Ista številka dneva v dveh seznamih torej ni napaka — obvelja prvi zadetek po tem vrstnem
 * redu.
 */
function dayKind(
  dayOfMonth: number,
  inMonth: boolean,
  utcWeekday: number,
  sick: Set<number>,
  holidays: Set<number>,
  off: Set<number>,
): DayKind {
  if (!inMonth) return 'pad';
  if (utcWeekday === 0 || utcWeekday === 6) return 'weekend';
  if (sick.has(dayOfMonth)) return 'sick';
  if (holidays.has(dayOfMonth)) return 'holiday';
  if (off.has(dayOfMonth)) return 'off';
  return 'work';
}

function emptyTotals(): ResolvedWeekTotals {
  return { work: 0, holiday: 0, sick: 0, off: 0 };
}

export function resolveMonth(input: TimesheetRequest): ResolvedMonth {
  const sick = new Set(input.sickDays);
  const holidays = new Set(input.holidays);
  const off = new Set(input.offDays);

  // Odsotnost nosi toliko ur, kolikor bi jih nosil delovni dan — brez tega bi bil mesečni
  // seštevek odvisen od tega, koliko dni je bil kdo odsoten.
  const dayMinutes = Math.max(0, workedMinutes(input.schedule));
  const totals = emptyTotals();

  const weeks: ResolvedWeek[] = monthWeekGrid(input.year, input.month).map((week) => {
    const weekTotals = emptyTotals();
    const days: ResolvedDay[] = week.map((cell) => {
      const kind = dayKind(cell.d, cell.inMonth, cell.utcWeekday, sick, holidays, off);
      const minutes = kind === 'weekend' || kind === 'pad' ? 0 : dayMinutes;

      if (kind === 'work') weekTotals.work += minutes;
      else if (kind === 'holiday') weekTotals.holiday += minutes;
      else if (kind === 'sick') weekTotals.sick += minutes;
      else if (kind === 'off') weekTotals.off += minutes;

      return {
        date: `${cell.y}-${pad2(cell.m)}-${pad2(cell.d)}`,
        dayOfMonth: cell.d,
        inMonth: cell.inMonth,
        isoWeekday: isoWeekday(cell.utcWeekday),
        kind,
        minutes,
      };
    });

    totals.work += weekTotals.work;
    totals.holiday += weekTotals.holiday;
    totals.sick += weekTotals.sick;
    totals.off += weekTotals.off;

    return { days, totals: weekTotals };
  });

  return {
    year: input.year,
    month: input.month,
    fullName: input.fullName,
    weeklyWorkHours: input.weeklyWorkHours,
    schedule: input.schedule,
    weeks,
    nominalMonthHours: nominalMonthHours(input.year, input.month, 8),
    breakMinutes: Math.max(0, breakMinutes(input.schedule)),
    totals,
  };
}

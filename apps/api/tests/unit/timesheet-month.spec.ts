import { describe, expect, it } from 'vitest';
import { resolveMonth, type ResolvedDay } from '../../src/modules/timesheet/domain/resolve-month.js';
import { validateSchedule, applyDefaults, timesheetBodySchema } from '../../src/modules/timesheet/domain/input.schema.js';
import { DEFAULT_DAY_SCHEDULE, mergeDaySchedule } from '../../src/modules/timesheet/domain/schedule.js';
import { daysInMonth, monthWeekGrid, nominalMonthHours } from '../../src/modules/timesheet/domain/calendar.js';
import type { TimesheetRequest } from '../../src/modules/timesheet/domain/types.js';

// Vrata 2 iz ustave: domenska logika ima enotske teste, izrecno tudi za prehod na
// poletni/zimski čas, praznik na delovni dan in mesečne meje. Ta datoteka je edini test
// koledarske logike evidence — preglednica sama je pogodbeni test
// (tests/contract/timesheet/workbook.spec.ts).

const BASE: TimesheetRequest = {
  year: 2026,
  month: 3,
  fullName: 'Testna Oseba',
  weeklyWorkHours: 40,
  sickDays: [],
  holidays: [],
  offDays: [],
  schedule: DEFAULT_DAY_SCHEDULE,
};

function flatten(year: number, month: number, overrides: Partial<TimesheetRequest> = {}): ResolvedDay[] {
  return resolveMonth({ ...BASE, year, month, ...overrides }).weeks.flatMap((w) => w.days);
}

function dayOf(days: ResolvedDay[], date: string): ResolvedDay {
  const found = days.find((d) => d.date === date);
  if (!found) throw new Error(`Dneva ${date} ni v mreži.`);
  return found;
}

describe('koledar evidence', () => {
  it('mesec, ki se začne v nedeljo, ima poln prvi teden iz prejšnjega meseca', () => {
    // 1. marec 2026 je nedelja — teden se mora začeti v ponedeljek, 23. februarja.
    const weeks = resolveMonth({ ...BASE, month: 3 }).weeks;
    expect(weeks).toHaveLength(6);
    expect(weeks[0]!.days[0]!.date).toBe('2026-02-23');
    expect(weeks[0]!.days[0]!.kind).toBe('pad');
    expect(weeks[0]!.days[0]!.inMonth).toBe(false);
    expect(weeks[0]!.days[6]!.date).toBe('2026-03-01');
    expect(weeks[0]!.days[6]!.kind).toBe('weekend');
  });

  it('vsak teden ima 7 dni in datumi tečejo brez preskoka ali podvojitve', () => {
    // Prehod na poletni (29. 3. 2026) in zimski čas (25. 10. 2026): z lokalno cono bi dan
    // s 23 oz. 25 urami premaknil mrežo za eno mesto. Računanje je v UTC prav zato.
    for (const month of [3, 10]) {
      const days = flatten(2026, month);
      expect(days.length % 7).toBe(0);
      for (let i = 1; i < days.length; i++) {
        const prev = Date.parse(`${days[i - 1]!.date}T00:00:00Z`);
        const cur = Date.parse(`${days[i]!.date}T00:00:00Z`);
        expect(cur - prev, `${days[i - 1]!.date} → ${days[i]!.date}`).toBe(86400000);
      }
    }
    // Sama nedelja prehoda ostane nedelja in vikend.
    expect(dayOf(flatten(2026, 3), '2026-03-29').isoWeekday).toBe(7);
    expect(dayOf(flatten(2026, 10), '2026-10-25').kind).toBe('weekend');
  });

  it('zadnji teden se ne podvoji, kadar se mesec konča v nedeljo', () => {
    // November 2026 se konča v ponedeljek, februar 2026 v soboto — v nobenem primeru ne sme
    // nastati odvečen teden samih `pad` dni.
    for (const month of [2, 11]) {
      const weeks = resolveMonth({ ...BASE, month }).weeks;
      const last = weeks[weeks.length - 1]!;
      expect(last.days.some((d) => d.inMonth)).toBe(true);
    }
  });

  it('mesečna delovna obveza je število delovnikov krat 8 ur', () => {
    expect(nominalMonthHours(2026, 3)).toBe(22 * 8);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(monthWeekGrid(2026, 2)).toHaveLength(5);
  });
});

describe('vrste dni', () => {
  it('delovni dan nosi odhod − prihod, tudi ko je malica vmes', () => {
    const month = resolveMonth(BASE);
    expect(dayOf(month.weeks.flatMap((w) => w.days), '2026-03-02').minutes).toBe(480);
    expect(month.breakMinutes).toBe(30);
    // 22 delovnikov × 8 h, brez odsotnosti.
    expect(month.totals.work).toBe(22 * 480);
  });

  it('praznik na delovni dan gre v svoj stolpec in ne šteje med redne ure', () => {
    const month = resolveMonth({ ...BASE, holidays: [10] }); // torek
    const days = month.weeks.flatMap((w) => w.days);
    expect(dayOf(days, '2026-03-10').kind).toBe('holiday');
    expect(dayOf(days, '2026-03-10').minutes).toBe(480);
    expect(month.totals.work).toBe(21 * 480);
    expect(month.totals.holiday).toBe(480);
  });

  it('sobota in nedelja ostaneta vikend, tudi če sta navedeni med odsotnostmi', () => {
    const month = resolveMonth({ ...BASE, offDays: [7], sickDays: [8] }); // sobota in nedelja
    const days = month.weeks.flatMap((w) => w.days);
    expect(dayOf(days, '2026-03-07').kind).toBe('weekend');
    expect(dayOf(days, '2026-03-08').kind).toBe('weekend');
    expect(month.totals.off).toBe(0);
    expect(month.totals.sick).toBe(0);
    expect(month.totals.work).toBe(22 * 480);
  });

  it('ista številka dneva v več seznamih: bolniška pred praznikom, praznik pred dopustom', () => {
    const days = flatten(2026, 3, { sickDays: [5], holidays: [5], offDays: [5] });
    expect(dayOf(days, '2026-03-05').kind).toBe('sick');
    const brezBolniske = flatten(2026, 3, { holidays: [5], offDays: [5] });
    expect(dayOf(brezBolniske, '2026-03-05').kind).toBe('holiday');
  });

  it('dopust čez mejo meseca šteje samo v svojem mesecu', () => {
    // 30. in 31. marec sta v mreži marca delovna dneva, v mreži aprila pa `pad`.
    const marec = flatten(2026, 3, { offDays: [30, 31] });
    expect(dayOf(marec, '2026-03-30').kind).toBe('off');
    const april = flatten(2026, 4, { offDays: [1] });
    expect(dayOf(april, '2026-03-30').kind).toBe('pad');
    expect(dayOf(april, '2026-03-30').minutes).toBe(0);
    expect(dayOf(april, '2026-04-01').kind).toBe('off');
  });

  it('tedenski seštevek je vsota dni tistega tedna', () => {
    const month = resolveMonth({ ...BASE, holidays: [10], sickDays: [11] });
    const week = month.weeks.find((w) => w.days.some((d) => d.date === '2026-03-10'))!;
    expect(week.totals.work).toBe(3 * 480); // pon, čet, pet
    expect(week.totals.holiday).toBe(480);
    expect(week.totals.sick).toBe(480);
  });
});

describe('urnik in privzetki', () => {
  it('delno poslan urnik dopolnijo privzetki', () => {
    const merged = mergeDaySchedule({ arrival: { h: 7 } });
    expect(merged.arrival).toEqual({ h: 7, m: 0 });
    expect(merged.departure).toEqual(DEFAULT_DAY_SCHEDULE.departure);
  });

  it('shranjeni privzetek je osnova, telo zahteve pa ga sme prekriti', () => {
    const body = timesheetBodySchema.parse({ year: 2026, month: 3, schedule: { departure: { h: 15 } } });
    const request = applyDefaults(body, {
      fullName: 'Iz privzetkov',
      weeklyWorkHours: 36,
      schedule: { arrival: { h: 7, m: 30 }, departure: { h: 15, m: 30 }, breakStart: { h: 11, m: 0 }, breakEnd: { h: 11, m: 30 } },
    });
    expect(request.fullName).toBe('Iz privzetkov');
    expect(request.weeklyWorkHours).toBe(36);
    // Poslana ura prekrije privzeto uro; minuta, ki je telo ne pošlje, ostane iz privzetka.
    expect(request.schedule.arrival).toEqual({ h: 7, m: 30 });
    expect(request.schedule.departure).toEqual({ h: 15, m: 30 });
    expect(resolveMonth(request).totals.work).toBe(22 * 480);
  });

  it('0 med dnevi je prezrta (payloadi izvirne aplikacije)', () => {
    const body = timesheetBodySchema.parse({ year: 2026, month: 3, sickDays: [0, 5, 0] });
    const request = applyDefaults(body, { fullName: 'X', weeklyWorkHours: 40, schedule: DEFAULT_DAY_SCHEDULE });
    expect(request.sickDays).toEqual([5]);
  });

  it('dan, ki ga v mesecu ni, je napaka in ne tiho prezrt', () => {
    const result = timesheetBodySchema.safeParse({ year: 2026, month: 4, holidays: [31] });
    expect(result.success).toBe(false);
  });

  it('obrnjen urnik je napaka, ne prazna preglednica', () => {
    expect(validateSchedule(mergeDaySchedule({ departure: { h: 8 } }))).toMatch(/Odhod/);
    expect(validateSchedule(mergeDaySchedule({ breakEnd: { h: 11 } }))).toMatch(/malice/);
    expect(validateSchedule(DEFAULT_DAY_SCHEDULE)).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import {
  applyKind,
  currentYearMonth,
  formatHm,
  formatMinutes,
  nextKind,
  parseHm,
  toRequestBody,
  type TimesheetForm,
} from '../../src/app/features/timesheet/timesheet.model.js';

// Pretvorbe med obrazcem in telesom zahteve so čiste funkcije prav zato, da so tu testirane
// brez Angularja in brez omrežja. Napaka v njih je tiha: strežnik bi dobil veljavno telo z
// napačnimi urami in vrnil videti pravilno evidenco.

const FORM: TimesheetForm = {
  year: 2026,
  month: 3,
  fullName: '  Testna Oseba  ',
  weeklyWorkHours: 40,
  arrival: '07:30',
  departure: '15:30',
  breakStart: '11:00',
  breakEnd: '11:30',
  sickDays: [11],
  holidays: [],
  offDays: [5, 3],
};

describe('telo zahteve', () => {
  it('čase pretvori v { h, m } in dneve uredi naraščajoče', () => {
    expect(toRequestBody(FORM)).toEqual({
      year: 2026,
      month: 3,
      fullName: 'Testna Oseba',
      weeklyWorkHours: 40,
      sickDays: [11],
      holidays: [],
      offDays: [3, 5],
      schedule: {
        arrival: { h: 7, m: 30 },
        departure: { h: 15, m: 30 },
        breakStart: { h: 11, m: 0 },
        breakEnd: { h: 11, m: 30 },
      },
    });
  });

  it('ura polnoči ostane 0, ne prazna vrednost', () => {
    expect(parseHm('00:00')).toEqual({ h: 0, m: 0 });
    expect(formatHm({ h: 0, m: 0 })).toBe('00:00');
    expect(formatHm({ h: 9, m: 5 })).toBe('09:05');
  });

  it('minute se izpišejo kot ure:minute brez zaokroževanja', () => {
    expect(formatMinutes(480)).toBe('8:00');
    expect(formatMinutes(10560)).toBe('176:00');
    expect(formatMinutes(450)).toBe('7:30');
  });
});

describe('klikanje po mreži', () => {
  it('krog gre delo → dopust → bolniška → praznik → delo', () => {
    expect(nextKind('work')).toBe('off');
    expect(nextKind('off')).toBe('sick');
    expect(nextKind('sick')).toBe('holiday');
    expect(nextKind('holiday')).toBe('work');
  });

  it('dan je vedno v natanko enem seznamu', () => {
    const start = { sickDays: [11], holidays: [], offDays: [11] };
    const asHoliday = applyKind(start, 11, 'holiday');
    expect(asHoliday).toEqual({ sickDays: [], holidays: [11], offDays: [] });

    const backToWork = applyKind(asHoliday, 11, 'work');
    expect(backToWork).toEqual({ sickDays: [], holidays: [], offDays: [] });
  });

  it('drugih dni ne premakne', () => {
    const result = applyKind({ sickDays: [2], holidays: [], offDays: [9] }, 11, 'sick');
    expect(result.sickDays).toEqual([2, 11]);
    expect(result.offDays).toEqual([9]);
  });
});

describe('privzeti mesec', () => {
  it('se bere po koledarju v Ljubljani, ne po UTC', () => {
    // 1. julij 2026 ob 00:30 po Ljubljani je 30. junij 22:30 UTC — po UTC bi obrazec ponudil
    // junij, čeprav je za uporabnika že julij.
    expect(currentYearMonth(new Date('2026-06-30T22:30:00Z'))).toEqual({ year: 2026, month: 7 });
    expect(currentYearMonth(new Date('2026-03-15T12:00:00Z'))).toEqual({ year: 2026, month: 3 });
  });
});

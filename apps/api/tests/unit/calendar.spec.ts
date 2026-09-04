import { describe, expect, it } from 'vitest';
import { resolveDayStatus, type CalendarOverrideInput } from '../../src/domain/calendar.js';

const MON_THU = [1, 2, 3, 4]; // pon-čet, ISO
const PROFILE = 'profile-1';

describe('resolveDayStatus — prednost FR-014', () => {
  it('praznik, ki pade na delovni dan profila → holiday, brez akcij', () => {
    // 2026-08-18 je torek, torej sicer delovni dan MON_THU profila.
    const decision = resolveDayStatus('2026-08-18', PROFILE, MON_THU, {
      holidays: [{ date: '2026-08-18', name: 'Preizkusni praznik', isWorkFree: true }],
      absences: [],
      overrides: [],
    });
    expect(decision.status).toBe('holiday');
    expect(decision.reason).toBe('Preizkusni praznik');
    expect(decision.isWorkday).toBe(false);
  });

  it('praznik, ki NI dela prost (17. avgust), ne prepreči delovnega dne', () => {
    // 2026-08-17 je ponedeljek, torej sicer delovni dan profila.
    const decision = resolveDayStatus('2026-08-17', PROFILE, MON_THU, {
      holidays: [{ date: '2026-08-17', name: 'združitev prekmurskih Slovencev', isWorkFree: false }],
      absences: [],
      overrides: [],
    });
    expect(decision.status).toBe('workday');
    expect(decision.isWorkday).toBe(true);
  });

  it('dopust čez mejo meseca: noben dan v obdobju ne dobi akcij, meja meseca ne naredi vrzeli', () => {
    const absence = {
      type: 'vacation' as const,
      startDate: '2026-06-29',
      endDate: '2026-07-03',
    };
    for (const date of ['2026-06-29', '2026-06-30', '2026-07-01', '2026-07-02', '2026-07-03']) {
      const decision = resolveDayStatus(date, PROFILE, MON_THU, {
        holidays: [],
        absences: [absence],
        overrides: [],
      });
      expect(decision.status).toBe('vacation');
      expect(decision.isWorkday).toBe(false);
    }
    // Dan takoj po dopustu (2026-07-04 je sobota, ne v MON_THU) ni prizadet od odsotnosti.
    const after = resolveDayStatus('2026-07-06', PROFILE, MON_THU, {
      holidays: [],
      absences: [absence],
      overrides: [],
    });
    expect(after.status).toBe('workday');
  });

  it('forceWorkday PREVLADA nad statusom praznika', () => {
    const overrides: CalendarOverrideInput[] = [
      { localDate: '2026-08-15', profileId: PROFILE, kind: 'forceWorkday' },
    ];
    const decision = resolveDayStatus('2026-08-15', PROFILE, MON_THU, {
      holidays: [{ date: '2026-08-15', name: 'Marijino vnebovzetje', isWorkFree: true }],
      absences: [],
      overrides,
    });
    expect(decision.status).toBe('forced');
    expect(decision.isWorkday).toBe(true);
  });

  it('forceWorkday PREVLADA tudi nad vikendom', () => {
    // 2026-08-15 je sobota v resnici — preverimo neodvisno z dnem, ki gotovo ni v MON_THU.
    const overrides: CalendarOverrideInput[] = [
      { localDate: '2026-08-16', profileId: PROFILE, kind: 'forceWorkday' }, // nedelja
    ];
    const decision = resolveDayStatus('2026-08-16', PROFILE, MON_THU, {
      holidays: [],
      absences: [],
      overrides,
    });
    expect(decision.status).toBe('forced');
    expect(decision.isWorkday).toBe(true);
  });

  it('vikend (dan ni v daysOfWeek profila) → weekend, brez akcij', () => {
    const decision = resolveDayStatus('2026-08-16', PROFILE, MON_THU, {
      holidays: [],
      absences: [],
      overrides: [],
    }); // 2026-08-16 je nedelja
    expect(decision.status).toBe('weekend');
    expect(decision.isWorkday).toBe(false);
  });

  it('override velja samo za naveden profil, ne za druge', () => {
    const overrides: CalendarOverrideInput[] = [
      { localDate: '2026-08-15', profileId: 'drug-profil', kind: 'forceWorkday' },
    ];
    const decision = resolveDayStatus('2026-08-15', PROFILE, MON_THU, {
      holidays: [{ date: '2026-08-15', name: 'Marijino vnebovzetje', isWorkFree: true }],
      absences: [],
      overrides,
    });
    expect(decision.status).toBe('holiday');
  });

  it('navaden delovni dan brez izjem → workday', () => {
    const decision = resolveDayStatus('2026-08-18', PROFILE, MON_THU, {
      holidays: [],
      absences: [],
      overrides: [],
    }); // torek
    expect(decision.status).toBe('workday');
    expect(decision.isWorkday).toBe(true);
  });
});

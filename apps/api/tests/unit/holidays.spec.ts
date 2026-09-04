import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { startTestDb, stopTestDb, clearTestDb } from '../setup/mongo-memory.js';
import { computeEasterSunday, computeHolidaysForYear, ensureHolidaysSeeded } from '../../src/modules/time-tracking/services/holiday-seed.service.js';
import { HolidayModel } from '../../src/modules/time-tracking/models/holiday.model.js';

// research.md §5: izračun v kodi je glavni vir in mora delovati brez omrežja. Datumi
// spodaj so preverjeni proti resničnim znanim datumom velike noči (ne le proti algoritmu
// samemu) — 2026-04-05 je resnična velika noč tega leta.

beforeAll(startTestDb);
afterAll(stopTestDb);
afterEach(clearTestDb);

describe('computeEasterSunday', () => {
  it('vrne pravilne znane datume velike noči', () => {
    expect(computeEasterSunday(2024)).toEqual({ month: 3, day: 31 });
    expect(computeEasterSunday(2025)).toEqual({ month: 4, day: 20 });
    expect(computeEasterSunday(2026)).toEqual({ month: 4, day: 5 });
  });
});

describe('computeHolidaysForYear', () => {
  it('vsebuje vse fiksne praznike in premikajoča velikonočni ponedeljek in binkošti', () => {
    const holidays = computeHolidaysForYear(2026);
    const byDate = new Map(holidays.map((h) => [h.date, h]));

    expect(byDate.get('2026-01-01')?.name).toBe('novo leto');
    expect(byDate.get('2026-01-02')?.name).toBe('novo leto');
    expect(byDate.get('2026-12-25')?.name).toBe('božič');
    expect(byDate.get('2026-04-06')?.name).toBe('velikonočni ponedeljek'); // velika noč + 1
    expect(byDate.get('2026-05-24')?.name).toBe('binkoštna nedelja'); // velika noč + 49
  });

  it('17. avgust in 23. november sta praznika, a NISTA dela prosta (research.md §5)', () => {
    const holidays = computeHolidaysForYear(2026);
    const aug17 = holidays.find((h) => h.date === '2026-08-17');
    const nov23 = holidays.find((h) => h.date === '2026-11-23');
    expect(aug17?.isWorkFree).toBe(false);
    expect(nov23?.isWorkFree).toBe(false);
  });
});

describe('ensureHolidaysSeeded', () => {
  it('napolni praznike ob prvi uporabi leta, ne podvoji ob drugem klicu', async () => {
    await ensureHolidaysSeeded(2026);
    const first = await HolidayModel.countDocuments({ date: /^2026-/ });
    expect(first).toBeGreaterThan(10);

    await ensureHolidaysSeeded(2026);
    const second = await HolidayModel.countDocuments({ date: /^2026-/ });
    expect(second).toBe(first);
  });

  it('ročni vnos ni prepisan s samodejnim polnjenjem (FR-011)', async () => {
    await HolidayModel.create({
      date: '2026-01-01',
      name: 'Ročno popravljeno ime',
      isWorkFree: true,
      isHoliday: true,
      source: 'manual',
    });

    await ensureHolidaysSeeded(2026);

    const jan1 = await HolidayModel.findOne({ date: '2026-01-01' }).lean();
    expect(jan1?.name).toBe('Ročno popravljeno ime');
    expect(jan1?.source).toBe('manual');
  });
});

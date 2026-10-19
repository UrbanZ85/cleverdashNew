import { describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import {
  buildPreview,
  computeWindows,
  countDateCombinations,
  daysBetween,
  eachDay,
  monthPairs,
  monthsCovered,
} from '../../../src/modules/flight-deals/domain/date-window.js';
import { NOW, weekendRule } from './_fixtures.js';

// FR-005 do FR-009: datumska aritmetika (US1, scenariji 1–5 iz naročila, quality gate: DST,
// prelom meseca, prelom leta).

const TZ = 'Europe/Ljubljana';

describe('computeWindows', () => {
  it('obdobje 22. 10.–1. 11. 2026 s ±2 da odhode 20. 10.–3. 11. (acceptance US1.2)', () => {
    const w = computeWindows(weekendRule(), NOW, TZ);
    expect(w.outbound).toEqual({ from: '2026-10-20', to: '2026-11-03' });
    expect(w.oneWay).toBe(false);
    expect(w.nights).toEqual({ min: 2, max: 3 });
    // Povratek znotraj okna: najprej 2 noči po prvem odhodu, najpozneje zadnji dan okna.
    expect(w.inbound).toEqual({ from: '2026-10-22', to: '2026-11-03' });
  });

  it('povratek sme biti zunaj okna (FR-008)', () => {
    const w = computeWindows(weekendRule({ returnWithinWindow: false }), NOW, TZ);
    expect(w.inbound).toEqual({ from: '2026-10-22', to: '2026-11-06' });
  });

  it.each([0, 1, 2, 3, 10])('fleksibilnost ±%i razširi okno na obe strani (odrezano na danes)', (flex) => {
    const w = computeWindows(weekendRule({ flexDays: flex }), NOW, TZ);
    const expectedFrom = DateTime.max(DateTime.fromISO('2026-10-22').minus({ days: flex }), DateTime.fromISO('2026-10-17'));
    expect(w.outbound.from).toBe(expectedFrom.toFormat('yyyy-LL-dd'));
    expect(w.outbound.to).toBe(DateTime.fromISO('2026-11-01').plus({ days: flex }).toFormat('yyyy-LL-dd'));
    if (flex === 10) expect(w.warnings.some((x) => x.includes('preteklost'))).toBe(true);
  });

  it('točni datumi: okno je en dan, nočitve iz razlike datumov', () => {
    const rule = weekendRule({
      dates: { mode: 'fixed', departDate: '2026-11-10', returnDate: '2026-11-14' },
      flexDays: 0,
      minNights: null,
      maxNights: null,
    });
    const w = computeWindows(rule, NOW, TZ);
    expect(w.outbound).toEqual({ from: '2026-11-10', to: '2026-11-10' });
    expect(w.inbound).toEqual({ from: '2026-11-14', to: '2026-11-14' });
    expect(w.nights).toEqual({ min: 4, max: 4 });
  });

  it('točni datumi brez povratka = enosmerno', () => {
    const rule = weekendRule({
      dates: { mode: 'fixed', departDate: '2026-11-10', returnDate: null },
      minNights: null,
      maxNights: null,
    });
    const w = computeWindows(rule, NOW, TZ);
    expect(w.oneWay).toBe(true);
    expect(w.inbound).toBeNull();
  });

  it('tekoče okno 6 mesecev od 31. 8. konča zadnji dan februarja (prelom meseca)', () => {
    const now = DateTime.fromISO('2026-08-31T10:00', { zone: TZ }).toJSDate();
    const rule = weekendRule({ dates: { mode: 'rolling', months: 6 }, flexDays: 5 });
    const w = computeWindows(rule, now, TZ);
    expect(w.outbound.from).toBe('2026-08-31');
    expect(w.outbound.to).toBe('2027-02-28');
  });

  it('tekoče okno čez novo leto in flex se pri rolling ne upošteva', () => {
    const now = DateTime.fromISO('2026-12-20T10:00', { zone: TZ }).toJSDate();
    const w = computeWindows(weekendRule({ dates: { mode: 'rolling', months: 1 }, flexDays: 10 }), now, TZ);
    expect(w.outbound).toEqual({ from: '2026-12-20', to: '2027-01-31' });
  });

  it('okno v preteklost se odreže na danes z opozorilom', () => {
    const w = computeWindows(weekendRule({ dates: { mode: 'range', from: '2026-10-10', to: '2026-10-30' }, flexDays: 0 }), NOW, TZ);
    expect(w.outbound.from).toBe('2026-10-17');
    expect(w.warnings.some((x) => x.includes('preteklost'))).toBe(true);
    expect(w.empty).toBe(false);
  });

  it('celotno obdobje v preteklosti je prazno', () => {
    const w = computeWindows(weekendRule({ dates: { mode: 'range', from: '2026-09-01', to: '2026-09-10' }, flexDays: 0 }), NOW, TZ);
    expect(w.empty).toBe(true);
    expect(countDateCombinations(w, weekendRule())).toBe(0);
  });

  it('"danes" je po coni letališča: ob 23:30 UTC 16. 10. je v Ljubljani že 17. 10.', () => {
    const now = new Date('2026-10-16T23:30:00Z');
    const w = computeWindows(weekendRule({ dates: { mode: 'range', from: '2026-10-10', to: '2026-10-30' }, flexDays: 0 }), now, TZ);
    expect(w.outbound.from).toBe('2026-10-17');
  });
});

describe('countDateCombinations', () => {
  it('vikend: petki 23. 10. in 30. 10. s povratkom v nedeljo (2 noči) → 2 kombinaciji, čez prehod na zimski čas', () => {
    const rule = weekendRule();
    const w = computeWindows(rule, NOW, TZ);
    expect(countDateCombinations(w, rule)).toBe(2);
  });

  it('kateri koli dan, 3–5 nočitev: vsak dan odhoda × 3 trajanja znotraj okna', () => {
    const rule = weekendRule({
      flexDays: 0,
      minNights: 3,
      maxNights: 5,
      outbound: { weekdays: [], earliest: null, latest: null },
      inbound: { weekdays: [], earliest: null, latest: null },
    });
    const w = computeWindows(rule, NOW, TZ);
    // 11 dni odhoda (22. 10.–1. 11.); povratek ≤ 1. 11.: 22.→25/26/27, 23.→26/27/28, 24., 25., 26.→29/30/31, 27.→30/31/1.11, 28.→31/1.11 (2), 29.→1.11 (1), 30., 31., 1.11 → 0
    expect(countDateCombinations(w, rule)).toBe(3 * 6 + 2 + 1);
  });

  it('trajanje, ki ne gre v okno, da 0 kombinacij in opozorilo v predogledu', () => {
    const rule = weekendRule({ dates: { mode: 'range', from: '2026-10-22', to: '2026-10-26' }, flexDays: 0, minNights: 7, maxNights: 9 });
    const preview = buildPreview(rule, NOW, TZ, { maxQueriesPerRule: 60 });
    expect(preview.dateCombinations).toBe(0);
    expect(preview.warnings.some((x) => x.includes('kombinacij'))).toBe(true);
  });

  it('enosmerno: samo dnevi odhoda na dovoljen dan', () => {
    const rule = weekendRule({
      dates: { mode: 'range', from: '2026-10-19', to: '2026-10-25' },
      flexDays: 0,
      minNights: null,
      maxNights: null,
      outbound: { weekdays: [1, 5], earliest: null, latest: null },
    });
    const w = computeWindows(rule, NOW, TZ);
    expect(w.oneWay).toBe(true);
    expect(countDateCombinations(w, rule)).toBe(2); // pon 19. 10., pet 23. 10.
  });
});

describe('pomožne funkcije', () => {
  it('monthPairs: vikend 30. 10. → 1. 11. da par (oktober, november); november samo (november, november)', () => {
    // Odhodi 20. 10.–3. 11., povratki 22. 10.–3. 11., 2–3 nočitvi (weekendRule).
    expect(monthPairs(computeWindows(weekendRule(), NOW, TZ))).toEqual([
      { outbound: '2026-10', inbound: '2026-10' },
      { outbound: '2026-10', inbound: '2026-11' },
      { outbound: '2026-11', inbound: '2026-11' },
    ]);
  });

  it('monthPairs: 5 mesecev vnaprej z 1–3 nočitvami da za VSAK mesec odhoda mesec povratka in naslednjega (napaka 19. 10. 2026)', () => {
    const rule = weekendRule({ dates: { mode: 'rolling', months: 5 }, minNights: 1, maxNights: 3 });
    const pairs = monthPairs(computeWindows(rule, NOW, TZ));
    const byOutbound = new Map<string, string[]>();
    for (const p of pairs) byOutbound.set(p.outbound, [...(byOutbound.get(p.outbound) ?? []), p.inbound!]);
    expect([...byOutbound.keys()]).toEqual(['2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03']);
    expect(byOutbound.get('2026-10')).toEqual(['2026-10', '2026-11']);
    expect(byOutbound.get('2027-03')).toEqual(['2027-03', '2027-04']);
    expect(pairs.length).toBe(12);
  });

  it('monthPairs: enosmerno iskanje ima en par na mesec brez povratka; dolgo trajanje preskoči mesece brez možnega povratka', () => {
    const oneWay = weekendRule({ minNights: null, maxNights: null, inbound: { weekdays: [], earliest: null, latest: null } });
    expect(monthPairs(computeWindows(oneWay, NOW, TZ))).toEqual([
      { outbound: '2026-10', inbound: null },
      { outbound: '2026-11', inbound: null },
    ]);
    // Povratek v oknu, a najmanj 14 nočitev: iz novembra (odhodi 1.–3. 11.) povratek ne more biti do 3. 11.
    const long = weekendRule({ minNights: 14, maxNights: 20 });
    expect(monthPairs(computeWindows(long, NOW, TZ)).every((p) => p.outbound === '2026-10')).toBe(true);
    expect(monthPairs({ ...computeWindows(weekendRule(), NOW, TZ), empty: true })).toEqual([]);
  });

  it('monthsCovered: 20. 10.–3. 11. pokriva oktober in november', () => {
    expect(monthsCovered({ from: '2026-10-20', to: '2026-11-03' })).toEqual(['2026-10', '2026-11']);
  });

  it('eachDay vključi oba robova; daysBetween je razlika dni', () => {
    expect(eachDay({ from: '2026-10-24', to: '2026-10-26' })).toEqual(['2026-10-24', '2026-10-25', '2026-10-26']);
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2);
    expect(daysBetween('2026-10-26', '2026-10-24')).toBe(-2);
  });
});

describe('buildPreview', () => {
  it('poizvedbe = letališča × cilji × pari mesecev; "kamor koli" šteje kot en cilj z opozorilom', () => {
    const preview = buildPreview(weekendRule(), NOW, TZ, { maxQueriesPerRule: 60 });
    expect(preview.outboundWindow).toEqual({ from: '2026-10-20', to: '2026-11-03' });
    expect(preview.queries).toBe(2 * 1 * 3);
    expect(preview.truncated).toBe(false);
    expect(preview.warnings.some((x) => x.includes('kamor koli'))).toBe(true);
  });

  it('presežena meja poizvedb da truncated in opozorilo (FR-015)', () => {
    const rule = weekendRule({ departureAirports: ['LJU', 'ZAG', 'TRS', 'VCE', 'GRZ'], dates: { mode: 'rolling', months: 6 } });
    const preview = buildPreview(rule, NOW, TZ, { maxQueriesPerRule: 10 });
    expect(preview.queries).toBeGreaterThan(10);
    expect(preview.truncated).toBe(true);
  });
});

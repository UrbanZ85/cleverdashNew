import { describe, expect, it } from 'vitest';
import { searchCreateSchema } from '../../../src/modules/flight-deals/domain/rule-input.js';
import { isOneWay, normalizeRule, validateRule } from '../../../src/modules/flight-deals/domain/rule-validation.js';
import { weekendRule } from './_fixtures.js';

// FR-002, FR-006, FR-009: oblika (zod) in pomen (validateRule) vnosa iskanja.

const deps = { maxFlexDays: 60, missingAirports: (codes: readonly string[]) => codes.filter((c) => !['LJU', 'TRS', 'ZAG', 'STN'].includes(c)) };

describe('zod oblika', () => {
  it('fleksibilnost -1 in 2,5 sta zavrnjeni (FR-006)', () => {
    expect(() => searchCreateSchema.parse({ ...weekendRule(), flexDays: -1 })).toThrow();
    expect(() => searchCreateSchema.parse({ ...weekendRule(), flexDays: 2.5 })).toThrow();
  });

  it('fleksibilnost 10 je sprejeta', () => {
    expect(searchCreateSchema.parse({ ...weekendRule(), flexDays: 10 }).flexDays).toBe(10);
  });

  it('kode se normalizirajo na velike črke', () => {
    const parsed = searchCreateSchema.parse({ ...weekendRule(), departureAirports: ['lju', ' trs '] });
    expect(parsed.departureAirports).toEqual(['LJU', 'TRS']);
  });

  it('več kot 8 otrok je zavrnjenih; ura brez oblike HH:MM je zavrnjena', () => {
    expect(() => searchCreateSchema.parse({ ...weekendRule(), passengers: { adults: 1, childrenAges: [1, 2, 3, 4, 5, 6, 7, 8, 9] } })).toThrow();
    expect(() => searchCreateSchema.parse({ ...weekendRule(), outbound: { weekdays: [], earliest: '9:00', latest: null } })).toThrow();
  });
});

describe('validateRule', () => {
  it('veljavno vikend iskanje nima napake', () => {
    expect(validateRule(weekendRule(), deps)).toBeNull();
  });

  it('največ 2 nočitvi + najmanj 3 → sporočilo o trajanju (acceptance US1.4)', () => {
    expect(validateRule(weekendRule({ minNights: 3, maxNights: 2 }), deps)).toMatch(/Največje število nočitev/);
  });

  it('konec obdobja pred začetkom', () => {
    expect(validateRule(weekendRule({ dates: { mode: 'range', from: '2026-11-01', to: '2026-10-22' } }), deps)).toMatch(/Konec obdobja/);
  });

  it('neznano letališče je imenovano', () => {
    expect(validateRule(weekendRule({ departureAirports: ['LJU', 'XXX'] }), deps)).toMatch(/XXX/);
  });

  it('način držav brez države, način letališč brez letališča', () => {
    expect(validateRule(weekendRule({ destination: { mode: 'countries', countries: [], airports: [] } }), deps)).toMatch(/državo/);
    expect(validateRule(weekendRule({ destination: { mode: 'airports', countries: [], airports: [] } }), deps)).toMatch(/ciljno letališče/);
  });

  it('fiksni datumi brez povratka zahtevajo prazno trajanje', () => {
    const rule = weekendRule({ dates: { mode: 'fixed', departDate: '2026-11-10', returnDate: null }, minNights: 2, maxNights: 3 });
    expect(validateRule(rule, deps)).toMatch(/Enosmerno/);
  });

  it('samo ena od mej trajanja ni dovoljena', () => {
    expect(validateRule(weekendRule({ minNights: 2, maxNights: null }), deps)).toMatch(/obe meji/);
  });

  it('fleksibilnost nad mejo namestitve', () => {
    expect(validateRule(weekendRule({ flexDays: 61 }), deps)).toMatch(/največ ±60/);
  });

  it('isto letališče kot odhodno in ciljno', () => {
    expect(validateRule(weekendRule({ destination: { mode: 'airports', countries: [], airports: ['LJU'] } }), deps)).toMatch(/hkrati odhodno in ciljno/);
  });
});

describe('normalizeRule in isOneWay', () => {
  it('razvrsti dneve, odstrani dvojnike in pri rolling ponastavi flex', () => {
    const n = normalizeRule(
      weekendRule({
        departureAirports: ['LJU', 'LJU', 'TRS'],
        outbound: { weekdays: [5, 1, 5], earliest: null, latest: null },
        dates: { mode: 'rolling', months: 3 },
        flexDays: 4,
      }),
    );
    expect(n.departureAirports).toEqual(['LJU', 'TRS']);
    expect(n.outbound.weekdays).toEqual([1, 5]);
    expect(n.flexDays).toBe(0);
  });

  it('isOneWay: fiksni brez povratka da; obdobje brez nočitev da; vikend ne', () => {
    expect(isOneWay(weekendRule({ dates: { mode: 'fixed', departDate: '2026-11-10', returnDate: null }, minNights: null, maxNights: null }))).toBe(true);
    expect(isOneWay(weekendRule({ minNights: null, maxNights: null }))).toBe(true);
    expect(isOneWay(weekendRule())).toBe(false);
  });
});

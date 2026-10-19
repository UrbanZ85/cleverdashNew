import { describe, expect, it } from 'vitest';
import { computeWindows } from '../../../src/modules/flight-deals/domain/date-window.js';
import { findAirport } from '../../../src/modules/flight-deals/domain/airports.js';
import { buildQueryPlan, queryKeyOf } from '../../../src/modules/flight-deals/domain/query-plan.js';
import { travelpayoutsProvider } from '../../../src/modules/flight-deals/providers/travelpayouts.provider.js';
import { ryanairProvider } from '../../../src/modules/flight-deals/providers/ryanair.provider.js';
import type { SearchInput } from '../../../src/modules/flight-deals/domain/rule-input.js';
import { NOW, weekendRule } from './_fixtures.js';

// FR-023, FR-024, SC-007: načrt poizvedb — ista kombinacija dveh uporabnikov je ENA poizvedba.

function ctx(rule: SearchInput, id: string) {
  return { rule: { ...rule, id }, windows: computeWindows(rule, NOW, 'Europe/Ljubljana'), airports: findAirport };
}

describe('buildQueryPlan', () => {
  it('dve iskanji z isto kombinacijo dasta en ključ (SC-007)', () => {
    const a = travelpayoutsProvider.buildQueries(ctx(weekendRule(), 'a'));
    const b = travelpayoutsProvider.buildQueries(ctx(weekendRule({ name: 'Drugo' }), 'b'));
    const plan = buildQueryPlan(
      [
        { ruleId: 'a', queries: a },
        { ruleId: 'b', queries: b },
      ],
      { maxQueriesPerRule: 60 },
    );
    expect(plan.queries.size).toBe(a.length);
    expect(plan.requestedCount).toBe(a.length + b.length);
    expect(plan.perRule.get('a')?.queryKeys).toEqual(plan.perRule.get('b')?.queryKeys);
  });

  it('Travelpayouts: 5 letališč × kamor koli × 6 mesecev = 35 poizvedb (6 mesecev od oktobra pokrije 7 koledarskih)', () => {
    const rule = weekendRule({ departureAirports: ['LJU', 'ZAG', 'TRS', 'VCE', 'GRZ'], dates: { mode: 'rolling', months: 6 } });
    const queries = travelpayoutsProvider.buildQueries(ctx(rule, 'r'));
    expect(queries.length).toBe(5 * 7);
    expect(queries.every((q) => q.destination === null)).toBe(true);
  });

  it('Ryanair: ena poizvedba na letališče in cilj, "kamor koli" je ena', () => {
    const rule = weekendRule({ departureAirports: ['LJU', 'ZAG', 'TRS', 'VCE', 'GRZ'], dates: { mode: 'rolling', months: 6 } });
    expect(ryanairProvider.buildQueries(ctx(rule, 'r')).length).toBe(5);
    const byCountry = weekendRule({ destination: { mode: 'countries', countries: ['GB', 'ES'], airports: [] } });
    const q = ryanairProvider.buildQueries(ctx(byCountry, 'c'));
    expect(q.length).toBe(2 * 2);
    expect(q.map((x) => x.destination).sort()).toEqual(['country:ES', 'country:ES', 'country:GB', 'country:GB']);
  });

  it('meja na iskanje da truncated in obdrži prve poizvedbe', () => {
    const rule = weekendRule({ departureAirports: ['LJU', 'ZAG', 'TRS', 'VCE', 'GRZ'], dates: { mode: 'rolling', months: 6 } });
    const queries = travelpayoutsProvider.buildQueries(ctx(rule, 'r'));
    const plan = buildQueryPlan([{ ruleId: 'r', queries }], { maxQueriesPerRule: 10 });
    expect(plan.perRule.get('r')?.truncated).toBe(true);
    expect(plan.perRule.get('r')?.queryKeys.length).toBe(10);
  });

  it('ključ je determinističen in neodvisen od vrstnega reda polj', () => {
    const [q] = travelpayoutsProvider.buildQueries(ctx(weekendRule(), 'a'));
    expect(queryKeyOf({ ...q! })).toBe(queryKeyOf(q!));
    expect(queryKeyOf(q!)).toContain('travelpayouts|LJU|*|2026-10-01|2026-10-31');
  });

  it('prazno okno ne da poizvedb', () => {
    const past = weekendRule({ dates: { mode: 'range', from: '2026-09-01', to: '2026-09-05' }, flexDays: 0 });
    expect(travelpayoutsProvider.buildQueries(ctx(past, 'p'))).toEqual([]);
    expect(ryanairProvider.buildQueries(ctx(past, 'p'))).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { planEvent, type PlanInput } from '../../../src/platform/scanner/domain/alert-plan.js';

// 019 (research §2): skupna odločitev o dogodkih; LEGO ovoj ima svoj test (tests/unit/lego/events.spec.ts).

const NOW = new Date('2026-10-21T10:00:00Z');
const base = (over: Partial<PlanInput> = {}): PlanInput => ({
  isNew: false,
  change: 'UNCHANGED',
  comparableChanged: false,
  profit: null,
  threshold: undefined,
  listingType: 'FIXED_PRICE',
  endsAt: null,
  now: NOW,
  auctionEndingHours: 6,
  previous: null,
  ...over,
});

describe('planEvent (skupno jedro)', () => {
  it('brez praga: nov, pocenitev, podražitev; brez spremembe nič', () => {
    expect(planEvent(base({ isNew: true, change: 'NEW' })).reasons).toEqual(['new']);
    expect(planEvent(base({ change: 'PRICE_DOWN' })).changeType).toBe('PRICE_DOWN');
    expect(planEvent(base({ change: 'PRICE_UP' })).changeType).toBe('PRICE_UP');
    expect(planEvent(base()).changeType).toBeNull();
  });

  it('prag: neznan dobiček ne obvešča; podcenjeno samo prvič; ponastavitev pod pragom', () => {
    expect(planEvent(base({ isNew: true, change: 'NEW', threshold: 30, profit: null })).changeType).toBeNull();
    const first = planEvent(base({ threshold: 30, profit: 40 }));
    expect(first.reasons).toEqual(['undervalued']);
    expect(first.alerts.profitNotified).toBe(true);
    expect(planEvent(base({ threshold: 30, profit: 40, previous: first.alerts })).changeType).toBeNull();
    const below = planEvent(base({ threshold: 30, profit: 10, previous: first.alerts }));
    expect(below.alerts.profitNotified).toBe(false);
  });

  it('dražba: enkrat v oknu, ne po izteku, ne zunaj okna', () => {
    const auction = { listingType: 'AUCTION' as const };
    const inWindow = planEvent(base({ ...auction, endsAt: new Date(NOW.getTime() + 3 * 3_600_000) }));
    expect(inWindow.reasons).toEqual(['auction-ending']);
    expect(planEvent(base({ ...auction, endsAt: new Date(NOW.getTime() + 3 * 3_600_000), previous: inWindow.alerts })).changeType).toBeNull();
    expect(planEvent(base({ ...auction, endsAt: new Date(NOW.getTime() + 8 * 3_600_000) })).changeType).toBeNull();
    expect(planEvent(base({ ...auction, endsAt: new Date(NOW.getTime() - 60_000) })).changeType).toBeNull();
  });

  it('dražba čez prehod na zimski čas (25. 10. 2026): okno se šteje po instantu, ne po uri na steni', () => {
    // 25. 10. 2026 ob 01:00 UTC se ura v Ljubljani vrne z 03:00 na 02:00; 4 ure instanta so še vedno 4 ure.
    const now = new Date('2026-10-25T00:00:00Z');
    const p = planEvent(base({ now, listingType: 'AUCTION', endsAt: new Date('2026-10-25T04:00:00Z'), auctionEndingHours: 5 }));
    expect(p.reasons).toEqual(['auction-ending']);
    expect(planEvent(base({ now, listingType: 'AUCTION', endsAt: new Date('2026-10-25T04:00:00Z'), auctionEndingHours: 3 })).changeType).toBeNull();
  });

  it('sprememba hasha je "changed"', () => {
    expect(planEvent(base({ comparableChanged: true }))).toMatchObject({ changeType: 'CHANGED', reasons: ['changed'] });
  });
});

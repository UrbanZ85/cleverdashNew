import { describe, expect, it } from 'vitest';
import { planCollectiblesEvent, type PlanCollectiblesInput } from '../../../src/modules/collectibles-scanner/events.js';

// 019 (FR-024): obvestila — prag dobička ali prag popusta, natanko eden; brez dvojnikov.

const NOW = new Date('2026-10-21T10:00:00Z');
const NONE = { profitNotified: false, discountNotified: false, auctionEndingNotified: false };
const base = (over: Partial<PlanCollectiblesInput> = {}): PlanCollectiblesInput => ({
  isNew: false,
  change: 'UNCHANGED',
  comparableChanged: false,
  profit: null,
  discountPct: null,
  notifyMinProfit: undefined,
  notifyMinDiscountPct: undefined,
  listingType: 'FIXED_PRICE',
  endsAt: null,
  now: NOW,
  auctionEndingHours: 6,
  previous: null,
  ...over,
});

describe('planCollectiblesEvent', () => {
  it('brez praga: nov oglas, pocenitev; brez spremembe nič', () => {
    expect(planCollectiblesEvent(base({ isNew: true, change: 'NEW' }))).toMatchObject({ changeType: 'NEW', reasons: ['new'], thresholdKind: null });
    expect(planCollectiblesEvent(base({ change: 'PRICE_DOWN' })).changeType).toBe('PRICE_DOWN');
    expect(planCollectiblesEvent(base()).changeType).toBeNull();
  });

  it('prag dobička: neznan dobiček ne obvešča; podcenjeno enkrat', () => {
    expect(planCollectiblesEvent(base({ isNew: true, change: 'NEW', notifyMinProfit: 20 })).changeType).toBeNull();
    const first = planCollectiblesEvent(base({ notifyMinProfit: 20, profit: 30 }));
    expect(first).toMatchObject({ reasons: ['undervalued'], thresholdKind: 'profit' });
    expect(first.alerts).toEqual({ ...NONE, profitNotified: true });
    expect(planCollectiblesEvent(base({ notifyMinProfit: 20, profit: 30, previous: first.alerts })).changeType).toBeNull();
  });

  it('prag popusta (do ocene): zastavica discountNotified, ne profitNotified', () => {
    const first = planCollectiblesEvent(base({ notifyMinDiscountPct: 25, discountPct: 30 }));
    expect(first).toMatchObject({ reasons: ['undervalued'], thresholdKind: 'discount' });
    expect(first.alerts).toEqual({ ...NONE, discountNotified: true });
    expect(planCollectiblesEvent(base({ notifyMinDiscountPct: 25, discountPct: 30, previous: first.alerts })).changeType).toBeNull();
  });

  it('prag popusta: neznan popust ne obvešča; pod pragom ponastavi zastavico', () => {
    expect(planCollectiblesEvent(base({ isNew: true, change: 'NEW', notifyMinDiscountPct: 25, discountPct: null })).changeType).toBeNull();
    const below = planCollectiblesEvent(base({ notifyMinDiscountPct: 25, discountPct: 10, previous: { ...NONE, discountNotified: true } }));
    expect(below.alerts.discountNotified).toBe(false);
    expect(planCollectiblesEvent(base({ notifyMinDiscountPct: 25, discountPct: 30, previous: below.alerts })).reasons).toEqual(['undervalued']);
  });

  it('prag dobička ima prednost pred pragom popusta', () => {
    const p = planCollectiblesEvent(base({ notifyMinProfit: 20, notifyMinDiscountPct: 25, profit: 5, discountPct: 90, isNew: true, change: 'NEW' }));
    expect(p.thresholdKind).toBe('profit');
    expect(p.changeType).toBeNull();
  });

  it('dražba: enkrat v oknu, nato nič (brez dvojnikov)', () => {
    const ends = new Date(NOW.getTime() + 3 * 3_600_000);
    const first = planCollectiblesEvent(base({ listingType: 'AUCTION', endsAt: ends }));
    expect(first.reasons).toEqual(['auction-ending']);
    expect(first.alerts.auctionEndingNotified).toBe(true);
    expect(planCollectiblesEvent(base({ listingType: 'AUCTION', endsAt: ends, previous: first.alerts })).changeType).toBeNull();
  });

  it('dražba čez prehod na zimski čas (25. 10. 2026): okno je po instantu', () => {
    const now = new Date('2026-10-25T00:00:00Z');
    const ends = new Date('2026-10-25T04:00:00Z');
    expect(planCollectiblesEvent(base({ now, listingType: 'AUCTION', endsAt: ends, auctionEndingHours: 5 })).reasons).toEqual(['auction-ending']);
    expect(planCollectiblesEvent(base({ now, listingType: 'AUCTION', endsAt: ends, auctionEndingHours: 3 })).changeType).toBeNull();
  });

  it('sprememba vrste ali stanja je "changed"', () => {
    expect(planCollectiblesEvent(base({ comparableChanged: true }))).toMatchObject({ changeType: 'CHANGED', reasons: ['changed'] });
  });
});

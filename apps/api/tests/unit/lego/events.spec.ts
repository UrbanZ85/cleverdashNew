import { describe, expect, it } from 'vitest';
import { planEvent, type PlanInput } from '../../../src/modules/lego-scanner/events.js';

// 018, FR-019 do FR-021: kdaj nastane dogodek obvestila (prag dobička, podcenjena najdba, dražba).

const NOW = new Date('2026-10-21T10:00:00Z');
const base = (over: Partial<PlanInput> = {}): PlanInput => ({
  isNew: false,
  change: 'UNCHANGED',
  comparableChanged: false,
  profit: 50,
  threshold: undefined,
  listingType: 'FIXED_PRICE',
  endsAt: null,
  now: NOW,
  auctionEndingHours: 6,
  previous: { profitNotified: false, auctionEndingNotified: false },
  ...over,
});

describe('brez praga', () => {
  it('nov oglas → NEW; pocenitev → PRICE_DOWN; podražitev → PRICE_UP; nespremenjen → brez dogodka', () => {
    expect(planEvent(base({ isNew: true, change: 'NEW', previous: null }))).toMatchObject({ changeType: 'NEW', reasons: ['new'] });
    expect(planEvent(base({ change: 'PRICE_DOWN' }))).toMatchObject({ changeType: 'PRICE_DOWN', reasons: ['price-down'] });
    expect(planEvent(base({ change: 'PRICE_UP' }))).toMatchObject({ changeType: 'PRICE_UP', reasons: ['price-up'] });
    expect(planEvent(base()).changeType).toBeNull();
  });

  it('sprememba stanja (hash) → CHANGED', () => {
    expect(planEvent(base({ comparableChanged: true }))).toMatchObject({ changeType: 'CHANGED', reasons: ['changed'] });
  });

  it('zastavica profitNotified ostane false, dokler prag ni nastavljen', () => {
    expect(planEvent(base({ isNew: true, change: 'NEW', previous: null })).alerts.profitNotified).toBe(false);
  });
});

describe('s pragom dobička', () => {
  it('nov oglas pod pragom ne obvešča; z neznanim dobičkom tudi ne', () => {
    expect(planEvent(base({ isNew: true, change: 'NEW', previous: null, threshold: 80, profit: 50 })).changeType).toBeNull();
    expect(planEvent(base({ isNew: true, change: 'NEW', previous: null, threshold: 30, profit: null })).changeType).toBeNull();
  });

  it('nov oglas nad pragom obvešča; zastavica se nastavi', () => {
    const p = planEvent(base({ isNew: true, change: 'NEW', previous: null, threshold: 30, profit: 50 }));
    expect(p).toMatchObject({ changeType: 'NEW', reasons: ['new'], alerts: { profitNotified: true } });
  });

  it('pocenitev prinese dobiček prvič nad prag → PRICE_DOWN z razlogom "undervalued"', () => {
    const p = planEvent(base({ change: 'PRICE_DOWN', threshold: 30, profit: 40, previous: { profitNotified: false, auctionEndingNotified: false } }));
    expect(p.reasons).toEqual(['price-down', 'undervalued']);
    expect(p.changeType).toBe('PRICE_DOWN');
  });

  it('dobiček je po osvežitvi cenika prvič nad pragom brez spremembe cene → CHANGED "undervalued", naslednjič ne več', () => {
    const first = planEvent(base({ threshold: 30, profit: 40 }));
    expect(first).toMatchObject({ changeType: 'CHANGED', reasons: ['undervalued'], alerts: { profitNotified: true } });
    expect(planEvent(base({ threshold: 30, profit: 40, previous: first.alerts })).changeType).toBeNull();
  });

  it('dobiček pade pod prag → zastavica se ponastavi; ponovni prehod je nov dogodek', () => {
    const below = planEvent(base({ threshold: 30, profit: 10, previous: { profitNotified: true, auctionEndingNotified: false } }));
    expect(below).toMatchObject({ changeType: null, alerts: { profitNotified: false } });
    expect(planEvent(base({ threshold: 30, profit: 40, previous: below.alerts })).reasons).toEqual(['undervalued']);
  });
});

describe('dražba', () => {
  const auction = { listingType: 'AUCTION' as const };

  it('izteka v oknu → dogodek enkrat; izven okna ali že obveščeno → brez', () => {
    const inWindow = planEvent(base({ ...auction, endsAt: new Date(NOW.getTime() + 3 * 3_600_000) }));
    expect(inWindow).toMatchObject({ changeType: 'CHANGED', reasons: ['auction-ending'], alerts: { auctionEndingNotified: true } });
    expect(planEvent(base({ ...auction, endsAt: new Date(NOW.getTime() + 3 * 3_600_000), previous: inWindow.alerts })).changeType).toBeNull();
    expect(planEvent(base({ ...auction, endsAt: new Date(NOW.getTime() + 8 * 3_600_000) })).changeType).toBeNull();
    expect(planEvent(base({ ...auction, endsAt: new Date(NOW.getTime() - 60_000) })).changeType).toBeNull();
  });

  it('nov oglas, ki se hkrati izteka: en dogodek z obema razlogoma, tip NEW', () => {
    const p = planEvent(base({ ...auction, isNew: true, change: 'NEW', previous: null, endsAt: new Date(NOW.getTime() + 3_600_000) }));
    expect(p.reasons).toEqual(['new', 'auction-ending']);
    expect(p.changeType).toBe('NEW');
  });

  it('sprememba ponudbe na dražbi je PRICE_UP (zadnja ponudba, ne končna cena); pod pragom dražba ne obvešča', () => {
    expect(planEvent(base({ ...auction, change: 'PRICE_UP' })).changeType).toBe('PRICE_UP');
    expect(planEvent(base({ ...auction, threshold: 100, profit: 10, endsAt: new Date(NOW.getTime() + 3_600_000) })).changeType).toBeNull();
  });
});

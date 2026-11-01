import { describe, expect, it } from 'vitest';
import { computeOpportunity, EU_COUNTRIES, round2, scoreFor, type OpportunityMathInput } from '../../../src/platform/scanner/domain/opportunity-math.js';

// 019 (research §2): skupna aritmetika priložnosti. Brez imena tipa; LEGO jo uporablja prek ovoja
// (tests/unit/lego/valuation-opportunity.spec.ts ostane nespremenjen).

const PARAMS = { sellingFeePct: 10, riskReservePct: 5, conservativeDiscountPct: 10, buyerFeePct: 0 };

function input(over: Partial<OpportunityMathInput> = {}): OpportunityMathInput {
  return {
    price: { amount: 100, currency: 'EUR' },
    shipping: { amount: 10, currency: 'EUR' },
    shippingKnown: true,
    sellerCountry: 'DE',
    blockers: [],
    profitBase: 200,
    confidence: 'high',
    params: PARAMS,
    ...over,
  };
}

describe('computeOpportunity', () => {
  it('vse znano: vsaka postavka vidna, dobiček in ROI izračunana', () => {
    const o = computeOpportunity(input());
    expect(o).toMatchObject({ illustrative: true, shipping: 10, taxes: 0, acquisitionCost: 110, conservativeValue: 180, sellingFees: 18, riskReserve: 5.5, profit: 46.5, roi: 0.423, discountPct: 50, missing: [] });
    expect(o.score).toBe(Math.round(Math.min(0.423 / 0.5, 1) * 70 + 30));
  });

  it('poštnina neznana ni 0: dobiček null, razlog shipping', () => {
    const o = computeOpportunity(input({ shippingKnown: false, shipping: null }));
    expect(o.shipping).toBeNull();
    expect(o.profit).toBeNull();
    expect(o.missing).toEqual(['shipping']);
  });

  it('poštnina v drugi valuti se ne šteje', () => {
    expect(computeOpportunity(input({ shipping: { amount: 10, currency: 'USD' } })).missing).toContain('shipping');
  });

  it('prodajalec izven EU ali brez države: davki neznani, dobička ni', () => {
    expect(computeOpportunity(input({ sellerCountry: 'US' })).missing).toEqual(['taxes']);
    expect(computeOpportunity(input({ sellerCountry: null })).missing).toEqual(['taxes']);
    expect(EU_COUNTRIES.has('SI')).toBe(true);
    expect(EU_COUNTRIES.has('GB')).toBe(false);
  });

  it('razlogi klicatelja gredo na začetek, nato shipping, taxes, valuation', () => {
    const o = computeOpportunity(input({ blockers: ['identification'], shippingKnown: false, shipping: null, sellerCountry: 'US', profitBase: null }));
    expect(o.missing).toEqual(['identification', 'shipping', 'taxes', 'valuation']);
    expect(o.profit).toBeNull();
  });

  it('osnova dobička manjka: lasten razlog; popust se lahko vseeno izračuna iz druge osnove', () => {
    const o = computeOpportunity(input({ profitBase: null, profitBaseMissing: 'sold-prices', discountBase: 150 }));
    expect(o.missing).toEqual(['sold-prices']);
    expect(o.profit).toBeNull();
    expect(o.score).toBeNull();
    expect(o.discountPct).toBe(33.33);
  });

  it('provizija kupca vstopi v skupni strošek', () => {
    const o = computeOpportunity(input({ params: { ...PARAMS, buyerFeePct: 10 } }));
    expect(o.buyerFees).toBe(10);
    expect(o.acquisitionCost).toBe(120);
  });

  it('izguba: profit negativen, ocena 0', () => {
    const o = computeOpportunity(input({ profitBase: 100 }));
    expect(o.profit).toBeLessThan(0);
    expect(o.score).toBe(0);
  });
});

describe('scoreFor / round2', () => {
  it('meje ocene', () => {
    expect(scoreFor(0, 0, 'high')).toBe(0);
    expect(scoreFor(100, 0.5, 'high')).toBe(100);
    expect(scoreFor(100, 0.5, 'insufficient')).toBe(70);
  });
  it('round2', () => {
    expect(round2(1.005 + 1e-9)).toBe(1.01);
    expect(round2(2)).toBe(2);
  });
});

import { describe, expect, it } from 'vitest';
import { evaluateOpportunity, scoreFor } from '../../../src/modules/lego-scanner/domain/opportunity.js';
import { guideFor, valuate, weightedMedian, type PriceGuide } from '../../../src/modules/lego-scanner/domain/valuation.js';
import type { OpportunityParams, Valuation } from '../../../src/modules/lego-scanner/domain/types.js';

// 018, FR-014 do FR-018: vrednotenje samo iz prodaj, ločeno novo/rabljeno; dobiček samo iz podatkov.

const guide = (over: Partial<PriceGuide> = {}): PriceGuide => ({ currency: 'EUR', average: 550, qtyAverage: 550, min: 480, max: 620, count: 12, details: null, ...over });

describe('valuate', () => {
  it('veliko prodaj → visoko zaupanje, povprečje in število prodaj; aktivne ponudbe ločeno', () => {
    const v = valuate({ sold: guide(), stock: guide({ average: 700, qtyAverage: null, min: 640, count: 5 }), newOrUsed: 'N', listingCurrency: 'EUR', stale: false });
    expect(v).toMatchObject({ basis: 'sold', newOrUsed: 'N', average: 550, salesCount: 12, periodMonths: 6, confidence: 'high', comparable: true, stale: false });
    expect(v.active).toEqual({ average: 700, min: 640, count: 5 });
    expect(v.median).toBeNull(); // brez posameznih prodaj mediane ne izmislimo
  });

  it.each([
    [10, 'high'],
    [9, 'medium'],
    [3, 'medium'],
    [2, 'low'],
    [1, 'low'],
  ])('%i prodaj → zaupanje %s', (count, confidence) => {
    expect(valuate({ sold: guide({ count }), stock: null, newOrUsed: 'N', listingCurrency: 'EUR', stale: false }).confidence).toBe(confidence);
  });

  it('brez prodaj ali brez cene: "premalo podatkov"; aktivne ponudbe NISO vir vrednosti', () => {
    const none = valuate({ sold: guide({ count: 0 }), stock: guide({ average: 600, count: 9 }), newOrUsed: 'U', listingCurrency: 'EUR', stale: false });
    expect(none).toMatchObject({ confidence: 'insufficient', average: null, comparable: false });
    expect(none.active?.count).toBe(9);
    expect(none.note).toContain('Premalo podatkov');
    expect(valuate({ sold: null, stock: null, newOrUsed: 'N', listingCurrency: 'EUR', stale: false }).confidence).toBe('insufficient');
    expect(valuate({ sold: guide({ average: null, qtyAverage: null }), stock: null, newOrUsed: 'N', listingCurrency: 'EUR', stale: false }).confidence).toBe('insufficient');
  });

  it('druga valuta → primerjava ni mogoča (brez pretvorbe)', () => {
    const v = valuate({ sold: guide(), stock: null, newOrUsed: 'N', listingCurrency: 'GBP', stale: false });
    expect(v.comparable).toBe(false);
    expect(v.note).toContain('primerjava ni mogoča');
  });

  it('star podatek zniža zaupanje za eno stopnjo in to pove', () => {
    const v = valuate({ sold: guide(), stock: null, newOrUsed: 'N', listingCurrency: 'EUR', stale: true });
    expect(v).toMatchObject({ confidence: 'medium', stale: true });
    expect(v.note).toContain('star');
  });

  it('povprečje je tehtano s količino, kadar ga vir da; mediana samo iz posameznih prodaj', () => {
    expect(valuate({ sold: guide({ average: 500, qtyAverage: 540 }), stock: null, newOrUsed: 'N', listingCurrency: 'EUR', stale: false }).average).toBe(540);
    expect(weightedMedian(null)).toBeNull();
    expect(weightedMedian([])).toBeNull();
    expect(weightedMedian([{ unitPrice: 100, quantity: 1 }, { unitPrice: 300, quantity: 1 }, { unitPrice: 200, quantity: 1 }])).toBe(200);
    expect(weightedMedian([{ unitPrice: 100, quantity: 1 }, { unitPrice: 200, quantity: 1 }])).toBe(150);
    expect(weightedMedian([{ unitPrice: 100, quantity: 5 }, { unitPrice: 900, quantity: 1 }])).toBe(100);
  });
});

describe('guideFor — kaj se vrednoti', () => {
  it('zapečatano → novo; kompletno rabljeno → rabljeno; vse ostalo se NE vrednoti (kompletnost se ne domneva)', () => {
    expect(guideFor('NEW_SEALED')).toEqual({ newOrUsed: 'N' });
    expect(guideFor('USED_COMPLETE')).toEqual({ newOrUsed: 'U' });
    for (const c of ['NEW_OPEN_BOX', 'USED_INCOMPLETE', 'PARTS_ONLY', 'UNKNOWN'] as const) {
      expect(guideFor(c)).toHaveProperty('skip');
    }
  });
});

const PARAMS: OpportunityParams = { sellingFeePct: 10, riskReservePct: (25 / 420) * 100, conservativeDiscountPct: 0, buyerFeePct: 0 };
const value = (over: Partial<Valuation> = {}): Valuation => ({
  basis: 'sold',
  newOrUsed: 'N',
  currency: 'EUR',
  average: 550,
  median: null,
  salesCount: 12,
  periodMonths: 6,
  confidence: 'high',
  stale: false,
  active: null,
  comparable: true,
  note: null,
  ...over,
});
const input = (over: Partial<Parameters<typeof evaluateOpportunity>[0]> = {}) => ({
  price: { amount: 400, currency: 'EUR' },
  shipping: { amount: 20, currency: 'EUR' },
  shippingKnown: true,
  sellerCountry: 'DE',
  condition: 'NEW_SEALED' as const,
  identified: true,
  valuation: value(),
  params: PARAMS,
  ...over,
});

describe('evaluateOpportunity', () => {
  it('primer iz naloge: 400 + 20 → strošek 420, vrednost 550, provizije 55, rezerva 25 → dobiček 50, ROI 11,9 %', () => {
    const o = evaluateOpportunity(input());
    expect(o).toMatchObject({
      illustrative: true,
      acquisitionCost: 420,
      conservativeValue: 550,
      sellingFees: 55,
      riskReserve: 25,
      profit: 50,
      roi: 0.119,
      discountPct: 27.27,
      missing: [],
    });
    expect(o.score).toBe(Math.round((0.119 / 0.5) * 70 + 30));
  });

  it('privzeti konservativni popust zniža vrednost; dobiček je lahko negativen (nič ni olepšano)', () => {
    const o = evaluateOpportunity(input({ params: { sellingFeePct: 12, riskReservePct: 5, conservativeDiscountPct: 10, buyerFeePct: 0 } }));
    expect(o.conservativeValue).toBe(495);
    expect(o.profit).toBe(-5.4);
    expect(o.score).toBe(0);
  });

  it('neznana poštnina → brez dobička ("shipping"), ne 0; popust je kljub temu znan', () => {
    const o = evaluateOpportunity(input({ shipping: null, shippingKnown: false }));
    expect(o).toMatchObject({ profit: null, roi: null, score: null, acquisitionCost: null, shipping: null, discountPct: 27.27 });
    expect(o.missing).toEqual(['shipping']);
  });

  it('prodajalec izven EU ali neznana država → davki niso znani → brez dobička', () => {
    expect(evaluateOpportunity(input({ sellerCountry: 'GB' })).missing).toContain('taxes');
    expect(evaluateOpportunity(input({ sellerCountry: null })).profit).toBeNull();
    expect(evaluateOpportunity(input({ sellerCountry: 'it' })).taxes).toBe(0);
  });

  it('brez vrednosti, premalo podatkov ali neprimerljivo → "valuation"', () => {
    expect(evaluateOpportunity(input({ valuation: null })).missing).toContain('valuation');
    expect(evaluateOpportunity(input({ valuation: value({ confidence: 'insufficient', average: null }) })).profit).toBeNull();
    expect(evaluateOpportunity(input({ valuation: value({ comparable: false }) })).missing).toContain('valuation');
    expect(evaluateOpportunity(input({ price: { amount: 400, currency: 'GBP' }, shipping: { amount: 20, currency: 'GBP' } })).profit).toBeNull();
  });

  it('nepreverjena kompletnost / ročni pregled → brez dobička', () => {
    expect(evaluateOpportunity(input({ condition: 'UNKNOWN' })).missing).toContain('condition');
    expect(evaluateOpportunity(input({ condition: 'USED_INCOMPLETE' })).profit).toBeNull();
    expect(evaluateOpportunity(input({ identified: false })).missing).toContain('identification');
  });

  it('mediana ima prednost pred povprečjem; provizija kupca se prišteje stroških', () => {
    const o = evaluateOpportunity(input({ valuation: value({ median: 500 }), params: { ...PARAMS, buyerFeePct: 5 } }));
    expect(o.conservativeValue).toBe(500);
    expect(o.buyerFees).toBe(20);
    expect(o.acquisitionCost).toBe(440);
  });
});

describe('scoreFor', () => {
  it('izguba ali ničla = 0; 50 % ROI in visoko zaupanje = 100; nižje zaupanje manj', () => {
    expect(scoreFor(-1, -0.1, 'high')).toBe(0);
    expect(scoreFor(0, 0, 'high')).toBe(0);
    expect(scoreFor(100, 0.5, 'high')).toBe(100);
    expect(scoreFor(100, 0.9, 'high')).toBe(100);
    expect(scoreFor(100, 0.5, 'medium')).toBe(90);
    expect(scoreFor(100, 0.5, 'low')).toBe(80);
  });
});

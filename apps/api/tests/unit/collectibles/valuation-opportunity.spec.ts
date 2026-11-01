import { describe, expect, it } from 'vitest';
import { askingStatsFor, MIN_COMPARABLES, type ComparableInput } from '../../../src/modules/collectibles-scanner/domain/comparables.js';
import { evaluateOpportunity, type OpportunityInput } from '../../../src/modules/collectibles-scanner/domain/opportunity.js';
import { buildValuation, discountBase, profitBase, type ValuationInput } from '../../../src/modules/collectibles-scanner/domain/valuation.js';
import type { Valuation } from '../../../src/modules/collectibles-scanner/domain/types.js';

// 019 (FR-017 do FR-022): tri vrste cen se ne mešajo; dobiček samo iz preverjenih prodaj; neznano ostane neznano.

const ESTIMATE = { value: 12, low: 8, trend: 12, source: 'Cardmarket (TCGdex)', updatedAt: '2026-10-21T13:00:00.000Z', currency: 'EUR', basis: 'estimate' as const };
const GUIDE = { ...ESTIMATE, value: 60, source: 'PriceCharting', basis: 'guide' as const };
const SOLD = { average: 14, median: 13, count: 8, periodMonths: 6, source: 'Testni vir', currency: 'EUR' };
const ASKING = { median: 11, min: 10, count: 3, currency: 'EUR' };

function val(over: Partial<ValuationInput> = {}): Valuation {
  return buildValuation({ listingCurrency: 'EUR', identified: true, asking: null, estimate: null, sold: null, ...over });
}

describe('buildValuation — vrste cen so ločene', () => {
  it('samo zahtevane cene: premalo podatkov, asking ni osnova', () => {
    const v = val({ asking: ASKING });
    expect(v).toMatchObject({ primary: null, confidence: 'insufficient', comparable: false });
    expect(v.asking).toEqual(ASKING);
    expect(v.note).toContain('Zahtevane cene niso prodajne');
  });

  it('samo ocena: primary estimate, nizko zaupanje, opomba "ni preverjena prodaja"', () => {
    const v = val({ estimate: ESTIMATE });
    expect(v).toMatchObject({ primary: 'estimate', confidence: 'low', comparable: true });
    expect(v.note).toContain('ne preverjena prodaja');
    expect(v.sold).toBeNull();
  });

  it('cenik je "guide", ne "sold"', () => {
    expect(val({ estimate: GUIDE }).primary).toBe('guide');
  });

  it('preverjene prodaje imajo prednost pred oceno in se ne mešajo z njo', () => {
    const v = val({ estimate: ESTIMATE, sold: SOLD, asking: ASKING });
    expect(v.primary).toBe('sold');
    expect(v.estimate).toEqual(ESTIMATE);
    expect(v.sold).toEqual(SOLD);
    expect(v.asking).toEqual(ASKING);
    expect(v.confidence).toBe('medium');
  });

  it('zaupanje prodaj po številu', () => {
    expect(val({ sold: { ...SOLD, count: 12 } }).confidence).toBe('high');
    expect(val({ sold: { ...SOLD, count: 4 } }).confidence).toBe('medium');
    const one = val({ sold: { ...SOLD, count: 1 } });
    expect(one.confidence).toBe('low');
    expect(one.note).toContain('orientacijska');
  });

  it('stara vrednost zniža zaupanje', () => {
    const v = val({ sold: { ...SOLD, count: 12 }, stale: true });
    expect(v.confidence).toBe('medium');
    expect(v.stale).toBe(true);
  });

  it('različica ni določena: premalo podatkov, razlog', () => {
    const v = val({ identified: false, notIdentifiedReason: 'oglas ne pove: language', estimate: ESTIMATE, sold: SOLD });
    expect(v).toMatchObject({ primary: null, confidence: 'insufficient', comparable: false });
    expect(v.note).toContain('language');
  });

  it('druga valuta: ni primerljivo, brez pretvorbe', () => {
    const v = val({ estimate: { ...ESTIMATE, currency: 'USD' } });
    expect(v).toMatchObject({ primary: null, comparable: false, confidence: 'insufficient' });
    expect(v.note).toContain('USD');
  });

  it('nič podatkov', () => {
    expect(val()).toMatchObject({ primary: null, confidence: 'insufficient', comparable: false });
  });
});

describe('osnova popusta in dobička', () => {
  it('popust iz ocene ali prodaj, nikoli iz zahtevanih cen', () => {
    expect(discountBase(val({ estimate: ESTIMATE }))).toEqual({ value: 12, basis: 'estimate' });
    expect(discountBase(val({ estimate: GUIDE }))).toEqual({ value: 60, basis: 'guide' });
    expect(discountBase(val({ sold: SOLD }))).toEqual({ value: 13, basis: 'sold' });
    expect(discountBase(val({ asking: ASKING }))).toBeNull();
    expect(discountBase(null)).toBeNull();
  });

  it('osnova dobička samo iz preverjenih prodaj', () => {
    expect(profitBase(val({ sold: SOLD }))).toBe(13);
    expect(profitBase(val({ sold: { ...SOLD, median: null } }))).toBe(14);
    expect(profitBase(val({ estimate: ESTIMATE }))).toBeNull();
    expect(profitBase(val({ estimate: GUIDE }))).toBeNull();
    expect(profitBase(val({ asking: ASKING }))).toBeNull();
  });
});

describe('askingStatsFor', () => {
  const mk = (id: string, amount: number, over: Partial<ComparableInput> = {}): ComparableInput => ({ id, variantKey: 'k', price: { amount, currency: 'EUR' }, listingType: 'FIXED_PRICE', ...over });

  it('potrebuje vsaj MIN_COMPARABLES drugih oglasov iste različice', () => {
    const all = [mk('a', 10), mk('b', 11), mk('c', 12)];
    expect(MIN_COMPARABLES).toBe(3);
    expect(askingStatsFor(all[0]!, all)).toBeNull(); // le dva druga
    const four = [...all, mk('d', 20)];
    expect(askingStatsFor(four[0]!, four)).toEqual({ median: 12, min: 11, count: 3, currency: 'EUR' });
  });

  it('druga različica, valuta ali dražba se ne štejejo; brez ključa ni statistike', () => {
    const self = mk('a', 10);
    const others = [mk('b', 11, { variantKey: 'x' }), mk('c', 12, { price: { amount: 12, currency: 'USD' } }), mk('d', 13, { listingType: 'AUCTION' }), mk('e', 14)];
    expect(askingStatsFor(self, [self, ...others])).toBeNull();
    expect(askingStatsFor(mk('z', 5, { variantKey: null }), [mk('z', 5, { variantKey: null })])).toBeNull();
  });
});

describe('evaluateOpportunity', () => {
  const PARAMS = { sellingFeePct: 10, riskReservePct: 5, conservativeDiscountPct: 10, buyerFeePct: 0 };
  function opp(over: Partial<OpportunityInput> = {}) {
    return evaluateOpportunity({
      price: { amount: 100, currency: 'EUR' },
      shipping: { amount: 10, currency: 'EUR' },
      shippingKnown: true,
      sellerCountry: 'DE',
      condition: 'USED',
      identified: true,
      valuation: val({ sold: { ...SOLD, average: 200, median: 200, count: 12 } }),
      params: PARAMS,
      ...over,
    });
  }

  it('preverjene prodaje + vsi vhodi: dobiček, ROI, ocena, osnova "sold"', () => {
    const o = opp();
    expect(o).toMatchObject({ acquisitionCost: 110, conservativeValue: 180, sellingFees: 18, riskReserve: 5.5, profit: 46.5, discountPct: 50, discountBasis: 'sold', profitBasis: 'sold', missing: [] });
    expect(o.score).toBeGreaterThan(0);
  });

  it('samo katalogna ocena: popust označen z osnovo, dobiček neznan z razlogom sold-prices', () => {
    const o = opp({ valuation: val({ estimate: { ...ESTIMATE, value: 200 } }) });
    expect(o).toMatchObject({ profit: null, roi: null, score: null, discountPct: 50, discountBasis: 'estimate', profitBasis: null });
    expect(o.missing).toEqual(['sold-prices']);
  });

  it('samo cenik: osnova guide', () => {
    expect(opp({ valuation: val({ estimate: { ...GUIDE, value: 200 } }) }).discountBasis).toBe('guide');
  });

  it('samo zahtevane cene: brez popusta in dobička', () => {
    const o = opp({ valuation: val({ asking: ASKING }) });
    expect(o).toMatchObject({ discountPct: null, discountBasis: null, profit: null });
    expect(o.missing).toEqual(['valuation']);
  });

  it('različica ni določena: identification v razlogih, brez popusta', () => {
    const o = opp({ identified: false, valuation: val({ identified: false, sold: SOLD }) });
    expect(o.missing[0]).toBe('identification');
    expect(o).toMatchObject({ profit: null, discountPct: null });
  });

  it('stanje neznano ali okvarjeno prepreči dobiček', () => {
    expect(opp({ condition: 'UNKNOWN' }).missing).toContain('condition');
    expect(opp({ condition: 'FOR_PARTS' }).profit).toBeNull();
    expect(opp({ condition: 'NEW' }).profit).not.toBeNull();
  });

  it('poštnina neznana ni 0; prodajalec izven EU: davki neznani', () => {
    expect(opp({ shippingKnown: false, shipping: null }).missing).toEqual(['shipping']);
    expect(opp({ sellerCountry: 'US' }).missing).toEqual(['taxes']);
  });

  it('višja rezerva za tveganje zmanjša dobiček (neocenjena draga kartica vs. nizko tveganje)', () => {
    const low = opp({ params: { ...PARAMS, riskReservePct: 5 } });
    const high = opp({ params: { ...PARAMS, riskReservePct: 15 } });
    expect(high.riskReserve!).toBeGreaterThan(low.riskReserve!);
    expect(high.profit!).toBeLessThan(low.profit!);
  });

  it('nizka cena sama ni priložnost: ocena je negativna, ko je cena nad vrednostjo', () => {
    const o = opp({ price: { amount: 300, currency: 'EUR' } });
    expect(o.discountPct).toBeLessThan(0);
    expect(o.profit!).toBeLessThan(0);
    expect(o.score).toBe(0);
  });
});

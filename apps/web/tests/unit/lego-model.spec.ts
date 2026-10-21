import { describe, expect, it } from 'vitest';
import {
  activeText,
  calculationRows,
  conditionColor,
  conditionLabel,
  kindLabel,
  missingReasons,
  priceLabel,
  profitColor,
  profitText,
  readLegoData,
  scoreColor,
  shippingText,
  sortResults,
  valueText,
  type LegoOpportunity,
  type LegoResultData,
  type LegoValuation,
} from '../../src/app/features/lego-scanner/lego.model.js';

// 018: čiste funkcije prikaza LEGO skenerja (brez TestBed, vzorec scanners-model.spec.ts). Pravilo:
// neznano je "neznano", nikoli 0; izračun je vedno označen kot ocena.

const opp = (over: Partial<LegoOpportunity> = {}): LegoOpportunity => ({
  illustrative: true,
  price: 350,
  shipping: 20,
  taxes: 0,
  buyerFees: 0,
  acquisitionCost: 370,
  conservativeValue: 495,
  sellingFees: 59.4,
  riskReserve: 18.5,
  profit: 47.1,
  roi: 0.127,
  discountPct: 36.36,
  score: 62,
  missing: [],
  ...over,
});
const val = (over: Partial<LegoValuation> = {}): LegoValuation => ({
  basis: 'sold',
  newOrUsed: 'N',
  currency: 'EUR',
  average: 550,
  median: 550,
  salesCount: 14,
  periodMonths: 6,
  confidence: 'high',
  stale: false,
  active: null,
  comparable: true,
  note: null,
  ...over,
});

describe('oznake', () => {
  it('stanje in vrsta oglasa imata slovenske oznake; neznano se vrne kot je', () => {
    expect(conditionLabel('NEW_SEALED')).toBe('Novo, zapečateno');
    expect(conditionLabel('UNKNOWN')).toBe('Stanje ni znano');
    expect(conditionLabel('X')).toBe('X');
    expect(conditionLabel(null)).toBe('');
    expect(kindLabel('EMPTY_BOX')).toBe('Prazna škatla');
    expect(kindLabel('BUNDLE')).toBe('Paket več setov');
  });

  it('barva stanja: preverjeno kompletno/zapečatano zeleno, nepreverjeno sivo, nekompletno rumeno', () => {
    expect(conditionColor('NEW_SEALED')).toBe('success');
    expect(conditionColor('USED_COMPLETE')).toBe('success');
    expect(conditionColor('USED_INCOMPLETE')).toBe('warning');
    expect(conditionColor('UNKNOWN')).toBe('medium');
  });
});

describe('cena, poštnina, vrednost, dobiček', () => {
  it('poštnina: neznana ni 0; brezplačna je izrecna', () => {
    const base = { marketplace: 'EBAY_DE' as const, itemId: '1', listingType: 'FIXED_PRICE' as const, endsAt: null, bidCount: null, images: [] };
    expect(shippingText({ ...base, shipping: null, shippingKnown: false })).toBe('poštnina ni znana');
    expect(shippingText({ ...base, shipping: { amount: 0, currency: 'EUR' }, shippingKnown: true })).toBe('brezplačna poštnina');
    expect(shippingText({ ...base, shipping: { amount: 19.9, currency: 'EUR' }, shippingKnown: true })).toBe('poštnina 19,90 €');
  });

  it('dražba: cena je trenutna ponudba, ne končna', () => {
    expect(priceLabel('AUCTION', { amount: 60, currency: 'EUR' })).toBe('60 € (trenutna ponudba)');
    expect(priceLabel('FIXED_PRICE', { amount: 350, currency: 'EUR' })).toBe('350 €');
    expect(priceLabel('FIXED_PRICE', null)).toBe('—');
  });

  it('vrednost: premalo podatkov, neprimerljivo, pa znana s številom prodaj in zaupanjem', () => {
    expect(valueText(null)).toBe('vrednost ni izračunana');
    expect(valueText(val({ confidence: 'insufficient', average: null }))).toBe('premalo podatkov');
    expect(valueText(val({ comparable: false }))).toBe('primerjava ni mogoča');
    expect(valueText(val())).toBe('550 € (14 prodaj, zaupanje visoko)');
  });

  it('dobiček: vedno označen kot ocena; neizračunan ni 0', () => {
    expect(profitText(opp())).toBe('+47,10 € · ROI 12,7 % (ocena)');
    expect(profitText(opp({ profit: -5.4, roi: -0.015 }))).toBe('-5,40 € · ROI -1,5 % (ocena)');
    expect(profitText(opp({ profit: null, roi: null }))).toBe('dobiček ni izračunan');
    expect(profitColor(opp())).toBe('success');
    expect(profitColor(opp({ profit: -1 }))).toBe('danger');
    expect(profitColor(opp({ profit: null }))).toBe('medium');
  });

  it('ocena priložnosti: barva po pragovih; brez ocene siva', () => {
    expect(scoreColor(80)).toBe('success');
    expect(scoreColor(40)).toBe('warning');
    expect(scoreColor(5)).toBe('danger');
    expect(scoreColor(null)).toBe('medium');
  });

  it('aktivne ponudbe so ločene in izrecno niso prodajne cene', () => {
    expect(activeText(val({ active: { average: 700, min: 640, count: 5 } }))).toBe('5 aktivnih ponudb · najnižja 640 € (ponudbe niso prodajne cene)');
    expect(activeText(val())).toBeNull();
    expect(activeText(val({ active: { average: null, min: null, count: 0 } }))).toBeNull();
  });
});

describe('izračun po postavkah', () => {
  it('vse postavke so prikazane; neznane so "neznano", ne 0', () => {
    const rows = calculationRows(opp());
    expect(rows.map((r) => r.label)).toEqual(['Cena oglasa', 'Poštnina', 'Davki', 'Provizija kupca', 'Skupni strošek nakupa', 'Konservativna prodajna vrednost', 'Provizije prodaje', 'Rezerva za tveganje', 'Potencialni dobiček']);
    expect(rows.find((r) => r.label === 'Potencialni dobiček')).toMatchObject({ value: '47,10 €', strong: true });
    const unknown = calculationRows(opp({ shipping: null, acquisitionCost: null, conservativeValue: null, sellingFees: null, riskReserve: null, profit: null }));
    expect(unknown.find((r) => r.label === 'Poštnina')?.value).toBe('neznano');
    expect(unknown.find((r) => r.label === 'Potencialni dobiček')?.value).toBe('neznano');
  });

  it('razlogi za manjkajoč dobiček so slovenski', () => {
    expect(missingReasons(opp({ missing: ['shipping', 'valuation', 'condition', 'taxes', 'identification', 'drugo'] }))).toEqual([
      'poštnina ni znana',
      'tržna vrednost ni na voljo ali ni primerljiva',
      'stanje ali kompletnost ni preverjena',
      'davki niso znani (prodajalec izven EU ali neznana država)',
      'set ni zanesljivo prepoznan',
      'drugo',
    ]);
  });
});

describe('branje in razvrščanje', () => {
  const data = (score: number | null, profit: number | null): LegoResultData =>
    ({
      lego: { condition: 'NEW_SEALED' },
      listing: { marketplace: 'EBAY_DE', itemId: '1', listingType: 'FIXED_PRICE', endsAt: null, bidCount: null, shipping: null, shippingKnown: false, images: [] },
      identification: { kind: 'SET', confidence: 'high', reason: '', needsReview: false, catalog: null },
      valuation: null,
      opportunity: opp({ score, profit }),
      alerts: { profitNotified: false, auctionEndingNotified: false },
    }) as LegoResultData;
  const row = (id: string, d: unknown, price: number | null, seen: string) => ({ id, data: d, price: price === null ? null : { amount: price, currency: 'EUR' }, firstSeenAt: seen });

  it('readLegoData: samo veljavna oblika; drugo null', () => {
    expect(readLegoData(null)).toBeNull();
    expect(readLegoData({ index: 1 })).toBeNull();
    expect(readLegoData(data(1, 1))).not.toBeNull();
  });

  it('razvrstitev: ocena/dobiček padajoče, cena naraščajoče, najnovejše; neznane vrednosti vedno na koncu', () => {
    const a = row('a', data(10, 5), 300, '2026-10-01T00:00:00Z');
    const b = row('b', data(80, 90), 100, '2026-10-03T00:00:00Z');
    const c = row('c', data(null, null), null, '2026-10-02T00:00:00Z');
    const d = row('d', { nekaj: 1 }, 50, '2026-10-04T00:00:00Z');
    expect(sortResults([a, c, b, d], 'score').map((r) => r.id)).toEqual(['b', 'a', 'c', 'd']);
    expect(sortResults([a, c, b, d], 'profit').map((r) => r.id)).toEqual(['b', 'a', 'c', 'd']);
    expect(sortResults([a, c, b, d], 'price').map((r) => r.id)).toEqual(['d', 'b', 'a', 'c']);
    expect(sortResults([a, c, b, d], 'recent').map((r) => r.id)).toEqual(['d', 'b', 'c', 'a']);
  });
});

import { describe, expect, it } from 'vitest';
import {
  ambiguityTexts,
  askingText,
  buildCategoryConfig,
  calculationRows,
  categoryLabel,
  conditionColor,
  conditionLabel,
  discountText,
  getByPath,
  hasCategoryFilters,
  isDefaultValue,
  kindLabel,
  missingReasons,
  priceLabel,
  profitColor,
  profitText,
  readCollectiblesData,
  scoreColor,
  shippingText,
  sortResults,
  valueText,
  variantText,
  type CollectibleAttributes,
  type FieldDescriptor,
  type Identification,
  type Opportunity,
  type Valuation,
} from '../../src/app/features/collectibles-scanner/collectibles.model.js';

// 019: čiste funkcije prikaza zbirateljskega skenerja (brez TestBed, vzorec lego-model.spec.ts). Pravila:
// neznano je "neznano", nikoli 0; vrste cen so vedno označene; dobiček je ocena in je brez prodaj neznan.

const opp = (over: Partial<Opportunity> = {}): Opportunity => ({
  illustrative: true,
  price: 9,
  shipping: 3,
  taxes: 0,
  buyerFees: 0,
  acquisitionCost: 12,
  conservativeValue: null,
  sellingFees: null,
  riskReserve: null,
  profit: null,
  roi: null,
  discountPct: null,
  discountBasis: null,
  profitBasis: null,
  score: null,
  missing: [],
  ...over,
});

const val = (over: Partial<Valuation> = {}): Valuation => ({ asking: null, estimate: null, sold: null, primary: null, confidence: 'insufficient', comparable: false, stale: false, note: null, ...over });
const ESTIMATE = { value: 12, low: 8, trend: 12, source: 'Cardmarket (TCGdex)', updatedAt: null, currency: 'EUR', basis: 'estimate' as const };

describe('vrednost z oznako vrste', () => {
  it('brez vrednosti, premalo podatkov, nepoprimerljivo', () => {
    expect(valueText(null)).toBe('vrednost ni izračunana');
    expect(valueText(val())).toBe('premalo podatkov');
    expect(valueText(val({ primary: 'estimate', confidence: 'low', comparable: false, estimate: ESTIMATE }))).toBe('primerjava ni mogoča');
  });
  it('ocena je vedno označena kot ocena, nikoli golo število', () => {
    expect(valueText(val({ primary: 'estimate', confidence: 'low', comparable: true, estimate: ESTIMATE }))).toBe('12 € (katalogna ocena)');
    expect(valueText(val({ primary: 'guide', confidence: 'low', comparable: true, estimate: { ...ESTIMATE, basis: 'guide' } }))).toContain('ocena iz cenika');
  });
  it('preverjene prodaje: število prodaj in zaupanje', () => {
    const v = val({ primary: 'sold', confidence: 'medium', comparable: true, sold: { average: 14, median: 13, count: 8, periodMonths: 6, source: 'x', currency: 'EUR' } });
    expect(valueText(v)).toBe('13 € (preverjene prodaje: 8, zaupanje srednje)');
  });
  it('zahtevane cene so ločene in označene kot neprodajne', () => {
    expect(askingText(null)).toBeNull();
    expect(askingText(val({ asking: { median: 11, min: 10, count: 3, currency: 'EUR' } }))).toBe('3 primerljivih oglasov · mediana 11 € · najnižja 10 € (zahtevane cene niso prodajne cene)');
  });
});

describe('popust in dobiček', () => {
  it('popust z osnovo; neznan je null', () => {
    expect(discountText(opp())).toBeNull();
    expect(discountText(opp({ discountPct: 25, discountBasis: 'estimate' }))).toBe('25,0 % pod vrednostjo (katalogna ocena)');
    expect(discountText(opp({ discountPct: -12.5, discountBasis: 'guide' }))).toBe('12,5 % nad vrednostjo (ocena iz cenika)');
  });
  it('dobiček brez prodaj je neznan; z njimi je ocena', () => {
    expect(profitText(opp())).toBe('dobiček ni izračunan');
    expect(profitText(opp({ profit: 9.23, roi: 0.215, profitBasis: 'sold' }))).toBe('+9,23 € · ROI 21,5 % (ocena iz preverjenih prodaj)');
    expect(profitText(opp({ profit: -5.69, profitBasis: 'sold' }))).toBe('-5,69 € (ocena iz preverjenih prodaj)');
  });
  it('barve', () => {
    expect(profitColor(opp())).toBe('medium');
    expect(profitColor(opp({ profit: 5 }))).toBe('success');
    expect(profitColor(opp({ profit: -5 }))).toBe('danger');
    expect(scoreColor(null)).toBe('medium');
    expect(scoreColor(75)).toBe('success');
    expect(scoreColor(35)).toBe('warning');
    expect(scoreColor(5)).toBe('danger');
  });
  it('razlogi, zakaj dobiček ni izračunan, so slovenski; neznani ostanejo dobesedni', () => {
    expect(missingReasons(opp({ missing: ['condition', 'sold-prices', 'xyz'] }))).toEqual(['stanje ni znano ali je predmet okvarjen', 'ni preverjenih prodaj (ocena iz kataloga ali cenika dobička ne da)', 'xyz']);
  });
  it('izračun po postavkah: neznano ni 0', () => {
    const rows = calculationRows(opp());
    expect(rows.find((r) => r.label === 'Konservativna prodajna vrednost')?.value).toBe('neznano');
    expect(rows.find((r) => r.label === 'Potencialni dobiček')?.value).toBe('neznano');
    expect(rows.find((r) => r.label === 'Skupni strošek nakupa')).toMatchObject({ strong: true });
  });
});

describe('besedila oglasa', () => {
  it('poštnina neznana ni 0', () => {
    const base = { marketplace: 'EBAY_DE' as const, itemId: 'x', listingType: 'FIXED_PRICE' as const, endsAt: null, bidCount: null, images: [] };
    expect(shippingText({ ...base, shipping: null, shippingKnown: false })).toBe('poštnina ni znana');
    expect(shippingText({ ...base, shipping: { amount: 0, currency: 'EUR' }, shippingKnown: true })).toBe('brezplačna poštnina');
    expect(shippingText({ ...base, shipping: { amount: 3, currency: 'EUR' }, shippingKnown: true })).toBe('poštnina 3 €');
  });
  it('dražba je trenutna ponudba', () => {
    expect(priceLabel('AUCTION', { amount: 6, currency: 'EUR' })).toBe('6 € (trenutna ponudba)');
    expect(priceLabel('FIXED_PRICE', { amount: 6, currency: 'EUR' })).not.toContain('trenutna');
    expect(priceLabel('FIXED_PRICE', null)).toBe('—');
  });
  it('oznake', () => {
    expect(categoryLabel('trading-cards')).toBe('Kartice');
    expect(categoryLabel(null)).toBe('');
    expect(conditionLabel(undefined)).toBe('Stanje ni znano');
    expect(conditionColor('NEW')).toBe('success');
    expect(conditionColor('FOR_PARTS')).toBe('warning');
    expect(conditionColor('UNKNOWN')).toBe('medium');
    expect(kindLabel('PROXY')).toBe('Proxy / reprodukcija');
    expect(kindLabel('NOVO')).toBe('NOVO');
  });
  it('dvoumnosti', () => {
    const id = { ambiguities: ['language', 'edition', 'neznano'] } as Identification;
    expect(ambiguityTexts(id)).toEqual(['jezik ni naveden', 'izdaja ni navedena', 'neznano']);
  });
});

describe('različica predmeta', () => {
  const card: CollectibleAttributes = { category: 'trading-cards', language: 'en', edition: 'first', gradingCompany: 'PSA', grade: '9', card: { game: 'pokemon', setName: 'Base Set', cardNumber: '4', finish: 'holo', graded: true, sealed: null } };
  it('kartica: set, jezik, izdaja, površina, ocena; kar ni znano, je izpuščeno', () => {
    expect(variantText(card)).toBe('Base Set #4 · angleščina · prva izdaja · holo · PSA 9');
    expect(variantText({ category: 'trading-cards', card: { game: 'pokemon', graded: null, sealed: null } })).toBe('');
    expect(variantText({ category: 'trading-cards', card: { game: 'pokemon', graded: false, sealed: null } })).toBe('neocenjena');
  });
  it('retro: platforma, regija, popolnost, delovanje', () => {
    expect(variantText({ category: 'retro-gaming', retro: { platform: 'gb', region: 'PAL', completeness: 'cib', working: 'working', reproductionSuspected: false } })).toBe('GB · PAL · CIB (komplet) · delujoče');
    expect(variantText({ category: 'retro-gaming', retro: { reproductionSuspected: null } })).toBe('');
  });
});

describe('razvrščanje', () => {
  const r = (id: string, score: number | null, discount: number | null, price: number | null, seen: string) => ({
    id,
    price: price === null ? null : { amount: price, currency: 'EUR' },
    firstSeenAt: seen,
    data: { collectible: { category: 'trading-cards' }, listing: {}, identification: {}, opportunity: { score, discountPct: discount, profit: null } },
  });
  const rows = [r('a', null, 10, 30, '2026-10-01T00:00:00Z'), r('b', 80, null, 10, '2026-10-02T00:00:00Z'), r('c', 40, 50, null, '2026-10-03T00:00:00Z')];

  it('ocena in popust: padajoče, neznano na koncu', () => {
    expect(sortResults(rows, 'score').map((x) => x.id)).toEqual(['b', 'c', 'a']);
    expect(sortResults(rows, 'discount').map((x) => x.id)).toEqual(['c', 'a', 'b']);
  });
  it('cena: naraščajoče, neznana na koncu; najnovejše', () => {
    expect(sortResults(rows, 'price').map((x) => x.id)).toEqual(['b', 'a', 'c']);
    expect(sortResults(rows, 'recent').map((x) => x.id)).toEqual(['c', 'b', 'a']);
  });
});

describe('readCollectiblesData', () => {
  it('samo zbirateljska oblika', () => {
    expect(readCollectiblesData(null)).toBeNull();
    expect(readCollectiblesData({ lego: {} })).toBeNull();
    expect(readCollectiblesData({ collectible: {}, listing: {}, identification: {}, opportunity: {} })).not.toBeNull();
  });
});

describe('obrazec iz opisa kategorije', () => {
  const fields: FieldDescriptor[] = [
    { key: 'cards.setName', label: 'Set', kind: 'text' },
    { key: 'cards.language', label: 'Jezik', kind: 'select', options: [{ value: 'any', label: 'Vsi' }, { value: 'en', label: 'EN' }] },
    { key: 'cards.sealedOnly', label: 'Zapečateno', kind: 'boolean' },
    { key: 'cards.grade', label: 'Ocena', kind: 'number' },
  ];

  it('privzete vrednosti niso kriterij', () => {
    for (const v of [undefined, null, '', 'any', false, []]) expect(isDefaultValue(v)).toBe(true);
    for (const v of ['en', true, 0, 'x']) expect(isDefaultValue(v)).toBe(false);
  });

  it('podobjekt kategorije vsebuje samo nastavljena polja; številke so števila', () => {
    expect(buildCategoryConfig(fields, { 'cards.setName': 'Base Set', 'cards.language': 'any', 'cards.sealedOnly': false, 'cards.grade': '9' })).toEqual({ cards: { setName: 'Base Set', grade: 9 } });
    expect(buildCategoryConfig(fields, {})).toEqual({});
  });

  it('filtri kategorije: vsaj eno ne-privzeto polje', () => {
    expect(hasCategoryFilters(fields, {})).toBe(false);
    expect(hasCategoryFilters(fields, { 'cards.language': 'any' })).toBe(false);
    expect(hasCategoryFilters(fields, { 'cards.language': 'en' })).toBe(true);
  });

  it('getByPath bere gnezdeno nastavitev', () => {
    expect(getByPath({ cards: { grade: '9' } }, 'cards.grade')).toBe('9');
    expect(getByPath({ cards: null }, 'cards.grade')).toBeUndefined();
    expect(getByPath(null, 'cards.grade')).toBeUndefined();
  });
});

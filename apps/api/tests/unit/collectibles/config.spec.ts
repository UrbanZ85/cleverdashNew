import { describe, expect, it } from 'vitest';
import { describeCategories, getCategory, listCategories } from '../../../src/modules/collectibles-scanner/categories/registry.js';
import { allowedMarketplaces, collectiblesConfigSchema, describeCollectiblesConfig, validateCollectiblesConfig } from '../../../src/modules/collectibles-scanner/config.js';
import { COLLECTIBLE_CATEGORIES } from '../../../src/modules/collectibles-scanner/domain/types.js';
import { conditionFromListing, ebayConditionIds } from '../../../src/modules/collectibles-scanner/domain/condition.js';

// 019 (FR-001 do FR-006): konfiguracija po kategorijah.

const ENV = { EBAY_MARKETPLACES: 'EBAY_DE,EBAY_IT' };
const parse = (c: unknown) => collectiblesConfigSchema.parse(c);

describe('collectiblesConfigSchema', () => {
  it('kartice: privzetki in normalizacija', () => {
    const c = parse({ category: 'trading-cards', keywords: '  Charizard ', cards: { cardNumber: ' 004/102 ', grade: '9,5', gradingCompany: 'PSA' }, sellerCountries: ['de'], currency: 'eur' });
    expect(c).toMatchObject({ category: 'trading-cards', keywords: 'Charizard', currency: 'EUR', sellerCountries: ['DE'], marketplaces: ['EBAY_DE'], listingTypes: ['FIXED_PRICE', 'AUCTION'], auctionEndingHours: 6 });
    if (c.category !== 'trading-cards') throw new Error('kategorija');
    expect(c.cards).toMatchObject({ game: 'pokemon', cardNumber: '4', grade: '9.5', gradingCompany: 'PSA', language: 'any', edition: 'any', gradeStatus: 'any', sealedOnly: false });
  });

  it('retro: privzetki', () => {
    const c = parse({ category: 'retro-gaming', retro: { platform: 'gb', region: 'PAL' } });
    if (c.category !== 'retro-gaming') throw new Error('kategorija');
    expect(c.retro).toMatchObject({ platform: 'gb', region: 'PAL', completeness: 'any', working: 'any', kind: 'any' });
  });

  it('polja druge kategorije se odstranijo', () => {
    const c = parse({ category: 'retro-gaming', retro: {}, cards: { language: 'ja' } });
    expect(c).not.toHaveProperty('cards');
  });

  it('neznana kategorija ali brez kategorije: napaka', () => {
    expect(collectiblesConfigSchema.safeParse({ category: 'watches' }).success).toBe(false);
    expect(collectiblesConfigSchema.safeParse({ keywords: 'x' }).success).toBe(false);
  });

  it('neveljavne vrednosti', () => {
    expect(collectiblesConfigSchema.safeParse({ category: 'trading-cards', cards: { cardNumber: 'abc' } }).success).toBe(false);
    expect(collectiblesConfigSchema.safeParse({ category: 'trading-cards', cards: { grade: '11' } }).success).toBe(false);
    expect(collectiblesConfigSchema.safeParse({ category: 'retro-gaming', retro: { platform: 'atari' } }).success).toBe(false);
    expect(collectiblesConfigSchema.safeParse({ category: 'trading-cards', minDiscountPct: 120 }).success).toBe(false);
    expect(collectiblesConfigSchema.safeParse({ category: 'trading-cards', marketplaces: ['EBAY_US'] }).success).toBe(false);
    expect(collectiblesConfigSchema.safeParse({ category: 'trading-cards', listingTypes: [] }).success).toBe(false);
  });
});

describe('validateCollectiblesConfig', () => {
  const v = (c: unknown, env = ENV) => validateCollectiblesConfig(parse(c), env);

  it('brez kriterija je napaka; ključna beseda, filter ali najvišja cena zadošča', () => {
    expect(v({ category: 'trading-cards' })).toContain('vsaj eno');
    expect(v({ category: 'trading-cards', keywords: 'Charizard' })).toBeNull();
    expect(v({ category: 'trading-cards', cards: { cardNumber: '4' } })).toBeNull();
    expect(v({ category: 'retro-gaming', maxPrice: 80 })).toBeNull();
    expect(v({ category: 'retro-gaming', retro: { platform: 'gb' } })).toBeNull();
  });

  it('cena min > max', () => {
    expect(v({ category: 'trading-cards', keywords: 'x', minPrice: 50, maxPrice: 10 })).toContain('Najvišja cena');
  });

  it('tržnica, ki je namestitev ne dovoli', () => {
    expect(v({ category: 'trading-cards', keywords: 'x', marketplaces: ['EBAY_FR'] })).toContain('EBAY_FR');
    expect(v({ category: 'trading-cards', keywords: 'x', marketplaces: ['EBAY_IT'] })).toBeNull();
  });

  it('ključna beseda je hkrati izključena', () => {
    expect(v({ category: 'trading-cards', keywords: 'Charizard proxy', excludedKeywords: ['proxy'] })).toContain('izključenimi');
  });

  it('prag dobička ali prag popusta, ne oba', () => {
    expect(v({ category: 'trading-cards', keywords: 'x', notifyMinProfit: 10, notifyMinDiscountPct: 20 })).toContain('ne obeh');
    expect(v({ category: 'trading-cards', keywords: 'x', notifyMinDiscountPct: 20 })).toBeNull();
  });

  it('kartice: neskladni filtri', () => {
    expect(v({ category: 'trading-cards', cards: { gradeStatus: 'raw', gradingCompany: 'PSA' } })).toContain('Neocenjena');
    expect(v({ category: 'trading-cards', cards: { grade: '9' } })).toContain('ocenjevalca');
    expect(v({ category: 'trading-cards', cards: { sealedOnly: true, cardNumber: '4' } })).toContain('Zapečateni');
    expect(v({ category: 'trading-cards', cards: { gradeStatus: 'graded', gradingCompany: 'PSA', grade: '9' } })).toBeNull();
  });

  it('retro: neskladni filtri', () => {
    expect(v({ category: 'retro-gaming', retro: { kind: 'game', consoleModel: 'DMG' } })).toContain('igre');
    expect(v({ category: 'retro-gaming', retro: { kind: 'accessory' } })).toContain('Dodatki');
    expect(v({ category: 'retro-gaming', retro: { kind: 'game', working: 'working' } })).toContain('konzole');
  });
});

describe('register kategorij', () => {
  it('vsaka registrirana kategorija ima obrazec in shemo', () => {
    expect(listCategories().map((c) => c.id).sort()).toEqual([...COLLECTIBLE_CATEGORIES].sort());
    for (const d of describeCategories()) {
      expect(d.label).not.toBe('');
      expect(d.fields.length).toBeGreaterThan(3);
      for (const f of d.fields) {
        expect(f.key.startsWith(getCategory(d.category).filterKey + '.')).toBe(true);
        if (f.kind === 'select') expect(f.options?.length).toBeGreaterThan(1);
      }
    }
  });

  it('opis ne vsebuje skrivnosti ali Zod objektov (je JSON)', () => {
    expect(() => JSON.stringify(describeCategories())).not.toThrow();
  });

  it('besedilo iskanja po kategoriji', () => {
    expect(getCategory('trading-cards').searchText(parse({ category: 'trading-cards', keywords: 'Charizard', cards: { setName: 'Base Set', gradingCompany: 'PSA', grade: '9' } }))).toBe('pokemon Charizard Base Set PSA 9');
    expect(getCategory('retro-gaming').searchText(parse({ category: 'retro-gaming', keywords: 'Mario', retro: { platform: 'gb' } }))).toBe('Game Boy Mario');
  });
});

describe('describeCollectiblesConfig', () => {
  it('kratek opis', () => {
    expect(describeCollectiblesConfig(parse({ category: 'trading-cards', keywords: 'Charizard', maxPrice: 100, cards: { setName: 'Base Set' } }))).toBe('Pokémon · Base Set · "Charizard" · do 100 EUR · EBAY_DE');
  });
});

describe('allowedMarketplaces', () => {
  it('presek z znanimi tržnicami', () => {
    expect(allowedMarketplaces({ EBAY_MARKETPLACES: 'ebay_de, EBAY_US,EBAY_ES' })).toEqual(['EBAY_DE', 'EBAY_ES']);
  });
});

describe('stanje', () => {
  it('kartice: samo nedvoumno novo; vse drugo neznano', () => {
    expect(conditionFromListing('trading-cards', '1000')).toBe('NEW');
    expect(conditionFromListing('trading-cards', '2750')).toBe('UNKNOWN');
    expect(conditionFromListing('trading-cards', '4000')).toBe('UNKNOWN');
    expect(conditionFromListing('trading-cards', null)).toBe('UNKNOWN');
  });
  it('retro: razvrstitev', () => {
    expect(conditionFromListing('retro-gaming', '1500')).toBe('NEW');
    expect(conditionFromListing('retro-gaming', '2750')).toBe('LIKE_NEW');
    expect(conditionFromListing('retro-gaming', '5000')).toBe('USED');
    expect(conditionFromListing('retro-gaming', '7000')).toBe('FOR_PARTS');
    expect(conditionFromListing('retro-gaming', '9999')).toBe('UNKNOWN');
  });
  it('ebay conditionIds', () => {
    expect(ebayConditionIds([])).toBeNull();
    expect(ebayConditionIds(['UNKNOWN', 'USED'])).toBeNull();
    expect(ebayConditionIds(['NEW'])).toEqual(['1000', '1500']);
    expect(ebayConditionIds(['USED', 'FOR_PARTS'])).toEqual(['3000', '4000', '5000', '6000', '7000']);
  });
});

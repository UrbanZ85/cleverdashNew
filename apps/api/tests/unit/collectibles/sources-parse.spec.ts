import { describe, expect, it } from 'vitest';
import { parseCardDetail, parseCardList, parsePricing } from '../../../src/modules/collectibles-scanner/sources/tcgdex.js';
import { parsePrices, parseProducts, pricechartingPrices } from '../../../src/modules/collectibles-scanner/sources/pricecharting.js';
import { tcgdexCatalog } from '../../../src/modules/collectibles-scanner/sources/tcgdex.js';

// 019 (research §3, §4): čista razčlenitev odgovorov virov — tolerantna, manjkajoče = null.

describe('TCGdex', () => {
  const DETAIL = {
    id: 'base1-4',
    localId: '4',
    name: 'Charizard',
    rarity: 'Rare',
    image: 'https://assets.tcgdex.net/en/base/base1/4',
    set: { id: 'base1', name: 'Base Set', cardCount: { official: 102, total: 102 } },
    variants: { firstEdition: true, holo: true, normal: false, reverse: false, wPromo: false },
    pricing: { cardmarket: { updated: '2026-10-21T13:13:25.208Z', unit: 'EUR', idProduct: 273699, avg: 458.1, low: 95, trend: 252.57, avg1: 139.99, avg7: 267.52, avg30: 401.22, 'trend-holo': 123.63 }, tcgplayer: null },
  };

  it('seznam: osnovni zapisi, slika dobi pripono, neveljavni zapisi izpuščeni', () => {
    const list = parseCardList([{ id: 'base1-4', localId: '4', name: 'Charizard', image: 'https://assets.tcgdex.net/en/base/base1/4' }, { id: 'x' }, { id: 'y', localId: '1', name: 'Pika' }], 'en');
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ id: 'base1-4', language: 'en', imageUrl: 'https://assets.tcgdex.net/en/base/base1/4/low.webp' });
    expect(list[1]!.imageUrl).toBeNull();
    expect(parseCardList({ not: 'array' }, 'en')).toEqual([]);
  });

  it('podrobnosti: set, različice, cene kot ocene', () => {
    const card = parseCardDetail(DETAIL, 'en')!;
    expect(card).toMatchObject({ id: 'base1-4', setName: 'Base Set', setOfficialCount: 102, rarity: 'Rare', variants: { firstEdition: true, holo: true, normal: false, reverse: false } });
    expect(card.pricing).toMatchObject({ source: 'cardmarket', currency: 'EUR', trend: 252.57, trendHolo: 123.63, updatedAt: '2026-10-21T13:13:25.208Z' });
  });

  it('manjkajoče ostane null (nič se ne domneva)', () => {
    const card = parseCardDetail({ id: 'a-1', localId: '1', name: 'X' }, 'ja')!;
    expect(card).toMatchObject({ language: 'ja', setName: null, setOfficialCount: null, rarity: null, variants: null, pricing: null });
    expect(parseCardDetail({ id: 'a-1' }, 'en')).toBeNull();
    expect(parseCardDetail(null, 'en')).toBeNull();
  });

  it('pricing: brez cardmarket ali valute je null', () => {
    expect(parsePricing({ tcgplayer: {} })).toBeNull();
    expect(parsePricing({ cardmarket: { avg: 1 } })).toBeNull();
    expect(parsePricing({ cardmarket: { unit: 'eur', trend: 2 } })).toMatchObject({ currency: 'EUR', trend: 2, avg: null });
  });

  it('vir ne potrebuje ključa', () => {
    expect(tcgdexCatalog.disabledReason({} as never)).toBeNull();
  });
});

describe('PriceCharting', () => {
  it('izdelki: regija in platforma iz imena konzole', () => {
    const products = parseProducts({
      status: 'success',
      products: [
        { id: '1', 'product-name': 'Super Mario Land', 'console-name': 'PAL GameBoy' },
        { id: 2, 'product-name': 'Super Mario Land', 'console-name': 'GameBoy' },
        { id: '3', 'product-name': 'Zelda', 'console-name': 'JP Super Famicom' },
        { id: '4', 'product-name': 'Neznano', 'console-name': 'Atari 2600' },
        { id: '5' },
      ],
    });
    expect(products.map((p) => [p.id, p.platform, p.region])).toEqual([
      ['1', 'gb', 'PAL'],
      ['2', 'gb', 'NTSC-U'],
      ['3', 'snes', 'NTSC-J'],
      ['4', null, 'NTSC-U'],
    ]);
    expect(parseProducts(null)).toEqual([]);
  });

  it('cene: centi → USD, cenik (guide), manjkajoče null', () => {
    const p = parsePrices({ 'loose-price': 1450, 'cib-price': '7000', 'new-price': null })!;
    expect(p).toMatchObject({ currency: 'USD', basis: 'guide', loose: { value: 14.5, count: null }, cib: { value: 70, count: null }, sealed: null });
    expect(parsePrices({})).toBeNull();
    expect(parsePrices(null)).toBeNull();
  });

  it('vir je vklopljen samo s ključem', () => {
    expect(pricechartingPrices.disabledReason({ PRICECHARTING_API_KEY: '' } as never)).toContain('PRICECHARTING_API_KEY');
    expect(pricechartingPrices.disabledReason({ PRICECHARTING_API_KEY: 'k' } as never)).toBeNull();
  });
});

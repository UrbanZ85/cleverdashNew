import { describe, expect, it } from 'vitest';
import { buildEbaySearchUrl, hasEbayCredentials, parseEbayItems, type EbayQuery } from '../../../src/platform/ebay/client.js';

// 019 (research §1): skupni eBay odjemalec — gradnja URL-ja iskanja in razčlenitev; brez omrežja.

const ENV = { EBAY_API_URL: 'https://api.ebay.com' };
const QUERY: EbayQuery = {
  marketplace: 'EBAY_DE',
  q: 'Charizard 4/102',
  currency: 'EUR',
  conditionIds: null,
  listingTypes: ['FIXED_PRICE'],
  sellerCountries: [],
  deliveryCountry: 'SI',
  maxPages: 1,
};

function filterOf(url: string): string {
  return decodeURIComponent(new URL(url).searchParams.get('filter') ?? '');
}

describe('buildEbaySearchUrl', () => {
  it('brez kategorije ne pošlje category_ids; s kategorijo jo pošlje', () => {
    expect(buildEbaySearchUrl(ENV, QUERY, 0)).not.toContain('category_ids');
    expect(buildEbaySearchUrl(ENV, { ...QUERY, categoryId: '19006' }, 0)).toContain('category_ids=19006');
  });

  it('filtri: cena z valuto, stanja, dražba izrecno, država prodajalca (ena), dostava', () => {
    const url = buildEbaySearchUrl(ENV, { ...QUERY, minPrice: 10, maxPrice: 100, conditionIds: ['1000', '3000'], listingTypes: ['FIXED_PRICE', 'AUCTION'], sellerCountries: ['DE'] }, 50);
    expect(filterOf(url)).toBe('price:[10..100],priceCurrency:EUR,conditionIds:{1000|3000},buyingOptions:{FIXED_PRICE|AUCTION},itemLocationCountry:DE,deliveryCountry:SI');
    expect(new URL(url).searchParams.get('offset')).toBe('50');
    expect(new URL(url).searchParams.get('q')).toBe('Charizard 4/102');
  });

  it('več držav prodajalca ni v filtru (filtrira se po razčlenitvi); prazen seznam vrst = obe', () => {
    const f = filterOf(buildEbaySearchUrl(ENV, { ...QUERY, listingTypes: [], sellerCountries: ['DE', 'IT'] }, 0));
    expect(f).not.toContain('itemLocationCountry');
    expect(f).toContain('buyingOptions:{FIXED_PRICE|AUCTION}');
  });

  it('skrivnosti niso v URL-ju', () => {
    expect(buildEbaySearchUrl(ENV, QUERY, 0)).not.toMatch(/secret|token|bearer/i);
  });
});

describe('parseEbayItems', () => {
  const body = {
    total: 3,
    next: 'https://api.ebay.com/next',
    itemSummaries: [
      {
        itemId: 'v1|1|0',
        title: '  Pokemon Charizard PSA 9  ',
        price: { value: '80.50', currency: 'eur' },
        buyingOptions: ['FIXED_PRICE'],
        condition: 'Graded',
        conditionId: '2750',
        itemWebUrl: 'https://www.ebay.de/itm/1',
        itemLocation: { country: 'de' },
        shippingOptions: [
          { shippingCostType: 'CALCULATED' },
          { shippingCostType: 'FIXED', shippingCost: { value: '5.00', currency: 'EUR' } },
        ],
        image: { imageUrl: 'https://i.ebayimg.com/a.jpg' },
        additionalImages: [{ imageUrl: 'http://insecure/x.jpg' }, { imageUrl: 'https://i.ebayimg.com/b.jpg' }],
      },
      {
        itemId: 'v1|2|0',
        title: 'Auction',
        price: { value: '1', currency: 'EUR' },
        currentBidPrice: { value: '42.00', currency: 'EUR' },
        buyingOptions: ['AUCTION'],
        bidCount: 4,
        itemEndDate: '2026-10-25T12:00:00.000Z',
        itemWebUrl: 'https://www.ebay.de/itm/2',
        shippingOptions: [{ shippingCostType: 'CALCULATED' }],
      },
      { itemId: 'v1|3|0', title: 'Brez cene', buyingOptions: ['FIXED_PRICE'], itemWebUrl: 'https://www.ebay.de/itm/3' },
      { itemId: 'v1|4|0', title: 'Neveljaven URL', price: { value: '1', currency: 'EUR' }, itemWebUrl: 'http://www.ebay.de/itm/4' },
    ],
  };

  it('normalizira fiksni oglas: valuta, država, poštnina samo FIXED, samo https slike', () => {
    const { listings, total, hasMore } = parseEbayItems(body, 'EBAY_DE');
    expect(total).toBe(3);
    expect(hasMore).toBe(true);
    expect(listings).toHaveLength(2);
    expect(listings[0]).toMatchObject({
      marketplace: 'EBAY_DE',
      title: 'Pokemon Charizard PSA 9',
      price: { amount: 80.5, currency: 'EUR' },
      sellerCountry: 'DE',
      shipping: { amount: 5, currency: 'EUR' },
      shippingKnown: true,
      conditionId: '2750',
      images: ['https://i.ebayimg.com/a.jpg', 'https://i.ebayimg.com/b.jpg'],
    });
  });

  it('dražba: cena je zadnja ponudba, poštnina CALCULATED je neznana (ne 0), konec in ponudbe', () => {
    const auction = parseEbayItems(body, 'EBAY_DE').listings[1]!;
    expect(auction).toMatchObject({ listingType: 'AUCTION', price: { amount: 42, currency: 'EUR' }, bidCount: 4, shipping: null, shippingKnown: false });
    expect(auction.endsAt?.toISOString()).toBe('2026-10-25T12:00:00.000Z');
  });

  it('neveljavno telo: prazen izid', () => {
    expect(parseEbayItems(null, 'EBAY_DE')).toEqual({ listings: [], total: null, hasMore: false });
    expect(parseEbayItems({ itemSummaries: 'x' }, 'EBAY_DE').listings).toEqual([]);
  });
});

describe('hasEbayCredentials', () => {
  it('potrebuje oba ključa', () => {
    expect(hasEbayCredentials({ EBAY_CLIENT_ID: 'a', EBAY_CLIENT_SECRET: 'b' })).toBe(true);
    expect(hasEbayCredentials({ EBAY_CLIENT_ID: 'a', EBAY_CLIENT_SECRET: '' })).toBe(false);
    expect(hasEbayCredentials({})).toBe(false);
  });
});

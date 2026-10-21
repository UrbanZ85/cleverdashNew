import { describe, expect, it } from 'vitest';
import { oauthBaseString, parsePriceGuide, percentEncode, signOAuth1Get } from '../../../src/modules/lego-scanner/sources/bricklink.js';
import { buildSearchUrl, parseEbayItems } from '../../../src/modules/lego-scanner/sources/ebay.js';
import { parseSet, parseSetList, parseThemes, resolveTheme } from '../../../src/modules/lego-scanner/sources/rebrickable.js';
import { ebayConditionIds, legoConfigSchema, validateLegoConfig } from '../../../src/modules/lego-scanner/config.js';

// 018: čista razčlenitev odgovorov virov z mock odgovori (brez omrežja). Oblike so iz dokumentacije
// virov; razčlenitev je tolerantna — kar manjka, je null, nikoli izmišljeno.

describe('Rebrickable', () => {
  const themes = parseThemes({ results: [{ id: 1, parent_id: null, name: 'Star Wars' }, { id: 158, parent_id: 1, name: 'Ultimate Collector Series' }, { id: 9, parent_id: null, name: 'Technic' }] });

  it('set: številka normalizirana, polja iz kataloga, https slike; tema in podtema iz verige', () => {
    const s = parseSet({ set_num: '75192-1', name: 'Millennium Falcon', year: 2017, theme_id: 158, num_parts: 7541, set_img_url: 'https://cdn.rebrickable.com/a.jpg', set_url: 'https://rebrickable.com/sets/75192-1/' }, themes);
    expect(s).toMatchObject({ setNumber: '75192-1', name: 'Millennium Falcon', year: 2017, pieces: 7541, theme: 'Star Wars', subtheme: 'Ultimate Collector Series', imageUrl: 'https://cdn.rebrickable.com/a.jpg' });
  });

  it('manjkajoča/napačna polja so null; http slika in neveljavna številka se zavržeta', () => {
    expect(parseSet({ set_num: '75192-1', name: 'X', set_img_url: 'http://insecure/a.jpg', year: 'dvatisoč' }, themes)).toMatchObject({ year: null, pieces: null, imageUrl: null, theme: null });
    expect(parseSet({ set_num: 'fig-001', name: 'Figura' }, themes)).toBeNull();
    expect(parseSet({ set_num: '75192-1' }, themes)).toBeNull();
    expect(parseSet(null, themes)).toBeNull();
    expect(parseSetList({ results: 'ni seznam' })).toEqual([]);
  });

  it('seznam: neveljavne vrstice se preskočijo; teme brez razrešitve → tema null', () => {
    const list = parseSetList({ count: 2, results: [{ set_num: '42115-1', name: 'Lamborghini', theme_id: 9 }, { name: 'brez številke' }] }, themes);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ theme: 'Technic', subtheme: null });
    expect(resolveTheme(999, themes)).toEqual({ theme: null, subtheme: null });
    expect(resolveTheme(null, themes)).toEqual({ theme: null, subtheme: null });
  });
});

describe('BrickLink', () => {
  it('RFC 5849 §3.4.1.1: osnovni niz podpisa ustreza primeru iz standarda', () => {
    const params = [
      ['b5', '=%3D'],
      ['a3', 'a'],
      ['c@', ''],
      ['a2', 'r b'],
      ['oauth_consumer_key', '9djdj82h48djs9d2'],
      ['oauth_token', 'kkk9d7dh3k39sjv7'],
      ['oauth_signature_method', 'HMAC-SHA1'],
      ['oauth_timestamp', '137131201'],
      ['oauth_nonce', '7d8f3e4a'],
      ['c2', ''],
      ['a3', '2 q'],
    ] as const;
    expect(oauthBaseString('POST', 'http://example.com/request', params)).toBe(
      'POST&http%3A%2F%2Fexample.com%2Frequest&a2%3Dr%2520b%26a3%3D2%2520q%26a3%3Da%26b5%3D%253D%25253D%26c%2540%3D%26c2%3D%26oauth_consumer_key%3D9djdj82h48djs9d2%26oauth_nonce%3D7d8f3e4a%26oauth_signature_method%3DHMAC-SHA1%26oauth_timestamp%3D137131201%26oauth_token%3Dkkk9d7dh3k39sjv7',
    );
  });

  it('percentEncode kodira stroge znake', () => {
    expect(percentEncode("a b!'()*~-._")).toBe('a%20b%21%27%28%29%2A~-._');
  });

  it('podpisan GET: glava OAuth, podpis deterministično za fiksen čas in nonce; skrivnosti niso v URL', () => {
    const creds = { consumerKey: 'ck', consumerSecret: 'cs-SECRET', token: 'tk', tokenSecret: 'ts-SECRET' };
    const a = signOAuth1Get('https://api.bricklink.com/api/store/v1/items/SET/75192-1/price', [['guide_type', 'sold'], ['new_or_used', 'N']], creds, '1700000000', 'nonce123');
    const b = signOAuth1Get('https://api.bricklink.com/api/store/v1/items/SET/75192-1/price', [['guide_type', 'sold'], ['new_or_used', 'N']], creds, '1700000000', 'nonce123');
    expect(a).toEqual(b);
    expect(a.url).toBe('https://api.bricklink.com/api/store/v1/items/SET/75192-1/price?guide_type=sold&new_or_used=N');
    expect(a.authorization).toMatch(/^OAuth realm="", oauth_consumer_key="ck", oauth_token="tk", oauth_signature_method="HMAC-SHA1", oauth_timestamp="1700000000", oauth_nonce="nonce123", oauth_version="1.0", oauth_signature="[^"]+"$/);
    expect(a.url + a.authorization).not.toContain('SECRET');
    const other = signOAuth1Get('https://api.bricklink.com/api/store/v1/items/SET/75192-1/price', [['guide_type', 'stock'], ['new_or_used', 'N']], creds, '1700000000', 'nonce123');
    expect(other.authorization).not.toBe(a.authorization);
  });

  it('cenik: nizi → številke, posamezne prodaje, valuta; 404 in prazno → null', () => {
    const g = parsePriceGuide({
      meta: { code: 200 },
      data: {
        currency_code: 'eur',
        avg_price: '551.2300',
        qty_avg_price: '549.9000',
        min_price: '480.0000',
        max_price: '620.0000',
        unit_quantity: '12',
        total_quantity: '14',
        price_detail: [{ quantity: 1, unit_price: '500.00', date_ordered: '2026-09-01' }, { quantity: 2, unit_price: '600.00' }, { quantity: 0, unit_price: '1.00' }, { quantity: 1, unit_price: 'ni' }],
      },
    });
    expect(g).toMatchObject({ currency: 'EUR', average: 551.23, qtyAverage: 549.9, min: 480, max: 620, count: 12 });
    expect(g?.details).toEqual([{ unitPrice: 500, quantity: 1 }, { unitPrice: 600, quantity: 2 }]);
    expect(parsePriceGuide({ meta: { code: 404 } })).toBeNull();
    expect(parsePriceGuide(null)).toBeNull();
    expect(parsePriceGuide({ data: { currency_code: 'EUR', unit_quantity: '0' } })).toMatchObject({ count: 0, average: null, details: null });
  });
});

describe('eBay', () => {
  const env = { EBAY_API_URL: 'https://api.ebay.com' };
  const query = {
    marketplace: 'EBAY_DE' as const,
    q: 'LEGO 75192',
    minPrice: 100,
    maxPrice: 500,
    currency: 'EUR',
    conditionIds: ['1000', '1500'],
    listingTypes: ['FIXED_PRICE', 'AUCTION'] as const,
    sellerCountries: ['DE'],
    deliveryCountry: 'SI',
    maxPages: 2,
  };

  it('URL iskanja: kategorija LEGO, filtri cene/stanja/vrste/države, dostava v SI, brez skrivnosti', () => {
    const url = new URL(buildSearchUrl(env, query, 50));
    expect(url.pathname).toBe('/buy/browse/v1/item_summary/search');
    expect(url.searchParams.get('q')).toBe('LEGO 75192');
    expect(url.searchParams.get('category_ids')).toBe('19006');
    expect(url.searchParams.get('offset')).toBe('50');
    const filter = url.searchParams.get('filter')!;
    expect(filter).toContain('price:[100..500]');
    expect(filter).toContain('priceCurrency:EUR');
    expect(filter).toContain('conditionIds:{1000|1500}');
    expect(filter).toContain('buyingOptions:{FIXED_PRICE|AUCTION}');
    expect(filter).toContain('itemLocationCountry:DE');
    expect(filter).toContain('deliveryCountry:SI');
  });

  it('več držav prodajalca se ne filtrira na viru; brez cenovnih mej ni filtra cene', () => {
    const filter = new URL(buildSearchUrl(env, { ...query, minPrice: undefined, maxPrice: undefined, sellerCountries: ['DE', 'IT'], conditionIds: null }, 0)).searchParams.get('filter')!;
    expect(filter).not.toContain('itemLocationCountry');
    expect(filter).not.toContain('price:');
    expect(filter).not.toContain('conditionIds');
  });

  const body = {
    total: 3,
    next: 'https://api.ebay.com/next',
    itemSummaries: [
      {
        itemId: 'v1|111|0',
        title: 'LEGO 75192 Falcon NEU',
        price: { value: '399.00', currency: 'EUR' },
        condition: 'New',
        conditionId: '1000',
        buyingOptions: ['FIXED_PRICE'],
        itemWebUrl: 'https://www.ebay.de/itm/111',
        image: { imageUrl: 'https://i.ebayimg.com/a.jpg' },
        additionalImages: [{ imageUrl: 'http://insecure/x.jpg' }, { imageUrl: 'https://i.ebayimg.com/b.jpg' }],
        itemLocation: { country: 'de' },
        shippingOptions: [{ shippingCostType: 'FIXED', shippingCost: { value: '19.90', currency: 'EUR' } }, { shippingCostType: 'FIXED', shippingCost: { value: '29.90', currency: 'EUR' } }],
      },
      {
        itemId: 'v1|222|0',
        title: 'LEGO 75257 Auktion',
        price: { value: '1.00', currency: 'EUR' },
        currentBidPrice: { value: '65.50', currency: 'EUR' },
        buyingOptions: ['AUCTION'],
        bidCount: 4,
        itemEndDate: '2026-10-22T09:00:00.000Z',
        itemWebUrl: 'https://www.ebay.de/itm/222',
        itemLocation: { country: 'IT' },
        shippingOptions: [{ shippingCostType: 'CALCULATED' }],
      },
      { itemId: 'v1|333|0', title: 'brez cene', itemWebUrl: 'https://www.ebay.de/itm/333' },
      { itemId: 'v1|444|0', title: 'http povezava', price: { value: '1', currency: 'EUR' }, itemWebUrl: 'http://www.ebay.de/itm/444' },
    ],
  };

  it('oglas: najcenejša FIXED poštnina, država velike črke, samo https slike; brez cene ali https povezave se zavrže', () => {
    const { listings, total, hasMore } = parseEbayItems(body, 'EBAY_DE');
    expect(total).toBe(3);
    expect(hasMore).toBe(true);
    expect(listings).toHaveLength(2);
    expect(listings[0]).toMatchObject({
      itemId: 'v1|111|0',
      price: { amount: 399, currency: 'EUR' },
      shipping: { amount: 19.9, currency: 'EUR' },
      shippingKnown: true,
      sellerCountry: 'DE',
      conditionId: '1000',
      listingType: 'FIXED_PRICE',
    });
    expect(listings[0]!.images).toEqual(['https://i.ebayimg.com/a.jpg', 'https://i.ebayimg.com/b.jpg']);
  });

  it('dražba: trenutna ponudba (ne začetna cena), čas izteka; CALCULATED poštnina je NEZNANA, ne 0', () => {
    const auction = parseEbayItems(body, 'EBAY_IT').listings[1]!;
    expect(auction).toMatchObject({ listingType: 'AUCTION', price: { amount: 65.5, currency: 'EUR' }, bidCount: 4, shipping: null, shippingKnown: false, sellerCountry: 'IT', marketplace: 'EBAY_IT' });
    expect(auction.endsAt?.toISOString()).toBe('2026-10-22T09:00:00.000Z');
  });

  it('prazen ali napačen odgovor → brez oglasov', () => {
    expect(parseEbayItems({}, 'EBAY_DE').listings).toEqual([]);
    expect(parseEbayItems(null, 'EBAY_DE')).toEqual({ listings: [], total: null, hasMore: false });
  });
});

describe('konfiguracija iskanja', () => {
  const env = { EBAY_MARKETPLACES: 'EBAY_DE,EBAY_IT' };
  const parse = (input: unknown) => legoConfigSchema.safeParse(input);

  it('privzetki in normalizacija: številka → NNNNN-V, država velike črke, valuta velike črke', () => {
    const c = parse({ setNumber: ' 75192 ', sellerCountries: ['de'], currency: 'eur' });
    expect(c.success && c.data).toMatchObject({ setNumber: '75192-1', sellerCountries: ['DE'], currency: 'EUR', marketplaces: ['EBAY_DE'], conditions: [], listingTypes: ['FIXED_PRICE', 'AUCTION'], auctionEndingHours: 6 });
  });

  it('neveljavno: številka seta, država, tržnica, stanje, meje', () => {
    expect(parse({ setNumber: '12' }).success).toBe(false);
    expect(parse({ keywords: 'x', sellerCountries: ['DEU'] }).success).toBe(false);
    expect(parse({ keywords: 'x', marketplaces: ['EBAY_US'] }).success).toBe(false);
    expect(parse({ keywords: 'x', conditions: ['MINT'] }).success).toBe(false);
    expect(parse({ keywords: 'x', minDiscountPct: 120 }).success).toBe(false);
    expect(parse({ keywords: 'x', marketplaces: [] }).success).toBe(false);
  });

  it('pomen: vsaj en kriterij, meje, tržnica v namestitvi, podtema zahteva temo', () => {
    const ok = parse({ keywords: 'falcon' });
    expect(ok.success && validateLegoConfig(ok.data, env)).toBeNull();
    const empty = parse({});
    expect(empty.success && validateLegoConfig(empty.data, env)).toContain('vsaj eno');
    const years = parse({ keywords: 'x', minYear: 2020, maxYear: 2010 });
    expect(years.success && validateLegoConfig(years.data, env)).toContain('letnik');
    const prices = parse({ keywords: 'x', minPrice: 100, maxPrice: 50 });
    expect(prices.success && validateLegoConfig(prices.data, env)).toContain('cena');
    const market = parse({ keywords: 'x', marketplaces: ['EBAY_IT'] });
    expect(market.success && validateLegoConfig(market.data, { EBAY_MARKETPLACES: 'EBAY_DE' })).toContain('EBAY_IT');
    const sub = parse({ keywords: 'x', subtheme: 'UCS' });
    expect(sub.success && validateLegoConfig(sub.data, env)).toContain('Podtema');
    const maxOnly = parse({ maxPrice: 100 });
    expect(maxOnly.success && validateLegoConfig(maxOnly.data, env)).toBeNull();
  });

  it('eBay conditionIds: prazno ali UNKNOWN = brez omejitve; rabljeno zajame vse rabljene ID-je', () => {
    expect(ebayConditionIds([])).toBeNull();
    expect(ebayConditionIds(['NEW_SEALED', 'UNKNOWN'])).toBeNull();
    expect(ebayConditionIds(['NEW_SEALED', 'NEW_OPEN_BOX'])).toEqual(['1000', '1500']);
    expect(ebayConditionIds(['USED_COMPLETE'])).toEqual(['2750', '3000', '4000', '5000', '6000']);
    expect(ebayConditionIds(['PARTS_ONLY'])).toEqual(['7000']);
  });
});

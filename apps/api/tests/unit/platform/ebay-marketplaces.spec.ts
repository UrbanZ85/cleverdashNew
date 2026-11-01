import { describe, expect, it } from 'vitest';
import { EBAY_MARKETPLACE_IDS, EBAY_MARKETPLACE_INFO, EBAY_RESULT_HOSTS, allowedEbayMarketplaces } from '../../../src/platform/ebay/marketplaces.js';
import { allowedMarketplaces as legoAllowed, legoConfigSchema } from '../../../src/modules/lego-scanner/config.js';
import { collectiblesConfigSchema } from '../../../src/modules/collectibles-scanner/config.js';

// Skupen seznam tržnic: Evropa, Združeno kraljestvo in ZDA za LEGO in zbirateljski skener.

describe('tržnice eBay', () => {
  it('seznam vsebuje Evropo, Združeno kraljestvo in ZDA; identifikatorji in gostitelji so enolični', () => {
    expect(EBAY_MARKETPLACE_IDS).toEqual(expect.arrayContaining(['EBAY_DE', 'EBAY_IT', 'EBAY_FR', 'EBAY_ES', 'EBAY_AT', 'EBAY_NL', 'EBAY_BE', 'EBAY_IE', 'EBAY_PL', 'EBAY_GB', 'EBAY_US']));
    expect(new Set(EBAY_MARKETPLACE_IDS).size).toBe(EBAY_MARKETPLACE_IDS.length);
    expect(new Set(EBAY_RESULT_HOSTS).size).toBe(EBAY_RESULT_HOSTS.length);
    expect(EBAY_RESULT_HOSTS).toEqual(expect.arrayContaining(['ebay.de', 'ebay.co.uk', 'ebay.com']));
  });

  it('valute: evro, funt, poljski zlot, dolar', () => {
    const cur = Object.fromEntries(EBAY_MARKETPLACE_INFO.map((m) => [m.id, m.currency]));
    expect(cur).toMatchObject({ EBAY_DE: 'EUR', EBAY_GB: 'GBP', EBAY_PL: 'PLN', EBAY_US: 'USD' });
  });

  it('namestitev dovoli samo znane tržnice iz EBAY_MARKETPLACES', () => {
    expect(allowedEbayMarketplaces({ EBAY_MARKETPLACES: 'ebay_gb, EBAY_US, EBAY_DE, EBAY_CA, ' })).toEqual(['EBAY_DE', 'EBAY_GB', 'EBAY_US']);
    expect(allowedEbayMarketplaces({ EBAY_MARKETPLACES: '' })).toEqual([]);
    expect(legoAllowed({ EBAY_MARKETPLACES: 'EBAY_GB' })).toEqual(['EBAY_GB']);
  });

  it('obe konfiguraciji sprejmeta vse tržnice in zavrneta neznano', () => {
    const all = [...EBAY_MARKETPLACE_IDS];
    expect(legoConfigSchema.safeParse({ keywords: 'x', marketplaces: all }).success).toBe(true);
    expect(collectiblesConfigSchema.safeParse({ category: 'trading-cards', keywords: 'x', marketplaces: all }).success).toBe(true);
    expect(legoConfigSchema.safeParse({ keywords: 'x', marketplaces: ['EBAY_CA'] }).success).toBe(false);
    expect(collectiblesConfigSchema.safeParse({ category: 'trading-cards', keywords: 'x', marketplaces: ['EBAY_CA'] }).success).toBe(false);
  });
});

import type { Env } from '../../../platform/config/env.js';
import { EBAY_GAP_MS as SHARED_EBAY_GAP_MS, hasEbayCredentials, searchEbayListings } from '../../../platform/ebay/client.js';
import { allowedEbayMarketplaces } from '../../../platform/ebay/marketplaces.js';
import type { CollectiblesMarketplace } from '../domain/types.js';
import type { ListingSource } from './types.js';

// eBay Browse za zbirateljske predmete (019, research §1). Odjemalec je skupen z LEGO
// (`platform/ebay/`); tu so samo tržnice in meje tega tipa. Kategorija eBay je del iskanja (`query.categoryId`):
// določi jo kategorija zbirateljskih predmetov in je do potrditve ID-jev (research §7) lahko prazna.

export const EBAY_GAP_MS = SHARED_EBAY_GAP_MS;

export function enabledMarketplaces(env: Pick<Env, 'EBAY_MARKETPLACES'>): CollectiblesMarketplace[] {
  return allowedEbayMarketplaces(env);
}

export const ebayListings: ListingSource = {
  id: 'ebay',
  label: 'eBay',

  disabledReason(env) {
    if (!hasEbayCredentials(env)) return 'Manjkata EBAY_CLIENT_ID in EBAY_CLIENT_SECRET.';
    return enabledMarketplaces(env).length === 0 ? 'EBAY_MARKETPLACES ne vsebuje nobene podprte tržnice.' : null;
  },

  search(rt, query) {
    return searchEbayListings(rt, query, {
      cachePrefix: 'collectibles',
      timeoutMs: rt.env.COLLECTIBLES_TIMEOUT_MS,
      ttlSeconds: rt.env.COLLECTIBLES_LISTING_CACHE_SECONDS,
      dailyLimit: rt.env.COLLECTIBLES_EBAY_DAILY_LIMIT,
    });
  },
};

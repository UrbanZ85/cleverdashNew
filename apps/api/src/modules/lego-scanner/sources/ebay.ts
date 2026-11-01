import type { Env } from '../../../platform/config/env.js';
import {
  buildEbaySearchUrl,
  EBAY_GAP_MS as SHARED_EBAY_GAP_MS,
  hasEbayCredentials,
  parseEbayItems as parseSharedEbayItems,
  resetEbayTokenForTests as resetSharedEbayTokenForTests,
  searchEbayListings,
} from '../../../platform/ebay/client.js';
import type { RawListing } from '../domain/types.js';
import { allowedEbayMarketplaces } from '../../../platform/ebay/marketplaces.js';
import type { LegoMarketplace } from '../domain/types.js';
import type { ListingQuery, ListingSource, SourceOutcome } from './types.js';

// eBay Browse API — OGLASI za LEGO (018, research §5). Od 019 je odjemalec (žeton, URL iskanja,
// razčlenitev, listanje) skupen v `platform/ebay/`; LEGO doda samo svojo kategorijo, tržnice in meje.

export const EBAY_GAP_MS = SHARED_EBAY_GAP_MS;
/** eBay kategorija "LEGO Building Toys" (DE/IT: enaka številka). */
const LEGO_CATEGORY = '19006';

/** Samo za teste. */
export function resetEbayTokenForTests(): void {
  resetSharedEbayTokenForTests();
}

export function enabledMarketplaces(env: Pick<Env, 'EBAY_MARKETPLACES'>): LegoMarketplace[] {
  return allowedEbayMarketplaces(env);
}

/** URL iskanja (brez skrivnosti); `offset` je odmik strani. */
export function buildSearchUrl(env: Pick<Env, 'EBAY_API_URL'>, query: ListingQuery, offset: number): string {
  return buildEbaySearchUrl(env, { ...query, categoryId: LEGO_CATEGORY }, offset);
}

export function parseEbayItems(body: unknown, marketplace: LegoMarketplace): { listings: RawListing[]; total: number | null; hasMore: boolean } {
  const parsed = parseSharedEbayItems(body, marketplace);
  return { ...parsed, listings: parsed.listings.map((l) => ({ ...l, marketplace })) };
}

export const ebayListings: ListingSource = {
  id: 'ebay',
  label: 'eBay',

  disabledReason(env) {
    if (!hasEbayCredentials(env)) return 'Manjkata EBAY_CLIENT_ID in EBAY_CLIENT_SECRET.';
    return enabledMarketplaces(env).length === 0 ? 'EBAY_MARKETPLACES ne vsebuje nobene podprte tržnice.' : null;
  },

  async search(rt, query): Promise<SourceOutcome<RawListing[]>> {
    const out = await searchEbayListings(
      rt,
      { ...query, categoryId: LEGO_CATEGORY },
      {
        cachePrefix: 'lego',
        timeoutMs: rt.env.LEGO_TIMEOUT_MS,
        ttlSeconds: rt.env.LEGO_LISTING_CACHE_SECONDS,
        dailyLimit: rt.env.LEGO_EBAY_DAILY_LIMIT,
      },
    );
    if (!out.ok) return out;
    return { ok: true, value: out.value.map((l) => ({ ...l, marketplace: query.marketplace })), stale: out.stale };
  },
};

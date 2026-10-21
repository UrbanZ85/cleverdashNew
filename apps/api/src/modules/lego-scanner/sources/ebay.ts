import { createHash } from 'node:crypto';
import type { Env } from '../../../platform/config/env.js';
import type { ListingType, RawListing } from '../domain/types.js';
import { LEGO_MARKETPLACES, type LegoMarketplace } from '../domain/types.js';
import { fetchCachedJson, HttpError } from './http.js';
import type { ListingQuery, ListingSource, SourceOutcome } from './types.js';

// eBay Browse API — OGLASI (018, research §5). Aplikacijski žeton prek client credentials, shranjen
// SAMO v pomnilniku do izteka (ni skrivnost v bazi, ni v `ExternalCache`). Filtri po uradni
// dokumentaciji: `price:[a..b]`, `priceCurrency`, `conditionIds:{…}`, `buyingOptions:{…}`,
// `itemLocationCountry`, `deliveryCountry:SI`. Privzeto vrne samo FIXED_PRICE; dražbe so zato vedno
// izrecno v `buyingOptions`.
//
// Poštnina je znana SAMO za `FIXED` strošek; `CALCULATED` ali brez možnosti = neznana (ne 0).
// Stari Finding/Shopping API sta od 5. 2. 2025 ugasnjena; Browse je edina možnost.

export const EBAY_GAP_MS = 150;
const SCOPE = 'https://api.ebay.com/oauth/api_scope';
/** eBay kategorija "LEGO Building Toys" (DE/IT: enaka številka). */
const LEGO_CATEGORY = '19006';
const PAGE_SIZE = 50;

interface Token {
  value: string;
  expiresAt: number;
}
let token: Token | null = null;

/** Samo za teste. */
export function resetEbayTokenForTests(): void {
  token = null;
}

async function applicationToken(env: Env): Promise<string> {
  if (token && token.expiresAt - 60_000 > Date.now()) return token.value;
  const basic = Buffer.from(`${env.EBAY_CLIENT_ID}:${env.EBAY_CLIENT_SECRET}`).toString('base64');
  const res = await fetch(`${env.EBAY_API_URL}/identity/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=client_credentials&scope=${encodeURIComponent(SCOPE)}`,
    signal: AbortSignal.timeout(env.LEGO_TIMEOUT_MS),
  });
  if (!res.ok) throw new HttpError(res.status === 400 ? 401 : res.status, `HTTP ${res.status}`);
  const json = (await res.json()) as { access_token?: unknown; expires_in?: unknown };
  if (typeof json.access_token !== 'string' || json.access_token.length === 0) throw new HttpError(502, 'eBay ni vrnil žetona.');
  const seconds = typeof json.expires_in === 'number' && json.expires_in > 0 ? json.expires_in : 7200;
  token = { value: json.access_token, expiresAt: Date.now() + seconds * 1000 };
  return token.value;
}

export function enabledMarketplaces(env: Pick<Env, 'EBAY_MARKETPLACES'>): LegoMarketplace[] {
  const wanted = env.EBAY_MARKETPLACES.split(',').map((s) => s.trim().toUpperCase());
  return LEGO_MARKETPLACES.filter((m) => wanted.includes(m));
}

/** URL iskanja (brez skrivnosti); `offset` je odmik strani. */
export function buildSearchUrl(env: Pick<Env, 'EBAY_API_URL'>, query: ListingQuery, offset: number): string {
  const filters: string[] = [];
  if (query.minPrice !== undefined || query.maxPrice !== undefined) {
    filters.push(`price:[${query.minPrice ?? ''}..${query.maxPrice ?? ''}]`);
    filters.push(`priceCurrency:${query.currency}`);
  }
  if (query.conditionIds && query.conditionIds.length > 0) filters.push(`conditionIds:{${query.conditionIds.join('|')}}`);
  const options = query.listingTypes.length > 0 ? query.listingTypes : (['FIXED_PRICE', 'AUCTION'] as const);
  filters.push(`buyingOptions:{${[...options].join('|')}}`);
  // Eno državo prodajalca filtrira vir; več držav se filtrira po razčlenitvi (filter ne podpira seznama).
  if (query.sellerCountries.length === 1) filters.push(`itemLocationCountry:${query.sellerCountries[0]}`);
  filters.push(`deliveryCountry:${query.deliveryCountry}`);
  const qs = [
    `q=${encodeURIComponent(query.q)}`,
    `category_ids=${LEGO_CATEGORY}`,
    `filter=${encodeURIComponent(filters.join(','))}`,
    `limit=${PAGE_SIZE}`,
    `offset=${offset}`,
    'sort=newlyListed',
  ].join('&');
  return `${env.EBAY_API_URL}/buy/browse/v1/item_summary/search?${qs}`;
}

type Json = Record<string, unknown>;

function amount(v: unknown): { amount: number; currency: string } | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Json;
  const value = typeof o.value === 'string' ? Number(o.value) : typeof o.value === 'number' ? o.value : NaN;
  const currency = typeof o.currency === 'string' ? o.currency.toUpperCase() : null;
  return Number.isFinite(value) && currency ? { amount: value, currency } : null;
}

function https(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  try {
    return new URL(v).protocol === 'https:' ? v : null;
  } catch {
    return null;
  }
}

export function parseEbayItems(body: unknown, marketplace: LegoMarketplace): { listings: RawListing[]; total: number | null; hasMore: boolean } {
  if (!body || typeof body !== 'object') return { listings: [], total: null, hasMore: false };
  const root = body as Json;
  const items = Array.isArray(root.itemSummaries) ? (root.itemSummaries as Json[]) : [];
  const listings: RawListing[] = [];
  for (const item of items) {
    const itemId = typeof item.itemId === 'string' ? item.itemId : null;
    const title = typeof item.title === 'string' ? item.title.trim() : null;
    const url = https(item.itemWebUrl);
    if (!itemId || !title || !url) continue;
    const options = Array.isArray(item.buyingOptions) ? (item.buyingOptions as unknown[]).filter((o): o is string => typeof o === 'string') : [];
    const listingType: ListingType = options.includes('AUCTION') ? 'AUCTION' : 'FIXED_PRICE';
    const price = (listingType === 'AUCTION' ? amount(item.currentBidPrice) : null) ?? amount(item.price);
    if (!price) continue;
    const shippingOptions = Array.isArray(item.shippingOptions) ? (item.shippingOptions as Json[]) : [];
    const fixed = shippingOptions
      .filter((o) => o.shippingCostType === 'FIXED')
      .map((o) => amount(o.shippingCost))
      .filter((m): m is { amount: number; currency: string } => m !== null)
      .sort((a, b) => a.amount - b.amount);
    const images = [https((item.image as Json | undefined)?.imageUrl), ...(Array.isArray(item.additionalImages) ? (item.additionalImages as Json[]).map((i) => https(i?.imageUrl)) : [])].filter(
      (u): u is string => u !== null,
    );
    const endDate = typeof item.itemEndDate === 'string' ? new Date(item.itemEndDate) : null;
    listings.push({
      marketplace,
      itemId,
      title,
      description: typeof item.shortDescription === 'string' && item.shortDescription.trim() ? item.shortDescription.trim().slice(0, 500) : null,
      price,
      listingType,
      endsAt: endDate && !Number.isNaN(endDate.getTime()) ? endDate : null,
      bidCount: typeof item.bidCount === 'number' && Number.isFinite(item.bidCount) ? item.bidCount : null,
      conditionId: typeof item.conditionId === 'string' ? item.conditionId : null,
      conditionText: typeof item.condition === 'string' ? item.condition : null,
      sellerCountry: typeof (item.itemLocation as Json | undefined)?.country === 'string' ? String((item.itemLocation as Json).country).toUpperCase() : null,
      shipping: fixed[0] ?? null,
      shippingKnown: fixed.length > 0,
      url,
      images: images.slice(0, 4),
    });
  }
  const total = typeof root.total === 'number' ? root.total : null;
  return { listings, total, hasMore: typeof root.next === 'string' && root.next.length > 0 };
}

export const ebayListings: ListingSource = {
  id: 'ebay',
  label: 'eBay',

  disabledReason(env) {
    if (!env.EBAY_CLIENT_ID || !env.EBAY_CLIENT_SECRET) return 'Manjkata EBAY_CLIENT_ID in EBAY_CLIENT_SECRET.';
    return enabledMarketplaces(env).length === 0 ? 'EBAY_MARKETPLACES ne vsebuje nobene podprte tržnice.' : null;
  },

  async search(rt, query): Promise<SourceOutcome<RawListing[]>> {
    const { env } = rt;
    const all: RawListing[] = [];
    let stale = false;
    for (let page = 0; page < query.maxPages; page += 1) {
      const offset = page * PAGE_SIZE;
      const url = buildSearchUrl(env, query, offset);
      const out = await fetchCachedJson(
        {
          usageSource: 'ebay',
          cacheKey: `lego:ebay:${query.marketplace}:${createHash('sha256').update(url).digest('hex').slice(0, 24)}`,
          sourceUrl: url,
          buildRequest: async () => ({
            url,
            headers: {
              Authorization: `Bearer ${await applicationToken(env)}`,
              'X-EBAY-C-MARKETPLACE-ID': query.marketplace,
              Accept: 'application/json',
            },
          }),
          ttlSeconds: env.LEGO_LISTING_CACHE_SECONDS,
          dailyLimit: env.LEGO_EBAY_DAILY_LIMIT,
          rt,
          paceId: 'ebay',
        },
        'eBay',
      );
      if (!out.ok) return out;
      stale = stale || out.stale;
      const parsed = parseEbayItems(out.value, query.marketplace);
      all.push(...parsed.listings);
      if (!parsed.hasMore || parsed.listings.length === 0) break;
    }
    // Oglasi so hiter podatek: star predpomnjen odgovor NI uspeh (nedosegljivosti se iz njega ne ugotavlja).
    if (stale) return { ok: false, code: 'unreachable', message: 'eBay ni odgovoril; zadnji znani oglasi so stari in se ne uporabijo.' };
    const countries = new Set(query.sellerCountries);
    const filtered = countries.size > 1 ? all.filter((l) => l.sellerCountry !== null && countries.has(l.sellerCountry)) : all;
    return { ok: true, value: filtered, stale: false };
  },
};

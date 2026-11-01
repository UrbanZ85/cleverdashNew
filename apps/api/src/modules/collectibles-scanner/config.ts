import { z } from 'zod';
import type { Env } from '../../platform/config/env.js';
import { allowedEbayMarketplaces } from '../../platform/ebay/marketplaces.js';
import { getCategory } from './categories/registry.js';
import { cardsFilterSchema } from './categories/trading-cards.js';
import { retroFilterSchema } from './categories/retro-gaming.js';
import { COLLECTIBLE_CONDITIONS, COLLECTIBLES_MARKETPLACES, LISTING_TYPES, type CollectiblesMarketplace } from './domain/types.js';

// Konfiguracija iskanja zbirateljskega skenerja (019, data-model.md `CollectiblesConfig`). Zod pove OBLIKO in
// normalizira (država → velike črke); pomen (vsaj en kriterij, meje, tržnice v namestitvi, filtri kategorije)
// je v `validateCollectiblesConfig`. Kategorija je diskriminator: vsaka ima svoj podobjekt filtrov
// (`cards`, `retro`), ostalo se odstrani.

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Največ ${max} znakov.`)
    .transform((s) => (s.length === 0 ? undefined : s))
    .optional();

const optionalNumber = (min: number, max: number, message: string) => z.number({ invalid_type_error: message }).min(min, message).max(max, message).optional();

const common = z.object({
  keywords: optionalText(120),
  excludedKeywords: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  marketplaces: z.array(z.enum(COLLECTIBLES_MARKETPLACES)).min(1, 'Izberi vsaj eno tržnico.').max(COLLECTIBLES_MARKETPLACES.length).default(['EBAY_DE']),
  sellerCountries: z
    .array(z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'Država prodajalca je dvočrkovna oznaka (npr. DE).'))
    .max(10)
    .default([]),
  minPrice: optionalNumber(0, 1_000_000, 'Cena mora biti med 0 in 1.000.000.'),
  maxPrice: optionalNumber(0, 1_000_000, 'Cena mora biti med 0 in 1.000.000.'),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, 'Valuta mora biti tričrkovna oznaka (npr. EUR).')
    .default('EUR'),
  conditions: z.array(z.enum(COLLECTIBLE_CONDITIONS)).default([]),
  listingTypes: z.array(z.enum(LISTING_TYPES)).min(1, 'Izberi vsaj eno vrsto ponudbe.').default(['FIXED_PRICE', 'AUCTION']),
  maxShipping: optionalNumber(0, 10_000, 'Poštnina mora biti med 0 in 10.000.'),
  minDiscountPct: optionalNumber(0, 100, 'Popust mora biti med 0 in 100 %.'),
  minProfit: optionalNumber(-1_000_000, 1_000_000, 'Dobiček mora biti veljavno število.'),
  notifyMinProfit: optionalNumber(-1_000_000, 1_000_000, 'Prag obvestila mora biti veljavno število.'),
  notifyMinDiscountPct: optionalNumber(0, 100, 'Prag popusta mora biti med 0 in 100 %.'),
  auctionEndingHours: z.number().int('Okno mora biti celo število ur.').min(1, 'Najmanj 1 ura.').max(72, 'Največ 72 ur.').default(6),
});

export const collectiblesConfigSchema = z.discriminatedUnion('category', [
  common.extend({ category: z.literal('trading-cards'), cards: cardsFilterSchema.default({}) }),
  common.extend({ category: z.literal('retro-gaming'), retro: retroFilterSchema.default({}) }),
]);

export type CollectiblesConfig = z.infer<typeof collectiblesConfigSchema>;

/** Seznam tržnic, ki jih namestitev dovoli (`EBAY_MARKETPLACES`), presek z znanimi. */
export function allowedMarketplaces(env: Pick<Env, 'EBAY_MARKETPLACES'>): CollectiblesMarketplace[] {
  return allowedEbayMarketplaces(env);
}

/** Pomen konfiguracije — slovenski stavek ali `null`. */
export function validateCollectiblesConfig(config: CollectiblesConfig, env: Pick<Env, 'EBAY_MARKETPLACES'>): string | null {
  const category = getCategory(config.category);
  if (!config.keywords && !category.hasFilters(config) && config.maxPrice === undefined) {
    return 'Vpiši vsaj eno od: ključne besede, filter kategorije ali najvišja cena — sicer bi iskanje zajelo vse oglase.';
  }
  if (config.minPrice !== undefined && config.maxPrice !== undefined && config.maxPrice < config.minPrice) return 'Najvišja cena ne sme biti pod najnižjo.';
  const allowed = allowedMarketplaces(env);
  const bad = config.marketplaces.filter((m) => !allowed.includes(m));
  if (bad.length > 0) return `Tržnica ${bad.join(', ')} v tej namestitvi ni dovoljena (EBAY_MARKETPLACES).`;
  if (config.notifyMinProfit !== undefined && config.notifyMinDiscountPct !== undefined) return 'Nastavi prag obvestila po dobičku ali po popustu, ne obeh.';
  const lowered = new Set(config.excludedKeywords.map((k) => k.toLowerCase()));
  if (config.keywords && config.keywords.toLowerCase().split(/\s+/).some((w) => lowered.has(w))) return 'Ključna beseda je hkrati med izključenimi.';
  return category.validate(config);
}

export function describeCollectiblesConfig(config: CollectiblesConfig): string {
  const category = getCategory(config.category);
  const parts = [...category.describe(config)];
  if (config.keywords) parts.push(`"${config.keywords}"`);
  if (config.maxPrice !== undefined) parts.push(`do ${config.maxPrice} ${config.currency}`);
  parts.push(config.marketplaces.join(', '));
  return parts.join(' · ');
}

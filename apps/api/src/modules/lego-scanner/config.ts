import { z } from 'zod';
import type { Env } from '../../platform/config/env.js';
import { normalizeSetNumber } from './domain/set-number.js';
import { LEGO_CONDITIONS, LEGO_MARKETPLACES, LISTING_TYPES, type LegoCondition, type LegoMarketplace } from './domain/types.js';

// Konfiguracija iskanja LEGO skenerja (018, data-model.md `LegoConfig`). Zod pove OBLIKO in
// normalizira (številka seta → `NNNNN-V`, država → velike črke); pomen (vsaj en kriterij, meje,
// tržnice v namestitvi) je v `validateLegoConfig`. Polja "upokojen" NI: noben dovoljen vir tega
// ne pove zanesljivo (research §3), filter, ki bi molče domneval, bi kršil FR-013.

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Največ ${max} znakov.`)
    .transform((s) => (s.length === 0 ? undefined : s))
    .optional();

const optionalNumber = (min: number, max: number, message: string) =>
  z
    .number({ invalid_type_error: message })
    .min(min, message)
    .max(max, message)
    .optional();

export const legoConfigSchema = z.object({
  setNumber: z
    .string()
    .trim()
    .transform((s, ctx) => {
      if (s.length === 0) return undefined;
      const normalized = normalizeSetNumber(s);
      if (!normalized) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Številka seta mora imeti 4 do 6 števk (npr. 75192 ali 75192-1).' });
        return z.NEVER;
      }
      return normalized;
    })
    .optional(),
  keywords: optionalText(120),
  theme: optionalText(60),
  subtheme: optionalText(60),
  minYear: optionalNumber(1949, 2100, 'Letnik mora biti med 1949 in 2100.'),
  maxYear: optionalNumber(1949, 2100, 'Letnik mora biti med 1949 in 2100.'),
  minPrice: optionalNumber(0, 1_000_000, 'Cena mora biti med 0 in 1.000.000.'),
  maxPrice: optionalNumber(0, 1_000_000, 'Cena mora biti med 0 in 1.000.000.'),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, 'Valuta mora biti tričrkovna oznaka (npr. EUR).')
    .default('EUR'),
  marketplaces: z.array(z.enum(LEGO_MARKETPLACES)).min(1, 'Izberi vsaj eno tržnico.').max(2).default(['EBAY_DE']),
  sellerCountries: z
    .array(z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'Država prodajalca je dvočrkovna oznaka (npr. DE).'))
    .max(10)
    .default([]),
  conditions: z.array(z.enum(LEGO_CONDITIONS)).default([]),
  listingTypes: z.array(z.enum(LISTING_TYPES)).min(1, 'Izberi vsaj eno vrsto ponudbe.').default(['FIXED_PRICE', 'AUCTION']),
  minDiscountPct: optionalNumber(0, 100, 'Popust mora biti med 0 in 100 %.'),
  minProfit: optionalNumber(-1_000_000, 1_000_000, 'Dobiček mora biti veljavno število.'),
  maxShipping: optionalNumber(0, 10_000, 'Poštnina mora biti med 0 in 10.000.'),
  notifyMinProfit: optionalNumber(-1_000_000, 1_000_000, 'Prag obvestila mora biti veljavno število.'),
  auctionEndingHours: z.number().int('Okno mora biti celo število ur.').min(1, 'Najmanj 1 ura.').max(72, 'Največ 72 ur.').default(6),
});

export type LegoConfig = z.infer<typeof legoConfigSchema>;

/** Seznam tržnic, ki jih namestitev dovoli (`EBAY_MARKETPLACES`), presek z znanimi. */
export function allowedMarketplaces(env: Pick<Env, 'EBAY_MARKETPLACES'>): LegoMarketplace[] {
  const wanted = env.EBAY_MARKETPLACES.split(',').map((s) => s.trim().toUpperCase());
  return LEGO_MARKETPLACES.filter((m) => wanted.includes(m));
}

/** Pomen konfiguracije — slovenski stavek ali `null`. */
export function validateLegoConfig(config: LegoConfig, env: Pick<Env, 'EBAY_MARKETPLACES'>): string | null {
  if (!config.setNumber && !config.keywords && !config.theme && config.maxPrice === undefined) {
    return 'Vpiši vsaj eno od: številka seta, ključne besede, tema ali najvišja cena — sicer bi iskanje zajelo vse oglase.';
  }
  if (config.minYear !== undefined && config.maxYear !== undefined && config.maxYear < config.minYear) return 'Najpoznejši letnik ne sme biti pred najzgodnejšim.';
  if (config.minPrice !== undefined && config.maxPrice !== undefined && config.maxPrice < config.minPrice) return 'Najvišja cena ne sme biti pod najnižjo.';
  const allowed = allowedMarketplaces(env);
  const bad = config.marketplaces.filter((m) => !allowed.includes(m));
  if (bad.length > 0) return `Tržnica ${bad.join(', ')} v tej namestitvi ni dovoljena (EBAY_MARKETPLACES).`;
  if (config.subtheme && !config.theme) return 'Podtema zahteva temo.';
  return null;
}

/** eBay `conditionIds` za izbrana stanja; `null` = brez omejitve (prazno ali vključeno `UNKNOWN`). */
export function ebayConditionIds(conditions: readonly LegoCondition[]): string[] | null {
  if (conditions.length === 0 || conditions.includes('UNKNOWN')) return null;
  const ids = new Set<string>();
  for (const c of conditions) {
    if (c === 'NEW_SEALED') ids.add('1000');
    else if (c === 'NEW_OPEN_BOX') ids.add('1500');
    else if (c === 'PARTS_ONLY') ids.add('7000');
    else {
      for (const id of ['2750', '3000', '4000', '5000', '6000']) ids.add(id);
    }
  }
  return [...ids];
}

export function describeLegoConfig(config: LegoConfig): string {
  const parts: string[] = [];
  if (config.setNumber) parts.push(`set ${config.setNumber}`);
  if (config.keywords) parts.push(`"${config.keywords}"`);
  if (config.theme) parts.push(config.subtheme ? `${config.theme} / ${config.subtheme}` : config.theme);
  if (config.maxPrice !== undefined) parts.push(`do ${config.maxPrice} ${config.currency}`);
  parts.push(config.marketplaces.join(', '));
  return parts.join(' · ');
}

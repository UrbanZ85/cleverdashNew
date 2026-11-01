import type { EbayListing } from '../../../platform/ebay/client.js';
import type { Opportunity as MathOpportunity, OpportunityParams, ValueConfidence } from '../../../platform/scanner/domain/opportunity-math.js';

// Čisti tipi zbirateljskega skenerja (019, data-model.md). Brez mongoose in expressa (člen IX).
//
// Dogovor, ki velja povsod v modulu: polje, ki ga vir ne da, je `null` ali izpuščeno — NIKOLI domnevna
// vrednost (FR-016). Poštnina "ni znana" ni 0, jezik "ni naveden" ni angleščina, izdaja "ni navedena" ni
// "unlimited", ocena "ni navedena" ni "neocenjeno".

export const COLLECTIBLE_CATEGORIES = ['trading-cards', 'retro-gaming'] as const;
export type CollectibleCategoryId = (typeof COLLECTIBLE_CATEGORIES)[number];

export const COLLECTIBLES_MARKETPLACES = ['EBAY_DE', 'EBAY_IT', 'EBAY_FR', 'EBAY_ES'] as const;
export type CollectiblesMarketplace = (typeof COLLECTIBLES_MARKETPLACES)[number];

export const LISTING_TYPES = ['FIXED_PRICE', 'AUCTION'] as const;
export type ListingType = (typeof LISTING_TYPES)[number];

export const COLLECTIBLE_CONDITIONS = ['NEW', 'LIKE_NEW', 'USED', 'FOR_PARTS', 'UNKNOWN'] as const;
export type CollectibleCondition = (typeof COLLECTIBLE_CONDITIONS)[number];

export interface Money {
  amount: number;
  currency: string;
}

/** Surov oglas (eBay); vse neznano je `null`. Tržnica je niz: skupni odjemalec je ne pozna. */
export type RawListing = EbayListing;

export const CARD_LANGUAGES = ['en', 'de', 'fr', 'it', 'es', 'ja'] as const;
export type CardLanguage = (typeof CARD_LANGUAGES)[number];

export const GRADING_COMPANIES = ['PSA', 'BGS', 'CGC', 'SGC'] as const;
export type GradingCompany = (typeof GRADING_COMPANIES)[number];

export type CardFinish = 'holo' | 'reverse' | 'normal';

export interface CardAttributes {
  game: 'pokemon';
  setId?: string;
  setName?: string;
  cardNumber?: string;
  rarity?: string;
  finish?: CardFinish;
  /** `null` = ni znano (oglas ne pove), `false` = izrecno neocenjena ne obstaja kot trditev: glej `gradeStatus`. */
  graded: boolean | null;
  sealed: boolean | null;
}

export const RETRO_REGIONS = ['PAL', 'NTSC-U', 'NTSC-J'] as const;
export type RetroRegion = (typeof RETRO_REGIONS)[number];

export const RETRO_COMPLETENESS = ['loose', 'boxed', 'cib', 'sealed'] as const;
export type RetroCompleteness = (typeof RETRO_COMPLETENESS)[number];

export const RETRO_WORKING = ['working', 'untested', 'not-working'] as const;
export type RetroWorking = (typeof RETRO_WORKING)[number];

export const RETRO_KINDS = ['game', 'console', 'accessory'] as const;
export type RetroKind = (typeof RETRO_KINDS)[number];

export interface RetroAttributes {
  platform?: string;
  region?: RetroRegion;
  kind?: RetroKind;
  completeness?: RetroCompleteness;
  working?: RetroWorking | null;
  reproductionSuspected: boolean | null;
}

/** Atributi po nalogi; kar je kategorijsko, je v tipizirani podstrukturi (`card` / `retro`). */
export interface CollectibleAttributes {
  category: CollectibleCategoryId;
  subcategory?: string;
  brand?: string;
  name?: string;
  model?: string;
  catalogId?: string;
  edition?: string;
  releaseYear?: number;
  condition?: CollectibleCondition;
  conditionVerified?: boolean;
  language?: string;
  region?: string;
  gradingCompany?: string;
  grade?: string;
  originalPackaging?: boolean;
  completeness?: string;
  sellerCountry?: string;
  listingType?: ListingType;
  auctionEnd?: string;
  card?: CardAttributes;
  retro?: RetroAttributes;
}

// ───────────────────────────── prepoznava ─────────────────────────────

export const CARD_KINDS = ['CARD', 'SEALED', 'LOT', 'PROXY', 'OTHER', 'UNIDENTIFIED'] as const;
export const RETRO_ID_KINDS = ['GAME', 'CONSOLE', 'ACCESSORY', 'LOT', 'REPRODUCTION', 'OTHER', 'UNIDENTIFIED'] as const;
export type IdentificationKind = (typeof CARD_KINDS)[number] | (typeof RETRO_ID_KINDS)[number];

export type IdentificationConfidence = 'high' | 'medium' | 'low' | 'none';

export interface CatalogCard {
  id: string;
  language: CardLanguage;
  name: string;
  localId: string;
  setId: string | null;
  setName: string | null;
  /** Uradno število kartic v setu (`102` pri `4/102`); `null`, kadar katalog ne pove. */
  setOfficialCount: number | null;
  rarity: string | null;
  imageUrl: string | null;
  /** Booleans iz kataloga; `null` = katalog ne pove. */
  variants: { firstEdition: boolean | null; holo: boolean | null; normal: boolean | null; reverse: boolean | null } | null;
  /** Cardmarket cene kataloga — OCENE, ne prodaje. */
  pricing: CatalogPricing | null;
}

export interface CatalogPricing {
  source: 'cardmarket';
  currency: string;
  updatedAt: string | null;
  avg: number | null;
  low: number | null;
  trend: number | null;
  avg7: number | null;
  avg30: number | null;
  trendHolo: number | null;
}

export interface Identification {
  kind: IdentificationKind;
  confidence: IdentificationConfidence;
  /** Slovensko, kratko: zakaj je tako. */
  reason: string;
  needsReview: boolean;
  /** Ključ primerjave; `null` = primerjava ni mogoča. Dve različici z različnim ključem se NIKOLI ne primerjata. */
  variantKey: string | null;
  /** Kaj oglas ne pove, kar bi bilo za primerjavo potrebno (npr. `language`, `edition`, `finish`, `grade`). */
  ambiguities: string[];
  catalog: {
    id: string;
    name: string;
    setName: string | null;
    number: string | null;
    rarity: string | null;
    imageUrl: string | null;
  } | null;
}

// ───────────────────────────── vrednotenje ─────────────────────────────

/** `asking` = zahtevane cene aktivnih oglasov; `estimate` = katalogna ocena; `guide` = cenik; `sold` = preverjene prodaje. */
export type PriceBasis = 'asking' | 'estimate' | 'guide' | 'sold';

export interface Valuation {
  asking: { median: number | null; min: number | null; count: number; currency: string } | null;
  estimate: { value: number; low: number | null; trend: number | null; source: string; updatedAt: string | null; currency: string; basis: 'estimate' | 'guide' } | null;
  sold: { average: number; median: number | null; count: number; periodMonths: number; source: string; currency: string } | null;
  /** Kaj tvori osnovo popusta; `asking` ni nikoli osnova. */
  primary: 'sold' | 'guide' | 'estimate' | null;
  confidence: ValueConfidence;
  /** `false` = druga valuta ali različica ni določena; vrednosti se ne uporabi za primerjavo. */
  comparable: boolean;
  stale: boolean;
  note: string | null;
}

export interface Opportunity extends MathOpportunity {
  /** Osnova odstotka popusta; `null`, kadar popusta ni. */
  discountBasis: 'sold' | 'guide' | 'estimate' | null;
  /** Dobiček je samo iz preverjenih prodaj: `'sold'` ali `null`. */
  profitBasis: 'sold' | null;
}

export type { OpportunityParams, ValueConfidence };

export interface CollectiblesAlerts {
  profitNotified: boolean;
  discountNotified: boolean;
  auctionEndingNotified: boolean;
}

export interface CollectiblesResultData {
  collectible: CollectibleAttributes;
  listing: {
    marketplace: string;
    itemId: string;
    listingType: ListingType;
    endsAt: string | null;
    bidCount: number | null;
    shipping: Money | null;
    shippingKnown: boolean;
    images: string[];
  };
  identification: Identification;
  valuation: Valuation | null;
  opportunity: Opportunity;
  alerts: CollectiblesAlerts;
}

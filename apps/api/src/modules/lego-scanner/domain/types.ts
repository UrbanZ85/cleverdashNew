// Čisti tipi LEGO skenerja (018, data-model.md). Brez mongoose in expressa (člen IX).
//
// Dogovor, ki velja povsod v modulu: polje, ki ga vir ne da, je `null` ali izpuščeno — NIKOLI
// domnevna vrednost (FR-013). Poštnina "ni znana" ni 0, kompletnost "ni preverjena" ni "kompleten".

export const LEGO_CONDITIONS = ['NEW_SEALED', 'NEW_OPEN_BOX', 'USED_COMPLETE', 'USED_INCOMPLETE', 'PARTS_ONLY', 'UNKNOWN'] as const;
export type LegoCondition = (typeof LEGO_CONDITIONS)[number];

export const LEGO_MARKETPLACES = ['EBAY_DE', 'EBAY_IT'] as const;
export type LegoMarketplace = (typeof LEGO_MARKETPLACES)[number];

export const LISTING_TYPES = ['FIXED_PRICE', 'AUCTION'] as const;
export type ListingType = (typeof LISTING_TYPES)[number];

export interface Money {
  amount: number;
  currency: string;
}

/** Atributi iz naloge; kar vir ne pove, je izpuščeno. `retired` v 018 nikoli ni izpolnjen (research §3). */
export interface LegoAttributes {
  setNumber?: string;
  setName?: string;
  theme?: string;
  subtheme?: string;
  releaseYear?: number;
  pieceCount?: number;
  retired?: boolean;
  condition: LegoCondition;
  completenessVerified?: boolean;
  boxIncluded?: boolean;
  instructionsIncluded?: boolean;
  listingType?: ListingType;
  sellerCountry?: string;
  shippingCost?: number;
}

/** Katalogni zapis seta (Rebrickable). */
export interface CatalogSet {
  setNumber: string; // normalizirano `NNNNN-V`
  name: string;
  year: number | null;
  themeId: number | null;
  theme: string | null;
  subtheme: string | null;
  pieces: number | null;
  imageUrl: string | null;
  url: string | null;
}

/** Surov oglas, normaliziran iz vira (eBay ali testni vir); vse neznano je `null`. */
export interface RawListing {
  marketplace: LegoMarketplace;
  itemId: string;
  title: string;
  /** Kratek opis, kadar ga vir da v povzetku; sicer `null`. */
  description: string | null;
  price: Money;
  listingType: ListingType;
  endsAt: Date | null;
  bidCount: number | null;
  /** eBay `conditionId` kot niz; `null`, kadar ga vir ne da. */
  conditionId: string | null;
  conditionText: string | null;
  sellerCountry: string | null;
  shipping: Money | null;
  shippingKnown: boolean;
  url: string;
  images: string[];
}

export const IDENTIFICATION_KINDS = ['SET', 'BUNDLE', 'PARTS', 'MINIFIG', 'EMPTY_BOX', 'OTHER', 'UNIDENTIFIED'] as const;
export type IdentificationKind = (typeof IDENTIFICATION_KINDS)[number];

export type IdentificationConfidence = 'high' | 'medium' | 'low' | 'none';

export interface Identification {
  kind: IdentificationKind;
  confidence: IdentificationConfidence;
  /** Slovensko, kratko: zakaj je tako. */
  reason: string;
  needsReview: boolean;
  catalog: {
    setNumber: string;
    name: string;
    theme: string | null;
    subtheme: string | null;
    year: number | null;
    pieces: number | null;
    imageUrl: string | null;
    url: string | null;
  } | null;
}

export type ValuationConfidence = 'high' | 'medium' | 'low' | 'insufficient';

export interface Valuation {
  basis: 'sold';
  newOrUsed: 'N' | 'U' | null;
  currency: string | null;
  average: number | null;
  median: number | null;
  salesCount: number;
  periodMonths: 6;
  confidence: ValuationConfidence;
  stale: boolean;
  /** Aktivne ponudbe — ločeno od prodaj, nikoli vir vrednosti. */
  active: { average: number | null; min: number | null; count: number } | null;
  /** `false` = druga valuta ali neprimerljivo stanje; vrednosti se ne uporabi za primerjavo. */
  comparable: boolean;
  note: string | null;
}

export interface Opportunity {
  /** Vedno `true`: izračun je ocena z dokumentiranimi parametri, ne dejstvo. */
  illustrative: true;
  price: number;
  shipping: number | null;
  taxes: number | null;
  buyerFees: number;
  acquisitionCost: number | null;
  conservativeValue: number | null;
  sellingFees: number | null;
  riskReserve: number | null;
  profit: number | null;
  roi: number | null;
  discountPct: number | null;
  score: number | null;
  /** Kaj preprečuje izračun (npr. `shipping`, `valuation`, `taxes`, `identification`, `condition`). */
  missing: string[];
}

export interface LegoAlerts {
  profitNotified: boolean;
  auctionEndingNotified: boolean;
}

export interface LegoResultData {
  lego: LegoAttributes;
  listing: {
    marketplace: LegoMarketplace;
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
  alerts: LegoAlerts;
}

/** Parametri izračuna priložnosti (odstotki); iz okolja, privzetki dokumentirani. */
export interface OpportunityParams {
  sellingFeePct: number;
  riskReservePct: number;
  conservativeDiscountPct: number;
  buyerFeePct: number;
}

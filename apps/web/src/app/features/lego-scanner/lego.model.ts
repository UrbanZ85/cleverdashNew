// Čiste funkcije prikaza LEGO skenerja (018). Brez Angularja: testabilno brez TestBed
// (tests/unit/lego-model.spec.ts), enak dogovor kot `flight-deals.model.ts`. Oblike so zrcalo pogodbe
// specs/018-lego-scanner/contracts/openapi.yaml (`LegoResultData`, `LegoConfig`).
//
// Pravilo prikaza, ki velja povsod: neznano je "neznano", nikoli 0 ali prazno polje; vsak izračun je
// označen kot ocena; aktivne ponudbe so ločene od prodaj.

import { formatPrice, type Money } from '../../core/scanners/scanners.model.js';

export type LegoCondition = 'NEW_SEALED' | 'NEW_OPEN_BOX' | 'USED_COMPLETE' | 'USED_INCOMPLETE' | 'PARTS_ONLY' | 'UNKNOWN';
export type LegoMarketplace = 'EBAY_DE' | 'EBAY_IT';
export type ListingType = 'FIXED_PRICE' | 'AUCTION';
export type IdentificationKind = 'SET' | 'BUNDLE' | 'PARTS' | 'MINIFIG' | 'EMPTY_BOX' | 'OTHER' | 'UNIDENTIFIED';
export type ValuationConfidence = 'high' | 'medium' | 'low' | 'insufficient';

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

export interface LegoValuation {
  basis: 'sold';
  newOrUsed: 'N' | 'U' | null;
  currency: string | null;
  average: number | null;
  median: number | null;
  salesCount: number;
  periodMonths: number;
  confidence: ValuationConfidence;
  stale: boolean;
  active: { average: number | null; min: number | null; count: number } | null;
  comparable: boolean;
  note: string | null;
}

export interface LegoOpportunity {
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
  missing: string[];
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
  identification: {
    kind: IdentificationKind;
    confidence: 'high' | 'medium' | 'low' | 'none';
    reason: string;
    needsReview: boolean;
    catalog: { setNumber: string; name: string; theme: string | null; subtheme: string | null; year: number | null; pieces: number | null; imageUrl: string | null; url: string | null } | null;
  };
  valuation: LegoValuation | null;
  opportunity: LegoOpportunity;
  alerts: { profitNotified: boolean; auctionEndingNotified: boolean };
}

export interface LegoSources {
  catalog: { enabled: boolean; label: string; reason: string | null };
  prices: { enabled: boolean; label: string; reason: string | null };
  listings: { enabled: boolean; label: string; reason: string | null };
  marketplaces: LegoMarketplace[];
  fake: boolean;
}

/** Podatki rezultata ali `null`, kadar rezultat ni LEGO oblike (npr. stara različica). */
export function readLegoData(data: unknown): LegoResultData | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Partial<LegoResultData>;
  if (!d.lego || !d.listing || !d.identification || !d.opportunity) return null;
  return d as LegoResultData;
}

export const CONDITION_LABELS: Record<LegoCondition, string> = {
  NEW_SEALED: 'Novo, zapečateno',
  NEW_OPEN_BOX: 'Novo, odprta škatla',
  USED_COMPLETE: 'Rabljeno, kompletno',
  USED_INCOMPLETE: 'Rabljeno, nekompletno',
  PARTS_ONLY: 'Samo deli',
  UNKNOWN: 'Stanje ni znano',
};

export function conditionLabel(c: LegoCondition | string | null | undefined): string {
  return c ? (CONDITION_LABELS[c as LegoCondition] ?? String(c)) : '';
}

export function conditionColor(c: LegoCondition): 'success' | 'primary' | 'warning' | 'medium' {
  if (c === 'NEW_SEALED' || c === 'USED_COMPLETE') return 'success';
  if (c === 'NEW_OPEN_BOX') return 'primary';
  if (c === 'USED_INCOMPLETE' || c === 'PARTS_ONLY') return 'warning';
  return 'medium';
}

export const KIND_LABELS: Record<IdentificationKind, string> = {
  SET: 'Set',
  BUNDLE: 'Paket več setov',
  PARTS: 'Posamezni deli',
  MINIFIG: 'Minifigura',
  EMPTY_BOX: 'Prazna škatla',
  OTHER: 'Drugo',
  UNIDENTIFIED: 'Ni prepoznano',
};

export function kindLabel(kind: IdentificationKind | string): string {
  return KIND_LABELS[kind as IdentificationKind] ?? String(kind);
}

export const CONFIDENCE_LABELS: Record<string, string> = { high: 'visoko', medium: 'srednje', low: 'nizko', none: 'brez', insufficient: 'premalo podatkov' };

export function confidenceText(c: string): string {
  return CONFIDENCE_LABELS[c] ?? c;
}

export const MARKETPLACE_LABELS: Record<LegoMarketplace, string> = { EBAY_DE: 'eBay Nemčija', EBAY_IT: 'eBay Italija' };

export function marketplaceLabel(m: LegoMarketplace | string): string {
  return MARKETPLACE_LABELS[m as LegoMarketplace] ?? String(m);
}

/** "Neznana" ni 0: poštnina se izpiše samo, kadar jo je vir povedal. */
export function shippingText(listing: LegoResultData['listing']): string {
  if (!listing.shippingKnown || !listing.shipping) return 'poštnina ni znana';
  return listing.shipping.amount === 0 ? 'brezplačna poštnina' : `poštnina ${formatPrice(listing.shipping)}`;
}

/** Cena oglasa; pri dražbi je to zadnja vidna ponudba, ne končna cena. */
export function priceLabel(listingType: ListingType | undefined, price: Money | null): string {
  if (!price) return '—';
  return listingType === 'AUCTION' ? `${formatPrice(price)} (trenutna ponudba)` : formatPrice(price);
}

export function valueText(v: LegoValuation | null): string {
  if (!v) return 'vrednost ni izračunana';
  if (v.confidence === 'insufficient' || v.average === null) return 'premalo podatkov';
  if (!v.comparable) return 'primerjava ni mogoča';
  return `${formatPrice({ amount: v.average, currency: v.currency ?? 'EUR' })} (${v.salesCount} prodaj, zaupanje ${confidenceText(v.confidence)})`;
}

export function profitText(o: LegoOpportunity): string {
  if (o.profit === null) return 'dobiček ni izračunan';
  const sign = o.profit > 0 ? '+' : '';
  const roi = o.roi !== null ? ` · ROI ${(o.roi * 100).toFixed(1).replace('.', ',')} %` : '';
  return `${sign}${formatPrice({ amount: o.profit, currency: 'EUR' })}${roi} (ocena)`;
}

export function profitColor(o: LegoOpportunity): 'success' | 'danger' | 'medium' {
  if (o.profit === null) return 'medium';
  return o.profit > 0 ? 'success' : 'danger';
}

export function scoreColor(score: number | null): 'success' | 'warning' | 'medium' | 'danger' {
  if (score === null) return 'medium';
  if (score >= 60) return 'success';
  if (score >= 30) return 'warning';
  return 'danger';
}

const MISSING_LABELS: Record<string, string> = {
  identification: 'set ni zanesljivo prepoznan',
  condition: 'stanje ali kompletnost ni preverjena',
  shipping: 'poštnina ni znana',
  taxes: 'davki niso znani (prodajalec izven EU ali neznana država)',
  valuation: 'tržna vrednost ni na voljo ali ni primerljiva',
};

/** Slovenski razlogi, zakaj dobiček ni izračunan. */
export function missingReasons(o: LegoOpportunity): string[] {
  return o.missing.map((m) => MISSING_LABELS[m] ?? m);
}

export interface CalcRow {
  label: string;
  value: string;
  strong?: boolean;
}

/** Izračun po postavkah za podrobnosti; neznane postavke so "neznano", ne 0. */
export function calculationRows(o: LegoOpportunity, currency = 'EUR'): CalcRow[] {
  const m = (n: number | null) => (n === null ? 'neznano' : formatPrice({ amount: n, currency }));
  return [
    { label: 'Cena oglasa', value: m(o.price) },
    { label: 'Poštnina', value: m(o.shipping) },
    { label: 'Davki', value: m(o.taxes) },
    { label: 'Provizija kupca', value: m(o.buyerFees) },
    { label: 'Skupni strošek nakupa', value: m(o.acquisitionCost), strong: true },
    { label: 'Konservativna prodajna vrednost', value: m(o.conservativeValue) },
    { label: 'Provizije prodaje', value: m(o.sellingFees) },
    { label: 'Rezerva za tveganje', value: m(o.riskReserve) },
    { label: 'Potencialni dobiček', value: m(o.profit), strong: true },
  ];
}

export type LegoSort = 'score' | 'profit' | 'price' | 'recent';

export const SORT_LABELS: Record<LegoSort, string> = {
  score: 'Ocena priložnosti',
  profit: 'Ocenjen dobiček',
  price: 'Cena',
  recent: 'Najnovejše',
};

interface Sortable {
  data: unknown;
  price: Money | null;
  firstSeenAt: string;
}

/** Razvrstitev: neznane vrednosti (brez ocene/dobička) vedno na koncu. */
export function sortResults<T extends Sortable>(results: readonly T[], sort: LegoSort): T[] {
  const num = (r: T): number | null => {
    const d = readLegoData(r.data);
    if (sort === 'score') return d?.opportunity.score ?? null;
    if (sort === 'profit') return d?.opportunity.profit ?? null;
    if (sort === 'price') return r.price?.amount ?? null;
    return new Date(r.firstSeenAt).getTime();
  };
  const asc = sort === 'price';
  return [...results].sort((a, b) => {
    const x = num(a);
    const y = num(b);
    if (x === null && y === null) return 0;
    if (x === null) return 1;
    if (y === null) return -1;
    return asc ? x - y : y - x;
  });
}

/** Kratek opis aktivnih ponudb (ločeno od prodaj). */
export function activeText(v: LegoValuation | null): string | null {
  if (!v?.active || v.active.count === 0) return null;
  const parts = [`${v.active.count} aktivnih ponudb`];
  if (v.active.min !== null) parts.push(`najnižja ${formatPrice({ amount: v.active.min, currency: v.currency ?? 'EUR' })}`);
  return `${parts.join(' · ')} (ponudbe niso prodajne cene)`;
}

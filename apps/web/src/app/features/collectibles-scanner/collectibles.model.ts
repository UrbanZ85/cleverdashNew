// Čiste funkcije prikaza zbirateljskega skenerja (019). Brez Angularja: testabilno brez TestBed
// (tests/unit/collectibles-model.spec.ts), enak dogovor kot `lego.model.ts`. Oblike so zrcalo pogodbe
// specs/019-collectibles-scanner/contracts/openapi.yaml (`CollectiblesResultData`, `CollectiblesConfig`).
//
// Pravila prikaza, ki veljajo povsod: neznano je "neznano", nikoli 0 ali prazno polje; vrste cen
// (zahtevane cene, ocena, cenik, preverjene prodaje) so VEDNO označene in se ne mešajo; dobiček je ocena.

import { formatPrice, type Money } from '../../core/scanners/scanners.model.js';

export type Category = 'trading-cards' | 'retro-gaming';
export type Condition = 'NEW' | 'LIKE_NEW' | 'USED' | 'FOR_PARTS' | 'UNKNOWN';
export type Marketplace = 'EBAY_DE' | 'EBAY_IT' | 'EBAY_FR' | 'EBAY_ES';
export type ListingType = 'FIXED_PRICE' | 'AUCTION';
export type PriceBasis = 'asking' | 'estimate' | 'guide' | 'sold';
export type Confidence = 'high' | 'medium' | 'low' | 'insufficient';

export interface CollectibleAttributes {
  category: Category;
  name?: string;
  catalogId?: string;
  edition?: string;
  language?: string;
  region?: string;
  gradingCompany?: string;
  grade?: string;
  originalPackaging?: boolean;
  completeness?: string;
  condition?: Condition;
  sellerCountry?: string;
  card?: { game: string; setName?: string; cardNumber?: string; rarity?: string; finish?: string; graded: boolean | null; sealed: boolean | null };
  retro?: { platform?: string; region?: string; kind?: string; completeness?: string; working?: string | null; reproductionSuspected: boolean | null };
}

export interface Identification {
  kind: string;
  confidence: 'high' | 'medium' | 'low' | 'none';
  reason: string;
  needsReview: boolean;
  variantKey: string | null;
  ambiguities: string[];
  catalog: { id: string; name: string; setName: string | null; number: string | null; rarity: string | null; imageUrl: string | null } | null;
}

export interface Valuation {
  asking: { median: number | null; min: number | null; count: number; currency: string } | null;
  estimate: { value: number; low: number | null; trend: number | null; source: string; updatedAt: string | null; currency: string; basis: 'estimate' | 'guide' } | null;
  sold: { average: number; median: number | null; count: number; periodMonths: number; source: string; currency: string } | null;
  primary: 'sold' | 'guide' | 'estimate' | null;
  confidence: Confidence;
  comparable: boolean;
  stale: boolean;
  note: string | null;
}

export interface Opportunity {
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
  discountBasis: 'sold' | 'guide' | 'estimate' | null;
  profitBasis: 'sold' | null;
  score: number | null;
  missing: string[];
}

export interface CollectiblesResultData {
  collectible: CollectibleAttributes;
  listing: { marketplace: Marketplace; itemId: string; listingType: ListingType; endsAt: string | null; bidCount: number | null; shipping: Money | null; shippingKnown: boolean; images: string[] };
  identification: Identification;
  valuation: Valuation | null;
  opportunity: Opportunity;
  alerts: { profitNotified: boolean; discountNotified: boolean; auctionEndingNotified: boolean };
}

export interface SourceStatus {
  enabled: boolean;
  label: string;
  reason: string | null;
}

export interface CollectiblesSources {
  listings: SourceStatus;
  catalog: SourceStatus;
  prices: SourceStatus;
  marketplaces: Marketplace[];
  fake: boolean;
}

export interface FieldDescriptor {
  key: string;
  label: string;
  kind: 'text' | 'number' | 'select' | 'multiselect' | 'boolean';
  options?: Array<{ value: string; label: string }>;
  help?: string;
}

export interface CategoryDescriptor {
  category: Category;
  label: string;
  fields: FieldDescriptor[];
}

/** Podatki rezultata ali `null`, kadar rezultat ni zbirateljske oblike. */
export function readCollectiblesData(data: unknown): CollectiblesResultData | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Partial<CollectiblesResultData>;
  if (!d.collectible || !d.listing || !d.identification || !d.opportunity) return null;
  return d as CollectiblesResultData;
}

export const CATEGORY_LABELS: Record<Category, string> = { 'trading-cards': 'Kartice', 'retro-gaming': 'Retro igre' };

export function categoryLabel(c: Category | string | null | undefined): string {
  return c ? (CATEGORY_LABELS[c as Category] ?? String(c)) : '';
}

export const CONDITION_LABELS: Record<Condition, string> = { NEW: 'Novo', LIKE_NEW: 'Kot novo', USED: 'Rabljeno', FOR_PARTS: 'Za dele / okvarjeno', UNKNOWN: 'Stanje ni znano' };

export function conditionLabel(c: Condition | string | null | undefined): string {
  return c ? (CONDITION_LABELS[c as Condition] ?? String(c)) : CONDITION_LABELS.UNKNOWN;
}

export function conditionColor(c: Condition | string | null | undefined): 'success' | 'primary' | 'warning' | 'medium' {
  if (c === 'NEW') return 'success';
  if (c === 'LIKE_NEW' || c === 'USED') return 'primary';
  if (c === 'FOR_PARTS') return 'warning';
  return 'medium';
}

export const KIND_LABELS: Record<string, string> = {
  CARD: 'Kartica',
  SEALED: 'Zapečaten izdelek',
  LOT: 'Paket več predmetov',
  PROXY: 'Proxy / reprodukcija',
  GAME: 'Igra',
  CONSOLE: 'Konzola',
  ACCESSORY: 'Dodatek',
  REPRODUCTION: 'Reprodukcija',
  OTHER: 'Drugo',
  UNIDENTIFIED: 'Ni prepoznano',
};

export function kindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind;
}

export const CONFIDENCE_LABELS: Record<string, string> = { high: 'visoko', medium: 'srednje', low: 'nizko', none: 'brez', insufficient: 'premalo podatkov' };

export function confidenceText(c: string): string {
  return CONFIDENCE_LABELS[c] ?? c;
}

export const MARKETPLACE_LABELS: Record<Marketplace, string> = { EBAY_DE: 'eBay Nemčija', EBAY_IT: 'eBay Italija', EBAY_FR: 'eBay Francija', EBAY_ES: 'eBay Španija' };

export function marketplaceLabel(m: Marketplace | string): string {
  return MARKETPLACE_LABELS[m as Marketplace] ?? String(m);
}

const EDITION_LABELS: Record<string, string> = { first: 'prva izdaja', unlimited: 'unlimited', shadowless: 'shadowless', standard: 'standardna izdaja' };
const FINISH_LABELS: Record<string, string> = { holo: 'holo', reverse: 'reverse holo', normal: 'navadna' };
const COMPLETENESS_LABELS: Record<string, string> = { loose: 'loose (samo kartuša/disk)', boxed: 'z embalažo', cib: 'CIB (komplet)', sealed: 'zapečateno' };
const WORKING_LABELS: Record<string, string> = { working: 'delujoče', untested: 'netestirano', 'not-working': 'okvarjeno' };
const LANGUAGE_LABELS: Record<string, string> = { en: 'angleščina', de: 'nemščina', fr: 'francoščina', it: 'italijanščina', es: 'španščina', ja: 'japonščina' };

/** Različica predmeta, kot jo oglas pove; kar ne pove, izpuščeno (nikoli ugibanje). */
export function variantText(c: CollectibleAttributes): string {
  const parts: string[] = [];
  if (c.category === 'trading-cards') {
    if (c.card?.setName) parts.push(c.card.setName + (c.card.cardNumber ? ` #${c.card.cardNumber}` : ''));
    if (c.language) parts.push(LANGUAGE_LABELS[c.language] ?? c.language);
    if (c.edition) parts.push(EDITION_LABELS[c.edition] ?? c.edition);
    if (c.card?.finish) parts.push(FINISH_LABELS[c.card.finish] ?? c.card.finish);
    if (c.gradingCompany) parts.push(`${c.gradingCompany}${c.grade ? ` ${c.grade}` : ''}`);
    else if (c.card?.graded === false) parts.push('neocenjena');
  } else {
    if (c.retro?.platform) parts.push(c.retro.platform.toUpperCase());
    if (c.retro?.region) parts.push(c.retro.region);
    if (c.retro?.completeness) parts.push(COMPLETENESS_LABELS[c.retro.completeness] ?? c.retro.completeness);
    if (c.retro?.working) parts.push(WORKING_LABELS[c.retro.working] ?? c.retro.working);
  }
  return parts.join(' · ');
}

/** "Neznana" ni 0: poštnina se izpiše samo, kadar jo je vir povedal. */
export function shippingText(listing: CollectiblesResultData['listing']): string {
  if (!listing.shippingKnown || !listing.shipping) return 'poštnina ni znana';
  return listing.shipping.amount === 0 ? 'brezplačna poštnina' : `poštnina ${formatPrice(listing.shipping)}`;
}

/** Cena oglasa; pri dražbi je to zadnja vidna ponudba, ne končna cena. */
export function priceLabel(listingType: ListingType | undefined, price: Money | null): string {
  if (!price) return '—';
  return listingType === 'AUCTION' ? `${formatPrice(price)} (trenutna ponudba)` : formatPrice(price);
}

export const BASIS_LABELS: Record<PriceBasis, string> = { asking: 'zahtevane cene', estimate: 'katalogna ocena', guide: 'ocena iz cenika', sold: 'preverjene prodaje' };

/** Vrednost z OZNAKO vrste; nikoli golo število. */
export function valueText(v: Valuation | null): string {
  if (!v) return 'vrednost ni izračunana';
  if (v.confidence === 'insufficient' || v.primary === null) return 'premalo podatkov';
  if (!v.comparable) return 'primerjava ni mogoča';
  if (v.primary === 'sold' && v.sold) {
    const value = v.sold.median ?? v.sold.average;
    return `${formatPrice({ amount: value, currency: v.sold.currency })} (${BASIS_LABELS.sold}: ${v.sold.count}, zaupanje ${confidenceText(v.confidence)})`;
  }
  if (v.estimate) return `${formatPrice({ amount: v.estimate.value, currency: v.estimate.currency })} (${BASIS_LABELS[v.primary]})`;
  return 'premalo podatkov';
}

export function discountText(o: Opportunity): string | null {
  if (o.discountPct === null || o.discountBasis === null) return null;
  const pct = `${Math.abs(o.discountPct).toFixed(1).replace('.', ',')} %`;
  return `${pct} ${o.discountPct >= 0 ? 'pod' : 'nad'} vrednostjo (${BASIS_LABELS[o.discountBasis]})`;
}

export function profitText(o: Opportunity): string {
  if (o.profit === null) return 'dobiček ni izračunan';
  const sign = o.profit > 0 ? '+' : '';
  const roi = o.roi !== null ? ` · ROI ${(o.roi * 100).toFixed(1).replace('.', ',')} %` : '';
  return `${sign}${formatPrice({ amount: o.profit, currency: 'EUR' })}${roi} (ocena iz preverjenih prodaj)`;
}

export function profitColor(o: Opportunity): 'success' | 'danger' | 'medium' {
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
  identification: 'različica ni zanesljivo določena',
  condition: 'stanje ni znano ali je predmet okvarjen',
  shipping: 'poštnina ni znana',
  taxes: 'davki niso znani (prodajalec izven EU ali neznana država)',
  valuation: 'vrednost ni na voljo ali ni primerljiva',
  'sold-prices': 'ni preverjenih prodaj (ocena iz kataloga ali cenika dobička ne da)',
};

/** Slovenski razlogi, zakaj dobiček ni izračunan. */
export function missingReasons(o: Opportunity): string[] {
  return o.missing.map((m) => MISSING_LABELS[m] ?? m);
}

const AMBIGUITY_LABELS: Record<string, string> = {
  language: 'jezik ni naveden',
  edition: 'izdaja ni navedena',
  finish: 'površina (holo/reverse) ni navedena',
  grade: 'ocena ni razvidna',
  region: 'regija ni navedena',
  completeness: 'popolnost (loose/CIB) ni navedena',
  working: 'delovanje ni navedeno',
  card: 'več možnih kartic',
  catalog: 'katalog ni na voljo',
};

export function ambiguityTexts(i: Identification): string[] {
  return i.ambiguities.map((a) => AMBIGUITY_LABELS[a] ?? a);
}

/** Zahtevane cene primerljivih oglasov — ločeno od ocene in prodaj. */
export function askingText(v: Valuation | null): string | null {
  if (!v?.asking || v.asking.count === 0) return null;
  const parts = [`${v.asking.count} primerljivih oglasov`];
  if (v.asking.median !== null) parts.push(`mediana ${formatPrice({ amount: v.asking.median, currency: v.asking.currency })}`);
  if (v.asking.min !== null) parts.push(`najnižja ${formatPrice({ amount: v.asking.min, currency: v.asking.currency })}`);
  return `${parts.join(' · ')} (zahtevane cene niso prodajne cene)`;
}

export interface CalcRow {
  label: string;
  value: string;
  strong?: boolean;
}

/** Izračun po postavkah za podrobnosti; neznane postavke so "neznano", ne 0. */
export function calculationRows(o: Opportunity, currency = 'EUR'): CalcRow[] {
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

export type CollectiblesSort = 'score' | 'discount' | 'profit' | 'price' | 'recent';

export const SORT_LABELS: Record<CollectiblesSort, string> = { score: 'Ocena priložnosti', discount: 'Popust do vrednosti', profit: 'Ocenjen dobiček', price: 'Cena', recent: 'Najnovejše' };

interface Sortable {
  data: unknown;
  price: Money | null;
  firstSeenAt: string;
}

/** Razvrstitev: neznane vrednosti (brez ocene/popusta/dobička) vedno na koncu. */
export function sortResults<T extends Sortable>(results: readonly T[], sort: CollectiblesSort): T[] {
  const num = (r: T): number | null => {
    const d = readCollectiblesData(r.data);
    if (sort === 'score') return d?.opportunity.score ?? null;
    if (sort === 'discount') return d?.opportunity.discountPct ?? null;
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

// ───────────────────────────── obrazec iz opisa kategorije ─────────────────────────────

/** Vrednosti polj kategorije v obliki za obrazec: pot (npr. `cards.grade`) → vrednost. */
export type FieldValues = Record<string, string | number | boolean | string[] | undefined>;

/** Prebere vrednost po poti iz (nested) `config`. */
export function getByPath(source: Record<string, unknown> | null, path: string): unknown {
  let cur: unknown = source;
  for (const part of path.split('.')) {
    if (!cur || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

/** Vrednost je "privzeta" (ne šteje kot kriterij): prazno, `any`, `false`. */
export function isDefaultValue(v: unknown): boolean {
  return v === undefined || v === null || v === '' || v === 'any' || v === false || (Array.isArray(v) && v.length === 0);
}

/** Zgradi podobjekte kategorije (`cards`, `retro`) iz vrednosti polj; privzete vrednosti izpusti. */
export function buildCategoryConfig(fields: readonly FieldDescriptor[], values: FieldValues): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};
  for (const f of fields) {
    const v = values[f.key];
    if (isDefaultValue(v)) continue;
    const [root, ...rest] = f.key.split('.');
    if (!root || rest.length === 0) continue;
    const obj = (out[root] ??= {});
    obj[rest.join('.')] = f.kind === 'number' ? Number(v) : v;
  }
  return out;
}

/** Je nastavljen vsaj en filter kategorije? */
export function hasCategoryFilters(fields: readonly FieldDescriptor[], values: FieldValues): boolean {
  return fields.some((f) => !isDefaultValue(values[f.key]));
}

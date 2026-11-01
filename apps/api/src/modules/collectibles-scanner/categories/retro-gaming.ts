import { z } from 'zod';
import { conditionFromListing } from '../domain/condition.js';
import { canValue } from '../domain/identification.js';
import { identifyRetro, retroSearchText, type RetroIdentifyResult, type RetroProduct } from '../domain/retro-identify.js';
import { RETRO_PLATFORMS } from '../domain/retro-parse.js';
import { normalizeText } from '../domain/text.js';
import { RETRO_COMPLETENESS, RETRO_KINDS, RETRO_WORKING, type CollectibleAttributes, type RawListing } from '../domain/types.js';
import type { FailureCode, RetroPrices } from '../sources/types.js';
import type { CategoryHandler, CategoryRun, FieldDescriptor, IdentifiedListing, ValuationParts } from './types.js';

// Kategorija "retro igre" (019, FR-005): igre in konzole. Katalog/cenik (PriceCharting) je izbiren in
// plačljiv; brez njega je prepoznava samo iz besedila (največ "srednja") in vrednosti ni. Cene
// PriceCharting so CENIK (ocena), ne prodaje: dobiček iz njih se ne izračuna.

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Največ ${max} znakov.`)
    .transform((s) => (s.length === 0 ? undefined : s))
    .optional();

const PLATFORM_IDS = RETRO_PLATFORMS.map((p) => p.id) as [string, ...string[]];

export const retroFilterSchema = z.object({
  platform: z.enum(PLATFORM_IDS).optional(),
  consoleModel: optionalText(60),
  region: z.enum(['PAL', 'NTSC-U', 'NTSC-J', 'any']).default('any'),
  edition: optionalText(60),
  completeness: z.enum([...RETRO_COMPLETENESS, 'any']).default('any'),
  working: z.enum([...RETRO_WORKING, 'any']).default('any'),
  kind: z.enum([...RETRO_KINDS, 'any']).default('any'),
});

export type RetroFilters = z.infer<typeof retroFilterSchema>;

export interface RetroConfigLike {
  keywords?: string | undefined;
  retro: RetroFilters;
}

const COMPLETENESS_LABELS: Record<string, string> = { loose: 'samo kartuša/disk (loose)', boxed: 'z embalažo', cib: 'CIB (komplet v škatli)', sealed: 'zapečateno' };

const fields: FieldDescriptor[] = [
  { key: 'retro.platform', label: 'Platforma', kind: 'select', options: RETRO_PLATFORMS.map((p) => ({ value: p.id, label: p.label })) },
  { key: 'retro.kind', label: 'Vrsta', kind: 'select', options: [{ value: 'any', label: 'Vse' }, { value: 'game', label: 'Igra' }, { value: 'console', label: 'Konzola' }, { value: 'accessory', label: 'Dodatek' }] },
  { key: 'retro.consoleModel', label: 'Model konzole', kind: 'text', help: 'Npr. DMG, Atomic Purple, Slim.' },
  { key: 'retro.region', label: 'Regija', kind: 'select', options: [{ value: 'any', label: 'Vse' }, { value: 'PAL', label: 'PAL' }, { value: 'NTSC-U', label: 'NTSC-U (ZDA)' }, { value: 'NTSC-J', label: 'NTSC-J (Japonska)' }], help: 'Oglas mora regijo izrecno navesti; PAL ni enak NTSC.' },
  { key: 'retro.edition', label: 'Izdaja', kind: 'text' },
  { key: 'retro.completeness', label: 'Popolnost', kind: 'select', options: [{ value: 'any', label: 'Vse' }, ...RETRO_COMPLETENESS.map((c) => ({ value: c, label: COMPLETENESS_LABELS[c]! }))], help: 'Loose ni enako CIB.' },
  { key: 'retro.working', label: 'Delovanje', kind: 'select', options: [{ value: 'any', label: 'Vse' }, { value: 'working', label: 'Delujoče' }, { value: 'untested', label: 'Netestirano' }, { value: 'not-working', label: 'Okvarjeno' }] },
];

interface RetroRef {
  result: RetroIdentifyResult;
  product: RetroProduct | null;
}

const STOP_CODES: ReadonlySet<FailureCode> = new Set(['daily-limit', 'unauthorized', 'rate-limited']);

async function products(run: CategoryRun, text: string, platform: string | null): Promise<RetroProduct[] | null> {
  const source = run.sources.retroPrices;
  if (!source || text === '') return null;
  const stopKey = `stop:${source.id}`;
  if (run.memo.get(stopKey) === true) return null;
  const key = `retro:find:${platform ?? ''}:${text}`;
  if (run.memo.has(key)) return run.memo.get(key) as RetroProduct[];
  if (run.counters.catalogLookups >= run.env.COLLECTIBLES_MAX_CATALOG_LOOKUPS_PER_RUN) return null;
  run.counters.catalogLookups += 1;
  const out = await source.findProducts(run.rt, { text, platform });
  if (!out.ok) {
    run.fail(source.id, out.code, out.message);
    if (STOP_CODES.has(out.code)) run.memo.set(stopKey, true);
    return null;
  }
  run.memo.set(key, out.value);
  return out.value;
}

function attributesOf(listing: RawListing, result: RetroIdentifyResult, product: RetroProduct | null): CollectibleAttributes {
  const { parsed } = result;
  const attrs: CollectibleAttributes = {
    category: 'retro-gaming',
    condition: conditionFromListing('retro-gaming', listing.conditionId),
    listingType: listing.listingType,
    retro: { reproductionSuspected: parsed.reproduction ? true : false },
  };
  if (parsed.platform && attrs.retro) attrs.retro.platform = parsed.platform;
  if (result.region && attrs.retro) attrs.retro.region = result.region;
  if (result.region) attrs.region = result.region;
  if (result.kind && attrs.retro) attrs.retro.kind = result.kind;
  if (result.completeness && attrs.retro) attrs.retro.completeness = result.completeness;
  if (result.completeness) attrs.completeness = result.completeness;
  if (result.completeness === 'cib') attrs.originalPackaging = true;
  else if (result.completeness === 'loose') attrs.originalPackaging = false;
  if (attrs.retro) attrs.retro.working = parsed.working;
  if (product) {
    attrs.catalogId = product.id;
    attrs.name = product.name;
  }
  if (listing.sellerCountry) attrs.sellerCountry = listing.sellerCountry;
  if (listing.endsAt) attrs.auctionEnd = listing.endsAt.toISOString();
  if (parsed.working === 'not-working' && attrs.condition !== 'FOR_PARTS') attrs.condition = 'FOR_PARTS';
  return attrs;
}

function matchesFilters(config: RetroConfigLike, result: RetroIdentifyResult, title: string): boolean {
  const f = config.retro;
  const { parsed } = result;
  if (f.platform && parsed.platform !== f.platform) return false;
  if (f.kind !== 'any' && result.kind !== f.kind) return false;
  if (f.region !== 'any' && result.region !== f.region) return false;
  if (f.completeness !== 'any' && result.completeness !== f.completeness) return false;
  if (f.working !== 'any' && parsed.working !== f.working) return false;
  const text = ` ${normalizeText(title)} `;
  if (f.consoleModel && !text.includes(` ${normalizeText(f.consoleModel)} `)) return false;
  if (f.edition && !text.includes(` ${normalizeText(f.edition)} `)) return false;
  return true;
}

export const retroGamingCategory: CategoryHandler<RetroConfigLike> = {
  id: 'retro-gaming',
  label: 'Retro igre in konzole',
  fields,
  filterSchema: retroFilterSchema,
  filterKey: 'retro',
  ebayCategoryId: undefined,
  sendEbayConditionIds: true,

  searchText(config) {
    const f = config.retro;
    const parts: string[] = [];
    if (f.platform) parts.push(RETRO_PLATFORMS.find((p) => p.id === f.platform)?.label ?? f.platform);
    if (f.consoleModel) parts.push(f.consoleModel);
    if (config.keywords) parts.push(config.keywords);
    if (f.edition) parts.push(f.edition);
    return parts.join(' ');
  },

  hasFilters(config) {
    const f = config.retro;
    return Boolean(f.platform || f.consoleModel || f.region !== 'any' || f.edition || f.completeness !== 'any' || f.working !== 'any' || f.kind !== 'any');
  },

  validate(config) {
    const f = config.retro;
    if (f.kind === 'game' && f.consoleModel) return 'Model konzole ne velja za igre.';
    if (f.kind === 'accessory') return 'Dodatki niso podprti; izberi igre ali konzole.';
    if (f.working !== 'any' && f.kind === 'game') return 'Delovanje se pri igrah ne ocenjuje; izberi konzole.';
    return null;
  },

  describe(config) {
    const f = config.retro;
    const parts: string[] = [];
    if (f.platform) parts.push(RETRO_PLATFORMS.find((p) => p.id === f.platform)?.label ?? f.platform);
    if (f.kind !== 'any') parts.push(f.kind === 'game' ? 'igre' : 'konzole');
    if (f.region !== 'any') parts.push(f.region);
    if (f.completeness !== 'any') parts.push(COMPLETENESS_LABELS[f.completeness] ?? f.completeness);
    if (parts.length === 0) parts.push('retro igre');
    return parts;
  },

  async identify(listings, config, run): Promise<IdentifiedListing[]> {
    const out: IdentifiedListing[] = [];
    for (const listing of listings) {
      if (await run.shouldCancel()) return out;
      const pre = identifyRetro({ title: listing.title, description: listing.description, catalog: null });
      let catalog: RetroProduct[] | null = null;
      // Katalog vprašamo samo za oglase, ki bi bili sicer vredni primerjave (igra ali konzola, ne reprodukcija/paket).
      if ((pre.identification.kind === 'GAME' || pre.identification.kind === 'CONSOLE') && pre.parsed.platform) {
        catalog = await products(run, retroSearchText(listing.title), pre.parsed.platform);
      }
      const result = catalog === null ? pre : identifyRetro({ title: listing.title, description: listing.description, catalog });
      const product = result.identification.catalog && catalog ? (catalog.find((p) => p.id === result.identification.catalog?.id) ?? null) : null;
      out.push({
        listing,
        identification: result.identification,
        collectible: attributesOf(listing, result, product),
        condition: conditionFromListing('retro-gaming', listing.conditionId),
        matchesFilters: matchesFilters(config, result, listing.title),
        ref: { result, product } satisfies RetroRef,
      });
      await run.heartbeat();
    }
    return out;
  },

  async valuate(item, run): Promise<ValuationParts | null> {
    if (!canValue(item.identification)) return null;
    const { result, product } = item.ref as RetroRef;
    const source = run.sources.retroPrices;
    if (!product || !source) return null;
    if (result.parsed.working === 'not-working') return { estimate: null, sold: null, stale: false, note: 'Okvarjen predmet nima primerljive vrednosti.' };
    const key = `retro:prices:${product.id}`;
    let prices: RetroPrices | null;
    let stale = false;
    if (run.memo.has(key)) prices = run.memo.get(key) as RetroPrices | null;
    else {
      if (run.counters.valuations >= run.env.COLLECTIBLES_MAX_VALUATIONS_PER_RUN) return null;
      if (run.memo.get(`stop:${source.id}`) === true) return null;
      run.counters.valuations += 1;
      const out = await source.getPrices(run.rt, product);
      if (!out.ok) {
        run.fail(source.id, out.code, out.message);
        if (STOP_CODES.has(out.code)) run.memo.set(`stop:${source.id}`, true);
        run.memo.set(key, null);
        return null;
      }
      prices = out.value;
      stale = out.stale;
      run.memo.set(key, prices);
    }
    if (!prices) return null;
    const c = result.completeness;
    const quote = c === 'loose' ? prices.loose : c === 'cib' ? prices.cib : c === 'sealed' ? prices.sealed : null;
    if (!quote) return { estimate: null, sold: null, stale, note: 'Cenik nima cene za to popolnost embalaže.' };
    if (prices.basis === 'sold' && quote.count !== null && quote.count > 0) {
      return { estimate: null, sold: { average: quote.value, median: null, count: quote.count, periodMonths: prices.periodMonths ?? 6, source: source.label, currency: prices.currency }, stale, note: null };
    }
    return { estimate: { value: quote.value, low: null, trend: null, source: source.label, updatedAt: prices.updatedAt, currency: prices.currency, basis: 'guide' }, sold: null, stale, note: null };
  },

  riskReservePct(item, env) {
    const { result } = item.ref as RetroRef;
    let pct = env.COLLECTIBLES_RISK_RESERVE_PCT_RETRO;
    // Reprodukcije so najpogostejše pri kartušah brez škatle (FR-021).
    if (result.completeness === 'loose') pct += env.COLLECTIBLES_RISK_REPRO_SUSPECT_PCT;
    return pct;
  },
};

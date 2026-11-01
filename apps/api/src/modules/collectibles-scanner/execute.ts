import { Types } from 'mongoose';
import { ScannerResultModel } from '../../platform/scanner/models/scanner-result.model.js';
import { comparableHash, detectChange } from '../../platform/scanner/domain/change-detection.js';
import { identityKeyOf } from '../../platform/scanner/domain/identity.js';
import type { ExecutionContext, ExecutionOutcome, Money, NormalizedResult, ScannerEvent } from '../../platform/scanner/types.js';
import { getCategory } from './categories/registry.js';
import type { CategoryRun, IdentifiedListing } from './categories/types.js';
import { collectiblesConfigSchema, type CollectiblesConfig } from './config.js';
import { ebayConditionIds } from './domain/condition.js';
import { askingStatsFor, type ComparableInput } from './domain/comparables.js';
import { canValue } from './domain/identification.js';
import { planCollectiblesEvent, type EventReason } from './events.js';
import { evaluateOpportunity } from './domain/opportunity.js';
import { hasWord, normalizeText } from './domain/text.js';
import type { CollectiblesAlerts, CollectiblesResultData, OpportunityParams, RawListing, Valuation } from './domain/types.js';
import { buildValuation } from './domain/valuation.js';
import { createRuntime, resolveSources, type RuntimeOptions } from './sources/index.js';
import type { FailureCode, SourceRuntime } from './sources/types.js';

// Cevovod zagona zbirateljskega skenerja (019, plan.md). Teče za EN skener (`single`); urnik, zagon, utrip,
// preklic, dopisi in AI so v jedru. Koraki:
//   1. oglasi (eBay po tržnicah)  →  2. filtri brez prepoznave  →  3. prepoznava kategorije (katalog)
//   →  4. filtri kategorije in stanja  →  5. vrednotenje (zahtevane cene + ocena/cenik/prodaje, ločeno)
//   →  6. priložnost  →  7. filtri po vrednosti  →  8. dogodki (prag, dražba)  →  9. generična shramba.
// Vsak vir je neodvisen: izpad kataloga ali cenika zagona ne ruši (rezultati so z manj podatki in to
// povedo), izpad vira OGLASOV pa zagon konča kot neuspešen — brez oglasov ni kaj primerjati, in
// nedosegljivosti se ob napaki vira ne ugotavlja (`sourceSucceeded: false`).

/** Možnosti za teste (`ctx.typeOptions`). */
export type CollectiblesTypeOptions = RuntimeOptions;

const DELIVERY_COUNTRY = 'SI';
export const ALLOWED_RESULT_HOSTS = ['ebay.de', 'ebay.it', 'ebay.fr', 'ebay.es', 'ebay.com'] as const;

type RunError = ExecutionOutcome['errors'][number];

interface Candidate {
  item: IdentifiedListing;
  identity: string;
  data: CollectiblesResultData;
}

function baseParams(env: ExecutionContext['env'], riskReservePct: number): OpportunityParams {
  return {
    sellingFeePct: env.COLLECTIBLES_SELLING_FEE_PCT,
    riskReservePct,
    conservativeDiscountPct: env.COLLECTIBLES_CONSERVATIVE_DISCOUNT_PCT,
    buyerFeePct: env.COLLECTIBLES_BUYER_FEE_PCT,
  };
}

function excluded(title: string, keywords: readonly string[]): boolean {
  if (keywords.length === 0) return false;
  const text = normalizeText(title);
  return keywords.some((k) => {
    const n = normalizeText(k);
    return n !== '' && hasWord(text, n);
  });
}

export async function executeCollectibles(ctx: ExecutionContext<CollectiblesConfig>): Promise<ExecutionOutcome> {
  const { definition, results, env, logger } = ctx;
  const failed = (code: string, message: string): ExecutionOutcome => ({
    status: 'failed',
    counters: {},
    definitions: definition ? [{ definitionId: definition.id, ownerId: definition.userId, outcome: 'failed', message }] : [],
    events: [],
    errors: [{ ...(definition ? { definitionId: definition.id } : {}), code, message }],
  });
  if (!definition || !results) return failed('collectibles:no-definition', 'Zbirateljski skener teče samo na skener z generično shrambo.');
  // Shranjena nastavitev se ob vsakem zagonu znova preveri in dopolni s privzetki (starejši zapisi, ročni popravki baze).
  const parsedConfig = collectiblesConfigSchema.safeParse(definition.config);
  if (!parsedConfig.success) {
    return failed('collectibles:invalid-config', `Nastavitve skenerja niso veljavne (neznana ali neveljavna kategorija?): ${parsedConfig.error.issues[0]?.message ?? 'neznana napaka'}`);
  }
  const config = parsedConfig.data;
  const category = getCategory(config.category);
  const options = (ctx.typeOptions ?? {}) as CollectiblesTypeOptions;

  const sources = resolveSources(env);
  if (!sources.listings) {
    return failed('collectibles:no-listing-source', `Noben vir oglasov ni vklopljen: ${sources.reasons.listings ?? 'ni nastavljen'}. Nastavi ključe v okolju strežnika.`);
  }
  const rt: SourceRuntime = createRuntime({ env, logger, now: ctx.now, runIndex: ctx.previousRunCount + 1 }, options);
  const errors: RunError[] = [];
  const reported = new Set<string>();
  const fail = (source: string, code: FailureCode, message: string) => {
    const key = `${source}:${code}`;
    if (reported.has(key)) return;
    reported.add(key);
    errors.push({ definitionId: definition.id, code: `collectibles:${code}:${source}`, message });
  };
  const run: CategoryRun = {
    env,
    rt,
    sources,
    fail,
    heartbeat: () => ctx.heartbeat(),
    shouldCancel: () => ctx.shouldCancel(),
    memo: new Map(),
    counters: { catalogLookups: 0, valuations: 0 },
  };
  const counters = { listings: 0, dropped: 0, identified: 0, needsReview: 0, valued: 0, withEstimate: 0, withProfit: 0, events: 0, catalogLookups: 0, valuations: 0 } satisfies Record<string, number>;

  // ── 1. oglasi ─────────────────────────────────────────────────────────────
  const raw: RawListing[] = [];
  let sourceSucceeded = true;
  for (const marketplace of config.marketplaces) {
    const out = await sources.listings.search(rt, {
      marketplace,
      q: category.searchText(config),
      ...(category.ebayCategoryId ? { categoryId: category.ebayCategoryId } : {}),
      ...(config.minPrice !== undefined ? { minPrice: config.minPrice } : {}),
      ...(config.maxPrice !== undefined ? { maxPrice: config.maxPrice } : {}),
      currency: config.currency,
      conditionIds: category.sendEbayConditionIds ? ebayConditionIds(config.conditions) : null,
      listingTypes: config.listingTypes,
      sellerCountries: config.sellerCountries,
      deliveryCountry: DELIVERY_COUNTRY,
      maxPages: env.COLLECTIBLES_EBAY_MAX_PAGES,
    });
    if (!out.ok) {
      sourceSucceeded = false;
      fail(sources.listings.id, out.code, out.message);
      continue;
    }
    raw.push(...out.value);
    await ctx.heartbeat();
  }
  if (await ctx.shouldCancel()) return { status: 'cancelled', counters, definitions: [], events: [], errors };
  if (!sourceSucceeded && raw.length === 0) {
    return { status: 'failed', counters, definitions: [{ definitionId: definition.id, ownerId: definition.userId, outcome: 'failed', message: errors[0]?.message ?? 'Vir oglasov ni odgovoril.' }], events: [], errors };
  }

  // ── 2. filtri brez prepoznave ────────────────────────────────────────────
  const byId = new Map<string, RawListing>();
  for (const l of raw) byId.set(`${l.marketplace}:${l.itemId}`, l);
  const listings = [...byId.values()].filter((l) => {
    if (!config.listingTypes.includes(l.listingType)) return false;
    if (excluded(l.title, config.excludedKeywords)) return false;
    const priced = config.minPrice !== undefined || config.maxPrice !== undefined;
    if (priced && l.price.currency !== config.currency) return false; // primerjave ni mogoče
    if (config.minPrice !== undefined && l.price.amount < config.minPrice) return false;
    if (config.maxPrice !== undefined && l.price.amount > config.maxPrice) return false;
    if (config.sellerCountries.length > 0 && (l.sellerCountry === null || !config.sellerCountries.includes(l.sellerCountry))) return false;
    if (config.maxShipping !== undefined && !(l.shippingKnown && l.shipping && l.shipping.currency === l.price.currency && l.shipping.amount <= config.maxShipping)) return false;
    return true;
  });
  counters.listings = listings.length;
  counters.dropped = byId.size - listings.length;

  // ── 3. prepoznava (katalog) ──────────────────────────────────────────────
  const identified = await category.identify(listings, config, run);
  await ctx.heartbeat();
  if (await ctx.shouldCancel()) return { status: 'cancelled', counters, definitions: [], events: [], errors };

  // ── 4. filtri kategorije in stanja (kar ni preverljivo, ne ustreza — nič se ne domneva) ──
  const matching = identified.filter((i) => i.matchesFilters && (config.conditions.length === 0 || config.conditions.includes(i.condition)));
  counters.dropped += identified.length - matching.length;
  for (const i of matching) {
    if (canValue(i.identification)) counters.identified += 1;
    if (i.identification.needsReview) counters.needsReview += 1;
  }

  // ── 5. vrednotenje: zahtevane cene (iz zagona), ocena/cenik/prodaje (iz virov) — ločeno ──
  const comparables: ComparableInput[] = matching.map((i) => ({ id: `${i.listing.marketplace}:${i.listing.itemId}`, variantKey: i.identification.variantKey, price: i.listing.price, listingType: i.listing.listingType }));
  const candidates: Candidate[] = [];
  for (const item of matching) {
    if (await ctx.shouldCancel()) return { status: 'cancelled', counters, definitions: [], events: [], errors };
    const l = item.listing;
    const identity = `${l.marketplace}:${l.itemId}`;
    const ok = canValue(item.identification);
    const parts = ok ? await category.valuate(item, run) : null;
    const self = comparables.find((c) => c.id === identity)!;
    const valuation: Valuation = buildValuation({
      listingCurrency: l.price.currency,
      identified: ok,
      notIdentifiedReason: item.identification.needsReview ? 'ročni pregled' : item.identification.ambiguities.length > 0 ? `oglas ne pove: ${item.identification.ambiguities.join(', ')}` : item.identification.reason,
      asking: ok ? askingStatsFor(self, comparables) : null,
      estimate: parts?.estimate ?? null,
      sold: parts?.sold ?? null,
      stale: parts?.stale ?? false,
      extraNote: parts?.note ?? null,
    });

    // ── 6. priložnost ──
    const opportunity = evaluateOpportunity({
      price: l.price,
      shipping: l.shipping,
      shippingKnown: l.shippingKnown,
      sellerCountry: l.sellerCountry,
      condition: item.condition,
      identified: ok,
      valuation,
      params: baseParams(env, category.riskReservePct(item, env)),
    });
    const data: CollectiblesResultData = {
      collectible: item.collectible,
      listing: {
        marketplace: l.marketplace,
        itemId: l.itemId,
        listingType: l.listingType,
        endsAt: l.endsAt ? l.endsAt.toISOString() : null,
        bidCount: l.bidCount,
        shipping: l.shippingKnown ? l.shipping : null,
        shippingKnown: l.shippingKnown,
        images: l.images,
      },
      identification: item.identification,
      valuation,
      opportunity,
      alerts: { profitNotified: false, discountNotified: false, auctionEndingNotified: false },
    };

    // ── 7. filtri po vrednosti ──
    if (config.minDiscountPct !== undefined && !(opportunity.discountPct !== null && opportunity.discountPct >= config.minDiscountPct)) continue;
    if (config.minProfit !== undefined && !(opportunity.profit !== null && opportunity.profit >= config.minProfit)) continue;
    if (valuation.primary !== null && valuation.comparable) counters.valued += 1;
    if (valuation.primary === 'estimate' || valuation.primary === 'guide') counters.withEstimate += 1;
    if (opportunity.profit !== null) counters.withProfit += 1;
    candidates.push({ item, identity, data });
  }
  counters.dropped += matching.length - candidates.length;
  counters.catalogLookups = run.counters.catalogLookups;
  counters.valuations = run.counters.valuations;

  // ── 8. dogodki: obstoječe stanje → zastavice in razlogi ──────────────────
  const keys = candidates.map((c) => identityKeyOf(c.identity));
  const existing = new Map<string, { price: Money | null; hash: string | null; alerts: CollectiblesAlerts | null }>();
  if (keys.length > 0) {
    const rows = await ScannerResultModel.find({ definitionId: new Types.ObjectId(definition.id), identityKey: { $in: keys } })
      .select('identityKey price comparableHash data')
      .lean<Array<{ identityKey: string; price: Money | null; comparableHash: string | null; data: { alerts?: CollectiblesAlerts } | null }>>();
    for (const r of rows) existing.set(r.identityKey, { price: r.price, hash: r.comparableHash, alerts: r.data?.alerts ?? null });
  }
  const plans = new Map<string, { reasons: EventReason[]; changeType: NonNullable<ReturnType<typeof planCollectiblesEvent>['changeType']> }>();
  const items: NormalizedResult[] = [];
  for (const c of candidates) {
    const l = c.item.listing;
    const identityKey = identityKeyOf(c.identity);
    const comparable = { variantKey: c.item.identification.variantKey, kind: c.item.identification.kind, condition: c.item.condition, listingType: l.listingType };
    const hash = comparableHash(comparable);
    const prev = existing.get(identityKey) ?? null;
    const change = detectChange({ exists: prev !== null, existingPrice: prev?.price ?? null, existingHash: prev?.hash ?? null, incomingPrice: l.price, incomingHash: hash });
    const plan = planCollectiblesEvent({
      isNew: prev === null,
      change,
      comparableChanged: prev !== null && prev.hash !== null && prev.hash !== hash,
      profit: c.data.opportunity.profit,
      discountPct: c.data.opportunity.discountPct,
      notifyMinProfit: config.notifyMinProfit,
      notifyMinDiscountPct: config.notifyMinDiscountPct,
      listingType: l.listingType,
      endsAt: l.endsAt,
      now: ctx.now,
      auctionEndingHours: config.auctionEndingHours,
      previous: prev?.alerts ?? null,
    });
    c.data.alerts = plan.alerts;
    if (plan.changeType && definition.notifications.enabled) plans.set(identityKey, { reasons: plan.reasons, changeType: plan.changeType });
    items.push({
      identity: c.identity,
      source: sources.fake ? 'fake' : `ebay:${l.marketplace}`,
      externalId: l.itemId,
      title: l.title,
      url: l.url,
      price: l.price,
      data: c.data,
      comparable,
      ...(l.listingType === 'AUCTION' && l.endsAt ? { expiresAt: new Date(l.endsAt.getTime() + 7 * 86_400_000) } : {}),
    });
  }

  // ── 9. shramba ───────────────────────────────────────────────────────────
  const stored = await results.reconcile(items, { sourceSucceeded, allowedHosts: ALLOWED_RESULT_HOSTS });
  const events: ScannerEvent[] = [];
  if (plans.size > 0) {
    const rows = await ScannerResultModel.find({ definitionId: new Types.ObjectId(definition.id), identityKey: { $in: [...plans.keys()] } })
      .select('identityKey')
      .lean<Array<{ _id: Types.ObjectId; identityKey: string }>>();
    const idByKey = new Map(rows.map((r) => [r.identityKey, String(r._id)]));
    for (const c of candidates) {
      const identityKey = identityKeyOf(c.identity);
      const plan = plans.get(identityKey);
      const resultRef = idByKey.get(identityKey);
      if (!plan || !resultRef) continue;
      const l = c.item.listing;
      const v = c.data.valuation;
      const opp = c.data.opportunity;
      events.push({
        definitionId: definition.id,
        definitionName: definition.name,
        ownerId: definition.userId,
        recipients: [definition.userId],
        resultRef,
        changeType: plan.changeType,
        payload: {
          resultId: resultRef,
          title: l.title,
          url: l.url,
          imageUrl: l.images[0] ?? null,
          price: l.price,
          shipping: c.data.listing.shipping,
          marketplace: l.marketplace,
          category: config.category,
          name: c.data.collectible.name ?? null,
          condition: c.item.condition,
          listingType: l.listingType,
          endsAt: c.data.listing.endsAt,
          valuation: v && v.comparable && v.primary ? { primary: v.primary, confidence: v.confidence } : null,
          discountPct: opp.discountPct,
          discountBasis: opp.discountBasis,
          profit: opp.profit,
          roi: opp.roi,
          reasons: plan.reasons,
        },
      });
    }
  }
  counters.events = events.length;

  const partial = errors.length > 0;
  return {
    status: partial ? 'partial' : 'succeeded',
    counters: { ...counters, ...stored.counters },
    definitions: [{ definitionId: definition.id, ownerId: definition.userId, outcome: 'ok', message: partial ? (errors[0]?.message ?? null) : null }],
    events,
    errors,
  };
}

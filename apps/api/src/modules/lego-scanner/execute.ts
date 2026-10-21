import { Types } from 'mongoose';
import { ScannerResultModel } from '../../platform/scanner/models/scanner-result.model.js';
import { comparableHash, detectChange } from '../../platform/scanner/domain/change-detection.js';
import { identityKeyOf } from '../../platform/scanner/domain/identity.js';
import type { ExecutionContext, ExecutionOutcome, Money, NormalizedResult, ScannerEvent } from '../../platform/scanner/types.js';
import { ebayConditionIds, legoConfigSchema, type LegoConfig } from './config.js';
import { classifyCondition } from './domain/condition.js';
import { classifyListing } from './domain/classify.js';
import { canValue, identifyListing, type CatalogLookup } from './domain/identify.js';
import { evaluateOpportunity } from './domain/opportunity.js';
import { extractSetNumbers, normalizeName } from './domain/set-number.js';
import type { CatalogSet, LegoAlerts, LegoResultData, OpportunityParams, RawListing, Valuation } from './domain/types.js';
import { guideFor, valuate } from './domain/valuation.js';
import { planEvent, type EventReason } from './events.js';
import { createRuntime, resolveSources, type RuntimeOptions } from './sources/index.js';
import type { FailureCode, SourceOutcome, SourceRuntime } from './sources/types.js';

// Cevovod zagona LEGO skenerja (018, plan.md). Teče za EN skener (`single`); urnik, zagon, utrip,
// preklic, dopisi in AI so v jedru. Koraki:
//   1. oglasi (eBay po tržnicah)  →  2. filtri, ki ne potrebujejo kataloga  →  3. identifikacija
//   (katalog)  →  4. filtri po katalogu  →  5. vrednotenje (cenik, meja na zagon)  →  6. priložnost
//   →  7. filtri po vrednosti  →  8. dogodki (prag, dražba)  →  9. generična shramba.
// Vsak vir je neodvisen: izpad kataloga ali cenika zagona ne ruši (rezultati so z manj podatki in to
// povedo), izpad vira OGLASOV pa zagon konča kot neuspešen — brez oglasov ni kaj primerjati, in
// nedosegljivosti se ob napaki vira ne ugotavlja (`sourceSucceeded: false`).

/** Možnosti za teste (`ctx.typeOptions`). */
export type LegoTypeOptions = RuntimeOptions;

const MAX_NUMBER_LOOKUPS = 80;
const PRICE_CURRENCY = 'EUR';
const DELIVERY_COUNTRY = 'SI';

type RunError = ExecutionOutcome['errors'][number];

function opportunityParams(env: ExecutionContext['env']): OpportunityParams {
  return {
    sellingFeePct: env.LEGO_SELLING_FEE_PCT,
    riskReservePct: env.LEGO_RISK_RESERVE_PCT,
    conservativeDiscountPct: env.LEGO_CONSERVATIVE_DISCOUNT_PCT,
    buyerFeePct: env.LEGO_BUYER_FEE_PCT,
  };
}

/** Iskalni niz za vir oglasov: številka seta (brez različice) ali ključne besede, vedno z "LEGO". */
export function searchText(config: LegoConfig): string {
  const parts = ['LEGO'];
  if (config.setNumber) parts.push(config.setNumber.replace(/-\d+$/, ''));
  if (config.keywords) parts.push(config.keywords);
  if (!config.setNumber && !config.keywords) {
    // Samo tema: podtema se redko pojavi v naslovu oglasa, zato jo uveljavi katalog (filter po identifikaciji).
    if (config.theme) parts.push(config.theme);
  }
  return parts.join(' ');
}

function sameText(a: string | null, b: string): boolean {
  return a !== null && normalizeName(a).includes(normalizeName(b));
}

interface Candidate {
  listing: RawListing;
  identity: string;
  data: LegoResultData;
}

export async function executeLego(ctx: ExecutionContext<LegoConfig>): Promise<ExecutionOutcome> {
  const { definition, results, env, logger } = ctx;
  const failed = (code: string, message: string): ExecutionOutcome => ({
    status: 'failed',
    counters: {},
    definitions: definition ? [{ definitionId: definition.id, ownerId: definition.userId, outcome: 'failed', message }] : [],
    events: [],
    errors: [{ ...(definition ? { definitionId: definition.id } : {}), code, message }],
  });
  if (!definition || !results) return failed('lego:no-definition', 'LEGO skener teče samo na skener z generično shrambo.');
  // Shranjena nastavitev se ob vsakem zagonu znova preveri in dopolni s privzetki (starejši zapisi, ročni popravki baze).
  const parsedConfig = legoConfigSchema.safeParse(definition.config);
  if (!parsedConfig.success) return failed('lego:invalid-config', `Nastavitve skenerja niso veljavne: ${parsedConfig.error.issues[0]?.message ?? 'neznana napaka'}`);
  const config = parsedConfig.data;
  const options = (ctx.typeOptions ?? {}) as LegoTypeOptions;

  const sources = resolveSources(env);
  if (!sources.listings) {
    return failed('lego:no-listing-source', `Noben vir oglasov ni vklopljen: ${sources.reasons.listings ?? 'ni nastavljen'}. Nastavi ključe v okolju strežnika.`);
  }
  const rt: SourceRuntime = createRuntime({ env, logger, now: ctx.now, runIndex: ctx.previousRunCount + 1 }, options);
  const errors: RunError[] = [];
  const reported = new Set<string>();
  const fail = (source: string, code: FailureCode, message: string) => {
    const key = `${source}:${code}`;
    if (reported.has(key)) return;
    reported.add(key);
    errors.push({ definitionId: definition.id, code: `lego:${code}:${source}`, message });
  };
  const counters = { listings: 0, dropped: 0, identified: 0, needsReview: 0, notSets: 0, valuations: 0, valued: 0, withProfit: 0, events: 0 } satisfies Record<string, number>;

  // ── 1. oglasi ─────────────────────────────────────────────────────────────
  const raw: RawListing[] = [];
  let sourceSucceeded = true;
  for (const marketplace of config.marketplaces) {
    const out = await sources.listings.search(rt, {
      marketplace,
      q: searchText(config),
      ...(config.minPrice !== undefined ? { minPrice: config.minPrice } : {}),
      ...(config.maxPrice !== undefined ? { maxPrice: config.maxPrice } : {}),
      currency: config.currency,
      conditionIds: ebayConditionIds(config.conditions),
      listingTypes: config.listingTypes,
      sellerCountries: config.sellerCountries,
      deliveryCountry: DELIVERY_COUNTRY,
      maxPages: env.LEGO_EBAY_MAX_PAGES,
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

  // ── 2. filtri brez kataloga ──────────────────────────────────────────────
  const byId = new Map<string, RawListing>();
  for (const l of raw) byId.set(`${l.marketplace}:${l.itemId}`, l);
  const listings = [...byId.values()].filter((l) => {
    if (!config.listingTypes.includes(l.listingType)) return false;
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

  // ── 3. identifikacija (katalog) ──────────────────────────────────────────
  const catalogByNumber = new Map<string, CatalogLookup>();
  const nameResults = new Map<string, CatalogSet[]>();
  let catalogStopped = false;
  let numberLookups = 0;
  let nameLookups = 0;
  const catalog = sources.catalog;
  const stopOn = (out: Extract<SourceOutcome<unknown>, { ok: false }>) => {
    fail(catalog!.id, out.code, out.message);
    if (out.code === 'daily-limit' || out.code === 'unauthorized' || out.code === 'rate-limited') catalogStopped = true;
  };

  for (const l of listings) {
    if (await ctx.shouldCancel()) return { status: 'cancelled', counters, definitions: [], events: [], errors };
    const classified = classifyListing(l.title, l.description);
    if (classified.kind !== 'CANDIDATE') continue;
    const [number] = classified.numbers;
    if (number && catalog && !catalogStopped && !catalogByNumber.has(number) && numberLookups < MAX_NUMBER_LOOKUPS) {
      numberLookups += 1;
      const out = await catalog.getSet(rt, number);
      if (out.ok) catalogByNumber.set(number, out.value);
      else stopOn(out);
    } else if (!number && catalog && !catalogStopped && nameLookups < env.LEGO_MAX_NAME_LOOKUPS_PER_RUN) {
      const q = normalizeName(l.title).split(' ').slice(0, 6).join(' ');
      if (q.length >= 3 && !nameResults.has(q)) {
        nameLookups += 1;
        const out = await catalog.searchByName(rt, q);
        if (out.ok) nameResults.set(q, out.value);
        else stopOn(out);
      }
    }
  }
  await ctx.heartbeat();

  const candidates: Candidate[] = [];
  for (const l of listings) {
    const text = l.description ? `${l.title} ${l.description}` : l.title;
    const q = normalizeName(l.title).split(' ').slice(0, 6).join(' ');
    const identification = identifyListing({
      title: l.title,
      description: l.description,
      catalogByNumber,
      nameCandidates: nameResults.get(q) ?? [],
      nameSearched: nameResults.has(q),
    });
    const cond = classifyCondition({ conditionId: l.conditionId, conditionText: l.conditionText, text });
    const catalogSet = identification.catalog;
    const numbers = extractSetNumbers(l.title);

    // ── 4. filtri po katalogu (kar ni preverljivo, ne ustreza — nič se ne domneva) ──
    if (config.setNumber) {
      const matches = catalogSet?.setNumber === config.setNumber || numbers.includes(config.setNumber);
      if (!matches) continue;
    }
    if (config.theme && !(catalogSet && sameText(catalogSet.theme, config.theme))) continue;
    if (config.subtheme && !(catalogSet && sameText(catalogSet.subtheme, config.subtheme))) continue;
    if (config.minYear !== undefined && !(catalogSet?.year != null && catalogSet.year >= config.minYear)) continue;
    if (config.maxYear !== undefined && !(catalogSet?.year != null && catalogSet.year <= config.maxYear)) continue;
    if (config.conditions.length > 0 && !config.conditions.includes(cond.condition)) continue;

    const data: LegoResultData = {
      lego: {
        ...(catalogSet ? { setNumber: catalogSet.setNumber, setName: catalogSet.name } : numbers[0] && identification.kind === 'SET' ? { setNumber: numbers[0] } : {}),
        ...(catalogSet?.theme ? { theme: catalogSet.theme } : {}),
        ...(catalogSet?.subtheme ? { subtheme: catalogSet.subtheme } : {}),
        ...(catalogSet?.year != null ? { releaseYear: catalogSet.year } : {}),
        ...(catalogSet?.pieces != null ? { pieceCount: catalogSet.pieces } : {}),
        condition: cond.condition,
        ...(cond.completenessVerified !== undefined ? { completenessVerified: cond.completenessVerified } : {}),
        ...(cond.boxIncluded !== undefined ? { boxIncluded: cond.boxIncluded } : {}),
        ...(cond.instructionsIncluded !== undefined ? { instructionsIncluded: cond.instructionsIncluded } : {}),
        listingType: l.listingType,
        ...(l.sellerCountry ? { sellerCountry: l.sellerCountry } : {}),
        ...(l.shippingKnown && l.shipping ? { shippingCost: l.shipping.amount } : {}),
      },
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
      identification,
      valuation: null,
      opportunity: evaluateOpportunity({ price: l.price, shipping: l.shipping, shippingKnown: l.shippingKnown, sellerCountry: l.sellerCountry, condition: cond.condition, identified: false, valuation: null, params: opportunityParams(env) }),
      alerts: { profitNotified: false, auctionEndingNotified: false },
    };
    candidates.push({ listing: l, identity: `${l.marketplace}:${l.itemId}`, data });
    if (identification.kind === 'SET') counters.identified += 1;
    else counters.notSets += 1;
    if (identification.needsReview) counters.needsReview += 1;
  }
  if (await ctx.shouldCancel()) return { status: 'cancelled', counters, definitions: [], events: [], errors };

  // ── 5. vrednotenje (cenik, ena poizvedba na (set, novo/rabljeno), meja na zagon) ──
  const valuations = new Map<string, Valuation | null>();
  const prices = sources.prices;
  let pricesStopped = false;
  for (const c of candidates) {
    const id = c.data.identification;
    const setNumber = id.catalog?.setNumber;
    if (!canValue(id) || !setNumber) continue;
    const guide = guideFor(c.data.lego.condition);
    if ('skip' in guide) {
      c.data.valuation = null;
      continue;
    }
    if (!prices) continue;
    const key = `${setNumber}:${guide.newOrUsed}`;
    if (!valuations.has(key)) {
      if (pricesStopped || valuations.size >= env.LEGO_MAX_VALUATIONS_PER_RUN) continue;
      counters.valuations += 1;
      const sold = await prices.getPriceGuide(rt, setNumber, guide.newOrUsed, 'sold', PRICE_CURRENCY);
      if (!sold.ok) {
        fail(prices.id, sold.code, sold.message);
        if (sold.code === 'daily-limit' || sold.code === 'unauthorized' || sold.code === 'rate-limited') pricesStopped = true;
        valuations.set(key, null);
        continue;
      }
      const stock = await prices.getPriceGuide(rt, setNumber, guide.newOrUsed, 'stock', PRICE_CURRENCY);
      valuations.set(key, valuate({ sold: sold.value, stock: stock.ok ? stock.value : null, newOrUsed: guide.newOrUsed, listingCurrency: PRICE_CURRENCY, stale: sold.stale }));
      await ctx.heartbeat();
    }
    const base = valuations.get(key) ?? null;
    // Primerljivost je lastnost PARA (cenik, oglas): oglas v drugi valuti ne dobi primerjave.
    c.data.valuation = base ? { ...base, comparable: base.comparable && c.listing.price.currency === base.currency } : null;
    if (c.data.valuation && c.data.valuation.comparable !== base?.comparable && !c.data.valuation.note) {
      c.data.valuation.note = `Valuta oglasa (${c.listing.price.currency}) ni valuta cenika (${base?.currency ?? PRICE_CURRENCY}); primerjava ni mogoča.`;
    }
  }

  // ── 6. priložnost + 7. filtri po vrednosti ───────────────────────────────
  const kept: Candidate[] = [];
  for (const c of candidates) {
    const l = c.listing;
    c.data.opportunity = evaluateOpportunity({
      price: l.price,
      shipping: l.shipping,
      shippingKnown: l.shippingKnown,
      sellerCountry: l.sellerCountry,
      condition: c.data.lego.condition,
      identified: canValue(c.data.identification),
      valuation: c.data.valuation,
      params: opportunityParams(env),
    });
    const opp = c.data.opportunity;
    if (config.minDiscountPct !== undefined && !(opp.discountPct !== null && opp.discountPct >= config.minDiscountPct)) continue;
    if (config.minProfit !== undefined && !(opp.profit !== null && opp.profit >= config.minProfit)) continue;
    if (c.data.valuation && c.data.valuation.confidence !== 'insufficient') counters.valued += 1;
    if (opp.profit !== null) counters.withProfit += 1;
    kept.push(c);
  }
  counters.dropped += candidates.length - kept.length;

  // ── 8. dogodki: obstoječe stanje → zastavice in razlogi ──────────────────
  const keys = kept.map((c) => identityKeyOf(c.identity));
  const existing = new Map<string, { price: Money | null; hash: string | null; alerts: LegoAlerts | null }>();
  if (keys.length > 0) {
    const rows = await ScannerResultModel.find({ definitionId: new Types.ObjectId(definition.id), identityKey: { $in: keys } })
      .select('identityKey price comparableHash data')
      .lean<Array<{ identityKey: string; price: Money | null; comparableHash: string | null; data: { alerts?: LegoAlerts } | null }>>();
    for (const r of rows) existing.set(r.identityKey, { price: r.price, hash: r.comparableHash, alerts: r.data?.alerts ?? null });
  }
  const plans = new Map<string, { reasons: EventReason[]; changeType: NonNullable<ReturnType<typeof planEvent>['changeType']> }>();
  const items: NormalizedResult[] = [];
  for (const c of kept) {
    const l = c.listing;
    const identityKey = identityKeyOf(c.identity);
    const comparable = { condition: c.data.lego.condition, listingType: l.listingType, setNumber: c.data.lego.setNumber ?? null, kind: c.data.identification.kind };
    const hash = comparableHash(comparable);
    const prev = existing.get(identityKey) ?? null;
    const change = detectChange({ exists: prev !== null, existingPrice: prev?.price ?? null, existingHash: prev?.hash ?? null, incomingPrice: l.price, incomingHash: hash });
    const plan = planEvent({
      isNew: prev === null,
      change,
      comparableChanged: prev !== null && prev.hash !== null && prev.hash !== hash,
      profit: c.data.opportunity.profit,
      threshold: config.notifyMinProfit,
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
  const stored = await results.reconcile(items, { sourceSucceeded, allowedHosts: ['ebay.de', 'ebay.it', 'ebay.com'] });
  const events: ScannerEvent[] = [];
  if (plans.size > 0) {
    const rows = await ScannerResultModel.find({ definitionId: new Types.ObjectId(definition.id), identityKey: { $in: [...plans.keys()] } })
      .select('identityKey')
      .lean<Array<{ _id: Types.ObjectId; identityKey: string }>>();
    const idByKey = new Map(rows.map((r) => [r.identityKey, String(r._id)]));
    for (const c of kept) {
      const identityKey = identityKeyOf(c.identity);
      const plan = plans.get(identityKey);
      const resultRef = idByKey.get(identityKey);
      if (!plan || !resultRef) continue;
      const l = c.listing;
      const v = c.data.valuation;
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
          setNumber: c.data.lego.setNumber ?? null,
          setName: c.data.lego.setName ?? null,
          condition: c.data.lego.condition,
          listingType: l.listingType,
          endsAt: c.data.listing.endsAt,
          valuation: v && v.comparable && v.average !== null ? { average: v.average, salesCount: v.salesCount, confidence: v.confidence } : null,
          profit: c.data.opportunity.profit,
          roi: c.data.opportunity.roi,
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

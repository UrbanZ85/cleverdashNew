import { Types } from 'mongoose';
import type { Env } from '../../../platform/config/env.js';
import type { Logger } from '../../../platform/logging/logger.js';
import { FlightOfferModel } from '../models/flight-offer.model.js';
import { FlightOfferHistoryModel } from '../models/flight-offer-history.model.js';
import { FlightSearchMatchModel } from '../models/flight-search-match.model.js';
import { FlightSearchRuleModel } from '../models/flight-search-rule.model.js';
import { findAirport } from '../domain/airports.js';
import type { Windows } from '../domain/date-window.js';
import { identityKey } from '../domain/identity.js';
import { classifyChange } from '../../../platform/scanner/domain/price-change.js';
import { sanitizeBookingUrl } from '../domain/booking-url.js';
import type { QueryPlan } from '../domain/query-plan.js';
import { describeMatchFail, nightsAtDestination, offerMatchesRule, type MatchFailReason } from '../domain/rule-matcher.js';
import type { ChangeType, Money, NormalizedOffer, ProviderId, ProviderOutcome } from '../domain/types.js';
import { providerById } from '../providers/index.js';
import type { OfferLean } from './offer-query.service.js';
import type { QueryExecution } from './provider-runner.service.js';
import { ruleToInput, type RuleCheckAnalysisLean, type RuleCheckOutcomeLean, type RuleLean } from './rule-access.service.js';

// Primerjava rezultatov zagona s stanjem v bazi (FR-026 do FR-029, FR-018, FR-028).
//
// Tri ravni, v tem vrstnem redu:
//  1. PONUDBE: vsaka normalizirana ponudba → `identityKey` → upsert FlightOffer; sprememba cene
//     je lastnost ponudbe (ena cena pri enem viru), zato se tu zapiše zgodovina.
//  2. UJEMANJA: za vsako iskanje se njegove ponudbe (iz njegovih poizvedb) ovrednotijo po pravilih;
//     "NOVO" je lastnost PARA in nastane tu.
//  3. NEDOSEGLJIVO: ponudba, ki jo je poizvedba zadnjič vrnila, v tem zagonu pa je med rezultati
//     ISTE poizvedbe z izidom `ok`/`noFlights` ni — samo takrat (FR-028). Pri `unreachable`,
//     `rateLimited`, `incomplete` ali `disabled` se ponudb ne dotaknemo.

export interface RuleWithWindows {
  rule: RuleLean;
  windows: Windows;
}

export interface OfferChange {
  offerId: string;
  changeType: ChangeType;
  price: Money;
  previousPrice: Money | null;
}

export interface MatchEvent {
  ruleId: string;
  ruleOwnerId: string;
  offerId: string;
  changeType: ChangeType;
}

export interface ReconcileCounters {
  offersSeen: number;
  newMatches: number;
  priceDrops: number;
  priceRises: number;
  unavailable: number;
}

export interface ReconcileOutcome {
  counters: ReconcileCounters;
  events: MatchEvent[];
  /** Spremembe po ponudbah v tem zagonu — za sestavljanje dopisov. */
  offerChanges: Map<string, OfferChange>;
}

const SUCCESSFUL: ReadonlySet<ProviderOutcome> = new Set(['ok', 'noFlights']);

function daysAfter(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

function offerExpiry(offer: NormalizedOffer): Date {
  const last = offer.inbound?.departureAt ?? offer.outbound.departureAt;
  return daysAfter(last, 7);
}

/**
 * Raven 1: upsert ponudb. Vrne spremembo za vsako ponudbo tega zagona; dvojniki po identiteti
 * znotraj zagona (ista ponudba iz poizvedbe "kamor koli" in iz poizvedbe za cilj) se zlijejo.
 */
async function upsertOffers(
  executions: Iterable<QueryExecution>,
  runId: Types.ObjectId,
  now: Date,
  env: Env,
  counters: ReconcileCounters,
): Promise<{ changes: Map<string, OfferChange>; offersByKey: Map<string, string[]> }> {
  const byIdentity = new Map<string, { offer: NormalizedOffer; queryKey: string }>();
  for (const exec of executions) {
    if (!SUCCESSFUL.has(exec.result.outcome) && exec.result.outcome !== 'incomplete') continue;
    for (const offer of exec.result.offers) {
      const key = identityKey(offer);
      if (!byIdentity.has(key)) byIdentity.set(key, { offer, queryKey: exec.key });
    }
  }

  const changes = new Map<string, OfferChange>();
  const offersByKey = new Map<string, string[]>();
  const historyExpiry = daysAfter(now, env.FLIGHT_HISTORY_RETENTION_DAYS);

  for (const [key, { offer, queryKey }] of byIdentity) {
    counters.offersSeen += 1;
    const provider = providerById(offer.providerId);
    const bookingUrl = sanitizeBookingUrl(offer.bookingUrl, provider?.bookingHosts ?? []);
    const dest = findAirport(offer.destination);
    const nights = dest ? nightsAtDestination(offer, dest.tz) : null;

    const existing = await FlightOfferModel.findOne({ identityKey: key }).lean<OfferLean | null>();
    let changeType: ChangeType;
    let previousPrice: Money | null = null;
    let offerId: Types.ObjectId;

    if (!existing) {
      changeType = 'NEW';
      const created = await FlightOfferModel.create({
        identityKey: key,
        providerId: offer.providerId,
        airline: offer.airline,
        airlineName: offer.airlineName,
        origin: offer.origin,
        destination: offer.destination,
        outbound: offer.outbound,
        inbound: offer.inbound,
        nights,
        price: offer.price,
        priceIncludes: offer.priceIncludes,
        passengers: offer.passengers,
        fare: offer.fare,
        bookingUrl,
        providerPreviousPrice: offer.providerPreviousPrice,
        dataAt: offer.dataAt,
        firstSeenAt: now,
        lastSeenAt: now,
        lastCheckedAt: now,
        availability: 'available',
        lastQueryKey: queryKey,
        previousPrice: null,
        lastChangeType: 'NEW',
        expiresAt: offerExpiry(offer),
      });
      offerId = created._id;
    } else {
      offerId = existing._id;
      const change = classifyChange(existing.price, offer.price);
      changeType = change.type === 'NEW' ? 'UNCHANGED' : (change.type as ChangeType); // classifyChange nikoli ne vrne CHANGED (016)
      previousPrice = existing.previousPrice
        ? { amount: existing.previousPrice.amount, currency: existing.previousPrice.currency }
        : null;
      const set: Record<string, unknown> = {
        lastSeenAt: now,
        lastCheckedAt: now,
        availability: 'available',
        lastQueryKey: queryKey,
        dataAt: offer.dataAt,
        bookingUrl,
        providerPreviousPrice: offer.providerPreviousPrice,
        priceIncludes: offer.priceIncludes,
        price: offer.price,
        expiresAt: offerExpiry(offer),
      };
      if (changeType === 'PRICE_DOWN' || changeType === 'PRICE_UP') {
        previousPrice = { amount: existing.price.amount, currency: existing.price.currency };
        set.previousPrice = { ...previousPrice, at: existing.lastCheckedAt };
        set.lastChangeType = changeType;
        if (changeType === 'PRICE_DOWN') counters.priceDrops += 1;
        else counters.priceRises += 1;
      } else if (existing.availability === 'unavailable' || existing.lastChangeType === 'UNAVAILABLE') {
        // Ponudba se je vrnila: ne gre za pocenitev ali podražitev, a tudi ne za "nespremenjeno" —
        // za iskanja je spet na voljo in se jim pokaže kot NOVO prek ujemanja.
        set.lastChangeType = 'UNCHANGED';
      } else {
        set.lastChangeType = 'UNCHANGED';
      }
      await FlightOfferModel.updateOne({ _id: offerId }, { $set: set });
    }

    await FlightOfferHistoryModel.create({
      offerId,
      runId,
      checkedAt: now,
      price: offer.price,
      previousPrice: changeType === 'PRICE_DOWN' || changeType === 'PRICE_UP' ? previousPrice : null,
      changeType,
      expiresAt: historyExpiry,
    });

    const idStr = String(offerId);
    changes.set(idStr, {
      offerId: idStr,
      changeType,
      price: offer.price,
      previousPrice: changeType === 'PRICE_DOWN' || changeType === 'PRICE_UP' ? previousPrice : null,
    });
    const list = offersByKey.get(queryKey) ?? [];
    list.push(idStr);
    offersByKey.set(queryKey, list);
    // Ista ponudba lahko pripada več poizvedbam (kamor koli + cilj) — zabeleži pod vse ključe, ki so jo vrnili.
    for (const exec of executions) {
      if (exec.key === queryKey) continue;
      if (exec.result.offers.some((o) => identityKey(o) === key)) {
        const l = offersByKey.get(exec.key) ?? [];
        l.push(idStr);
        offersByKey.set(exec.key, l);
      }
    }
  }

  return { changes, offersByKey };
}

/** Raven 3: ponudbe uspešnih poizvedb, ki jih tokrat ni bilo → `unavailable` (FR-028). */
async function markUnavailable(
  executions: Iterable<QueryExecution>,
  runId: Types.ObjectId,
  now: Date,
  env: Env,
  counters: ReconcileCounters,
  changes: Map<string, OfferChange>,
): Promise<void> {
  const historyExpiry = daysAfter(now, env.FLIGHT_HISTORY_RETENTION_DAYS);
  for (const exec of executions) {
    if (!SUCCESSFUL.has(exec.result.outcome)) continue;
    const gone = await FlightOfferModel.find({
      lastQueryKey: exec.key,
      availability: 'available',
      lastSeenAt: { $lt: now },
    }).lean<OfferLean[]>();
    for (const offer of gone) {
      await FlightOfferModel.updateOne(
        { _id: offer._id, lastSeenAt: { $lt: now } },
        { $set: { availability: 'unavailable', lastChangeType: 'UNAVAILABLE', lastCheckedAt: now } },
      );
      await FlightOfferHistoryModel.create({
        offerId: offer._id,
        runId,
        checkedAt: now,
        price: null,
        previousPrice: offer.price,
        changeType: 'UNAVAILABLE',
        expiresAt: historyExpiry,
      });
      await FlightSearchMatchModel.updateMany(
        { offerId: offer._id, status: { $ne: 'unavailable' } },
        { $set: { status: 'unavailable', lastChangeType: 'UNAVAILABLE', lastChangeAt: now, lastRunId: runId } },
      );
      counters.unavailable += 1;
      changes.set(String(offer._id), { offerId: String(offer._id), changeType: 'UNAVAILABLE', price: offer.price, previousPrice: null });
    }
  }
}

function aggregateOutcome(outcomes: ProviderOutcome[]): ProviderOutcome {
  if (outcomes.length === 0) return 'disabled';
  for (const o of ['rateLimited', 'unreachable', 'incomplete'] as const) if (outcomes.includes(o)) return o;
  if (outcomes.includes('ok')) return 'ok';
  if (outcomes.includes('noFlights')) return 'noFlights';
  if (outcomes.includes('unsupported')) return 'unsupported';
  return outcomes[0]!;
}

/**
 * Raven 2 + stanje iskanja. Vrne dogodke za dopise. Iskanje, ki je bilo med zagonom izbrisano,
 * se preskoči brez napake (edge case).
 */
export async function reconcileRun(params: {
  runId: Types.ObjectId;
  plan: QueryPlan;
  executions: Map<string, QueryExecution>;
  rules: RuleWithWindows[];
  enabledProviderIds: ProviderId[];
  allProviderIds: ProviderId[];
  now: Date;
  env: Env;
  logger?: Logger;
  shouldCancel?: () => Promise<boolean> | boolean;
  onRuleDone?: () => Promise<void> | void;
}): Promise<ReconcileOutcome> {
  const { runId, plan, executions, now, env } = params;
  const counters: ReconcileCounters = { offersSeen: 0, newMatches: 0, priceDrops: 0, priceRises: 0, unavailable: 0 };
  const events: MatchEvent[] = [];

  const { changes, offersByKey } = await upsertOffers(executions.values(), runId, now, env, counters);
  await markUnavailable(executions.values(), runId, now, env, counters, changes);

  const offerCache = new Map<string, OfferLean>();
  async function loadOffer(id: string): Promise<OfferLean | null> {
    const hit = offerCache.get(id);
    if (hit) return hit;
    const doc = await FlightOfferModel.findById(id).lean<OfferLean | null>();
    if (doc) offerCache.set(id, doc);
    return doc;
  }

  for (const { rule, windows } of params.rules) {
    if (await params.shouldCancel?.()) break;
    const stillThere = await FlightSearchRuleModel.exists({ _id: rule._id });
    if (!stillThere) continue;

    const rulePlan = plan.perRule.get(String(rule._id));
    const input = ruleToInput(rule);
    const matchedOfferIds = new Set<string>();
    const evaluatedOfferIds = new Set<string>();
    const rejectedByReason = new Map<MatchFailReason, number>();
    const outcomesByProvider = new Map<ProviderId, { outcomes: ProviderOutcome[]; queries: number; messages: string[] }>();

    for (const key of rulePlan?.queryKeys ?? []) {
      const exec = executions.get(key);
      if (!exec) continue;
      const tally = outcomesByProvider.get(exec.query.providerId) ?? { outcomes: [], queries: 0, messages: [] };
      tally.outcomes.push(exec.result.outcome);
      tally.queries += 1;
      if (exec.result.message) tally.messages.push(exec.result.message);
      outcomesByProvider.set(exec.query.providerId, tally);

      for (const offerId of offersByKey.get(key) ?? []) {
        // Ista ponudba iz dveh poizvedb (npr. "kamor koli" in cilj) se za analizo šteje enkrat.
        if (evaluatedOfferIds.has(offerId)) continue;
        evaluatedOfferIds.add(offerId);
        const offer = await loadOffer(offerId);
        if (!offer || offer.availability !== 'available') continue;
        const normalized = toNormalized(offer);
        const verdict = offerMatchesRule(normalized, input, { windows, airports: findAirport });
        if (!verdict.ok) {
          rejectedByReason.set(verdict.reason, (rejectedByReason.get(verdict.reason) ?? 0) + 1);
          continue;
        }
        matchedOfferIds.add(offerId);

        const change = changes.get(offerId);
        const existingMatch = await FlightSearchMatchModel.findOne({ ruleId: rule._id, offerId: offer._id })
          .select('_id status lastChangeType')
          .lean<{ _id: Types.ObjectId; status: string; lastChangeType: ChangeType } | null>();

        let matchChange: ChangeType;
        if (!existingMatch || existingMatch.status === 'unavailable') {
          matchChange = 'NEW';
          counters.newMatches += 1;
        } else {
          matchChange = change?.changeType === 'PRICE_DOWN' || change?.changeType === 'PRICE_UP' ? change.changeType : 'UNCHANGED';
        }

        await FlightSearchMatchModel.updateOne(
          { ruleId: rule._id, offerId: offer._id },
          {
            $set: {
              ruleOwnerId: rule.userId,
              lastMatchedAt: now,
              lastRunId: runId,
              status: 'active',
              expiresAt: offer.expiresAt,
              ...(matchChange !== 'UNCHANGED' ? { lastChangeType: matchChange, lastChangeAt: now } : {}),
            },
            $setOnInsert: { firstMatchedAt: now, ...(matchChange === 'UNCHANGED' ? { lastChangeType: 'NEW', lastChangeAt: now } : {}) },
          },
          { upsert: true },
        );

        if (matchChange === 'NEW' || matchChange === 'PRICE_DOWN' || matchChange === 'PRICE_UP') {
          events.push({ ruleId: String(rule._id), ruleOwnerId: String(rule.userId), offerId, changeType: matchChange });
        }
      }
    }

    // Ujemanja, katerih ponudba je bila v tem zagonu vrnjena, a pravilom ne ustreza več → `stale`.
    const returnedIds = new Set<string>();
    for (const key of rulePlan?.queryKeys ?? []) for (const id of offersByKey.get(key) ?? []) returnedIds.add(id);
    const toStale = [...returnedIds].filter((id) => !matchedOfferIds.has(id)).map((id) => new Types.ObjectId(id));
    if (toStale.length > 0) {
      await FlightSearchMatchModel.updateMany(
        { ruleId: rule._id, offerId: { $in: toStale }, status: 'active' },
        { $set: { status: 'stale', lastRunId: runId } },
      );
    }

    const outcomes: RuleCheckOutcomeLean[] = params.allProviderIds.map((providerId) => {
      const tally = outcomesByProvider.get(providerId);
      if (!tally) {
        const enabled = params.enabledProviderIds.includes(providerId);
        const provider = providerById(providerId);
        return {
          providerId,
          outcome: enabled ? 'unsupported' : 'disabled',
          message: enabled ? (provider?.notice ?? null) : 'Vir ni vklopljen v tej namestitvi.',
          queries: 0,
          offers: 0,
        };
      }
      const offersForProvider = [...matchedOfferIds].filter((id) => offerCache.get(id)?.providerId === providerId).length;
      return {
        providerId,
        outcome: aggregateOutcome(tally.outcomes),
        message: tally.messages[0] ?? null,
        queries: tally.queries,
        offers: offersForProvider,
      };
    });
    const success = outcomes.some((o) => SUCCESSFUL.has(o.outcome));
    const analysis: RuleCheckAnalysisLean = {
      returned: evaluatedOfferIds.size,
      matched: matchedOfferIds.size,
      rejected: [...rejectedByReason.entries()]
        .map(([reason, count]) => ({ reason, label: describeMatchFail(reason), count }))
        .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason)),
    };
    await FlightSearchRuleModel.updateOne(
      { _id: rule._id },
      {
        $set: {
          lastCheck: { runId, at: now, outcomes, analysis },
          ...(success ? { lastSuccessfulCheckAt: now } : {}),
        },
      },
      { timestamps: false },
    );
    await params.onRuleDone?.();
  }

  return { counters, events, offerChanges: changes };
}

/** Zapis ponudbe nazaj v obliko, nad katero dela rule-matcher. */
export function toNormalized(offer: OfferLean): NormalizedOffer {
  return {
    providerId: offer.providerId,
    airline: offer.airline,
    airlineName: offer.airlineName,
    origin: offer.origin,
    destination: offer.destination,
    outbound: offer.outbound,
    inbound: offer.inbound,
    price: offer.price,
    priceIncludes: offer.priceIncludes,
    passengers: offer.passengers,
    fare: offer.fare,
    bookingUrl: offer.bookingUrl,
    providerPreviousPrice: offer.providerPreviousPrice ?? null,
    dataAt: offer.dataAt,
  };
}

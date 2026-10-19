import { Types } from 'mongoose';
import type { Env } from '../../config/env.js';
import { ScannerResultModel } from '../models/scanner-result.model.js';
import { ScannerResultHistoryModel } from '../models/scanner-result-history.model.js';
import { comparableHash, detectChange } from '../domain/change-detection.js';
import { identityKeyOf } from '../domain/identity.js';
import { classifyChange } from '../domain/price-change.js';
import type {
  AiAnalysis,
  Availability,
  ChangeType,
  GenericResultStore,
  HistoryPointView,
  Money,
  NormalizedResult,
  ResultDetailView,
  ResultQuery,
  ResultReader,
  ResultStoreCounters,
  ResultView,
  ScannerEvent,
} from '../types.js';

// Generična shramba rezultatov (FR-022 do FR-025) za tipe z `results: 'generic'`. Vrstni red v
// enem zagonu je determinističen in dokumentiran (research.md §12):
//   1. upsert po identiteti (dedup znotraj zagona in med zagoni),
//   2. zgodovina (ena vrstica na rezultat, tudi UNCHANGED — graf rabi točke),
//   3. UNAVAILABLE za rezultate, ki jih ta zagon NI vrnil — SAMO kadar je vir uspešno odgovoril,
//   4. dogodki za dopis (NEW, PRICE_DOWN, PRICE_UP, CHANGED).
// Tip z lastno shrambo (leti) te storitve ne kliče; izpolni `ResultReader` (FR-026).

export interface ResultLean {
  _id: Types.ObjectId;
  definitionId: Types.ObjectId;
  userId: Types.ObjectId;
  scannerType: string;
  identityKey: string;
  source: string;
  externalId: string | null;
  title: string;
  url: string | null;
  price: Money | null;
  data: unknown;
  comparableHash: string | null;
  dataAt: Date;
  firstSeenAt: Date;
  lastSeenAt: Date;
  lastCheckedAt: Date;
  availability: Availability;
  previousPrice: (Money & { at: Date }) | null;
  lastChangeType: ChangeType;
  expiresAt: Date;
  /** 017; stari zapisi ga nimajo. */
  aiAnalysis?: AiAnalysis | null;
}

const DEFAULT_RESULT_TTL_DAYS = 30;

function daysAfter(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

/** Povezava ostane samo, kadar gostitelj pripada dovoljenim (isti dogovor kot `booking-url.ts` v 015). */
export function sanitizeResultUrl(url: string | null | undefined, allowedHosts: readonly string[] | undefined): string | null {
  if (!url || !allowedHosts || allowedHosts.length === 0) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  const host = parsed.hostname.toLowerCase();
  const ok = allowedHosts.some((h) => host === h.toLowerCase() || host.endsWith(`.${h.toLowerCase()}`));
  return ok ? parsed.toString() : null;
}

export interface ReconcileParams {
  definition: { id: string; userId: string; name: string };
  runId: Types.ObjectId | string;
  scannerType: string;
  items: NormalizedResult[];
  sourceSucceeded: boolean;
  now: Date;
  env: Pick<Env, 'SCANNER_HISTORY_RETENTION_DAYS'>;
  allowedHosts?: readonly string[];
}

export async function reconcileResults(params: ReconcileParams): Promise<{ events: ScannerEvent[]; counters: ResultStoreCounters }> {
  const { definition, scannerType, now, env } = params;
  const runId = new Types.ObjectId(params.runId);
  const definitionId = new Types.ObjectId(definition.id);
  const userId = new Types.ObjectId(definition.userId);
  const counters: ResultStoreCounters = { seen: 0, new: 0, changed: 0, unavailable: 0, incomplete: 0 };
  const events: ScannerEvent[] = [];
  const historyExpiry = daysAfter(now, env.SCANNER_HISTORY_RETENTION_DAYS);

  // 1. dedup znotraj zagona: ista identiteta dvakrat je en rezultat.
  const byKey = new Map<string, NormalizedResult>();
  for (const item of params.items) {
    if (!item.identity || item.identity.trim().length === 0 || !item.title) {
      counters.incomplete += 1;
      continue;
    }
    const key = identityKeyOf(item.identity);
    if (!byKey.has(key)) byKey.set(key, item);
  }

  for (const [identityKey, item] of byKey) {
    counters.seen += 1;
    const incomingPrice = item.price ?? null;
    const incomingHash = comparableHash(item.comparable);
    const dataAt = item.dataAt ?? now;
    const expiresAt = item.expiresAt ?? daysAfter(now, DEFAULT_RESULT_TTL_DAYS);
    const url = sanitizeResultUrl(item.url, params.allowedHosts);

    const existing = await ScannerResultModel.findOne({ definitionId, identityKey }).lean<ResultLean | null>();
    const changeType = detectChange({
      exists: existing !== null,
      existingPrice: existing?.price ?? null,
      existingHash: existing?.comparableHash ?? null,
      incomingPrice,
      incomingHash,
    });

    let resultId: Types.ObjectId;
    let previousPrice: Money | null = null;

    if (!existing) {
      const created = await ScannerResultModel.create({
        definitionId,
        userId,
        scannerType,
        identityKey,
        source: item.source,
        externalId: item.externalId ?? null,
        title: item.title,
        url,
        price: incomingPrice,
        data: item.data ?? null,
        comparableHash: incomingHash,
        dataAt,
        firstSeenAt: now,
        lastSeenAt: now,
        lastCheckedAt: now,
        availability: 'available',
        previousPrice: null,
        lastChangeType: 'NEW',
        expiresAt,
      });
      resultId = created._id;
      counters.new += 1;
    } else {
      resultId = existing._id;
      const set: Record<string, unknown> = {
        source: item.source,
        externalId: item.externalId ?? null,
        title: item.title,
        url,
        price: incomingPrice,
        data: item.data ?? null,
        comparableHash: incomingHash,
        dataAt,
        lastSeenAt: now,
        lastCheckedAt: now,
        availability: 'available',
        expiresAt,
      };
      if (changeType === 'PRICE_DOWN' || changeType === 'PRICE_UP') {
        previousPrice = existing.price ? { amount: existing.price.amount, currency: existing.price.currency } : null;
        set.previousPrice = previousPrice ? { ...previousPrice, at: existing.lastCheckedAt } : null;
        set.lastChangeType = changeType;
        counters.changed += 1;
      } else if (changeType === 'CHANGED') {
        set.lastChangeType = 'CHANGED';
        counters.changed += 1;
      } else {
        // Nespremenjeno — ali vrnjeno po `UNAVAILABLE`: za skener spet na voljo, brez dopisa,
        // ker ni ne novo ne spremenjeno (isti dogovor kot pri ponudbah letov).
        set.lastChangeType = 'UNCHANGED';
      }
      await ScannerResultModel.updateOne({ _id: resultId }, { $set: set });
    }

    await ScannerResultHistoryModel.create({
      resultId,
      runId,
      checkedAt: now,
      price: incomingPrice,
      previousPrice: changeType === 'PRICE_DOWN' || changeType === 'PRICE_UP' ? previousPrice : null,
      changeType,
      expiresAt: historyExpiry,
    });

    if (changeType === 'NEW' || changeType === 'PRICE_DOWN' || changeType === 'PRICE_UP' || changeType === 'CHANGED') {
      events.push({
        definitionId: definition.id,
        definitionName: definition.name,
        ownerId: definition.userId,
        recipients: [definition.userId],
        resultRef: String(resultId),
        changeType,
        payload: { resultId: String(resultId), title: item.title, url, price: incomingPrice, previousPrice },
      });
    }
  }

  // 3. nedosegljivo — samo ob uspešnem odgovoru vira (FR-024).
  if (params.sourceSucceeded) {
    const gone = await ScannerResultModel.find({ definitionId, availability: 'available', lastSeenAt: { $lt: now } }).lean<ResultLean[]>();
    for (const result of gone) {
      await ScannerResultModel.updateOne(
        { _id: result._id, lastSeenAt: { $lt: now } },
        { $set: { availability: 'unavailable', lastChangeType: 'UNAVAILABLE', lastCheckedAt: now } },
      );
      await ScannerResultHistoryModel.create({
        resultId: result._id,
        runId,
        checkedAt: now,
        price: null,
        previousPrice: result.price,
        changeType: 'UNAVAILABLE',
        expiresAt: historyExpiry,
      });
      counters.unavailable += 1;
    }
  }

  return { events, counters };
}

/** Shramba, kot jo dobi tip v `ctx.results` za en zagon ene definicije. */
export function genericResultStoreFor(
  params: Omit<ReconcileParams, 'items' | 'sourceSucceeded' | 'allowedHosts'>,
  allowedHosts: readonly string[] | undefined,
): GenericResultStore {
  return {
    reconcile: (items, options) => reconcileResults({ ...params, items, sourceSucceeded: options.sourceSucceeded, allowedHosts: options.allowedHosts ?? allowedHosts }),
  };
}

// ───────────────────────────── branje ─────────────────────────────

export function toResultView(r: ResultLean): ResultView {
  const change = r.previousPrice && r.price ? classifyChange({ amount: r.previousPrice.amount, currency: r.previousPrice.currency }, r.price) : null;
  return {
    id: String(r._id),
    scannerId: String(r.definitionId),
    type: r.scannerType,
    source: r.source,
    externalId: r.externalId,
    title: r.title,
    url: r.url,
    price: r.price,
    data: r.data,
    dataAt: r.dataAt,
    firstSeenAt: r.firstSeenAt,
    lastSeenAt: r.lastSeenAt,
    availability: r.availability,
    previousPrice: r.previousPrice,
    lastChangeType: r.lastChangeType,
    change:
      change && change.comparable && change.type !== 'UNCHANGED' && change.absolute !== null && change.percent !== null
        ? { type: change.type, absolute: change.absolute, percent: change.percent }
        : r.lastChangeType === 'UNAVAILABLE'
          ? { type: 'UNAVAILABLE', absolute: 0, percent: 0 }
          : null,
    aiAnalysis: r.aiAnalysis ?? null,
  };
}

function changeAbsolute(r: ResultLean): number {
  if (!r.previousPrice || !r.price || r.previousPrice.currency !== r.price.currency) return Number.POSITIVE_INFINITY;
  return r.price.amount - r.previousPrice.amount;
}

function sortSpec(sort: ResultQuery['sort']): Record<string, 1 | -1> {
  switch (sort) {
    case 'price':
      return { 'price.amount': 1, lastSeenAt: -1 };
    case 'change':
      return { lastCheckedAt: -1 };
    case 'seen':
    default:
      return { lastSeenAt: -1, title: 1 };
  }
}

export const genericResultReader: ResultReader = {
  async list(definitionId, userId, query) {
    const filter: Record<string, unknown> = { definitionId: new Types.ObjectId(definitionId), userId: new Types.ObjectId(userId) };
    if (!query.includeUnavailable) filter.availability = 'available';
    const total = await ScannerResultModel.countDocuments(filter);
    let rows = await ScannerResultModel.find(filter)
      .sort(sortSpec(query.sort))
      .limit(query.sort === 'change' ? Math.max(query.limit * 4, 200) : query.limit)
      .lean<ResultLean[]>();
    if (query.sort === 'change') rows = rows.sort((a, b) => changeAbsolute(a) - changeAbsolute(b)).slice(0, query.limit);
    return { results: rows.map(toResultView), total };
  },

  async count(definitionIds) {
    if (definitionIds.length === 0) return new Map();
    const rows = await ScannerResultModel.aggregate<{ _id: Types.ObjectId; count: number }>([
      { $match: { definitionId: { $in: definitionIds.map((id) => new Types.ObjectId(id)) }, availability: 'available' } },
      { $group: { _id: '$definitionId', count: { $sum: 1 } } },
    ]);
    return new Map(rows.map((r) => [String(r._id), r.count]));
  },

  async get(definitionId, resultId, userId) {
    if (!Types.ObjectId.isValid(resultId)) return null;
    const row = await ScannerResultModel.findOne({
      _id: new Types.ObjectId(resultId),
      definitionId: new Types.ObjectId(definitionId),
      userId: new Types.ObjectId(userId),
    }).lean<ResultLean | null>();
    if (!row) return null;
    const history = await ScannerResultHistoryModel.find({ resultId: row._id })
      .sort({ checkedAt: 1 })
      .lean<Array<{ checkedAt: Date; price: Money | null; changeType: ChangeType }>>();
    const points: HistoryPointView[] = history.map((h) => ({ checkedAt: h.checkedAt, price: h.price, changeType: h.changeType }));
    const detail: ResultDetailView = { ...toResultView(row), history: points };
    return detail;
  },
};

/** Ob izbrisu skenerja gredo z njim rezultati in zgodovina (FR-009). */
export async function deleteResultsOfDefinition(definitionId: Types.ObjectId | string): Promise<void> {
  const id = new Types.ObjectId(definitionId);
  const ids = await ScannerResultModel.find({ definitionId: id }).select('_id').lean<Array<{ _id: Types.ObjectId }>>();
  if (ids.length > 0) await ScannerResultHistoryModel.deleteMany({ resultId: { $in: ids.map((r) => r._id) } });
  await ScannerResultModel.deleteMany({ definitionId: id });
}

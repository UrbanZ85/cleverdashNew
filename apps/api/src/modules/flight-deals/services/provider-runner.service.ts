import { createHash } from 'node:crypto';
import { DateTime } from 'luxon';
import type { Env } from '../../../platform/config/env.js';
import type { Logger } from '../../../platform/logging/logger.js';
import { CacheMissError, getOrRefresh } from '../../../platform/cache/service.js';
import { FlightProviderStatusModel } from '../models/flight-provider-status.model.js';
import { findAirport } from '../domain/airports.js';
import type { ProviderQuery, QueryPlan } from '../domain/query-plan.js';
import type { ProviderOutcome } from '../domain/types.js';
import type { FlightProvider, ProviderRequest, ProviderResult } from '../providers/types.js';
import { createPacer, createSemaphore, defaultSleep } from './concurrency.js';

// Izvedba poizvedb na vire (FR-023, FR-025, člen VIII) — research.md §8.
//
// Vsak klic gre prek `platform/cache/getOrRefresh`: znotraj TTL se vir NE kliče (ročni zagon v isti
// uri kot urnik vira ne vpraša znova), ob napaki vrne zadnjo znano vsebino kot `stale`. `stale` tu
// NE pomeni "uporabi stare podatke" — pomeni, da je prenos spodletel, zato je izid poizvedbe
// `unreachable` in ponudbe iz nje se NE primerjajo (sicer bi "nespremenjeno" sledilo iz starega
// podatka, FR-018).
//
// Žeton vira je v GLAVI zahteve, ne v URL: `sourceUrl` pristane v ExternalCache in v dnevniku.

export interface QueryExecution {
  key: string;
  query: ProviderQuery;
  result: ProviderResult;
  /** `true`, kadar je odgovor prišel iz predpomnilnika brez klica vira. */
  fromCache: boolean;
}

export interface RunnerOptions {
  /** Zamiki ponovitev ob 5xx/omrežni napaki; testi podajo `[0, 0]`. */
  retryDelaysMs?: number[];
  sleep?: (ms: number) => Promise<void>;
  /** Kliče se po vsaki končani poizvedbi — za utrip zagona. */
  onProgress?: (done: number, total: number) => Promise<void> | void;
  shouldCancel?: () => Promise<boolean> | boolean;
}

export interface RunnerSummary {
  executions: Map<string, QueryExecution>;
  providerRequests: number;
  /** Viri, ki so bili v tem zagonu preskočeni zaradi dnevne meje. */
  rateLimitedProviders: string[];
}

class ProviderHttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ProviderHttpError';
  }
}

export function cacheKeyFor(providerId: string, queryKey: string): string {
  return `flight:${providerId}:${createHash('sha256').update(queryKey).digest('hex').slice(0, 16)}`;
}

function ljubljanaDay(now: Date): string {
  return DateTime.fromJSDate(now, { zone: 'utc' }).setZone('Europe/Ljubljana').toFormat('yyyy-LL-dd');
}

/**
 * Dnevna meja zagonov za vir (FR-020). Atomarno: `findOneAndUpdate` z dnevom v filtru, tako da
 * dva izvoda ne štejeta dvakrat. Vrne `true`, kadar sme vir v tem zagonu teči.
 */
export async function claimDailyRun(provider: FlightProvider, now: Date, limit: number | null): Promise<boolean> {
  const day = ljubljanaDay(now);
  if (limit === null) return true;
  // Nov dan ali prvi zapis: ponastavi števec.
  await FlightProviderStatusModel.updateOne(
    { providerId: provider.id, 'requestsToday.day': { $ne: day } },
    { $set: { 'requestsToday.day': day, 'requestsToday.count': 0 } },
    { upsert: true },
  ).catch(() => undefined);
  const claimed = await FlightProviderStatusModel.findOneAndUpdate(
    { providerId: provider.id, 'requestsToday.day': day, 'requestsToday.count': { $lt: limit } },
    { $inc: { 'requestsToday.count': 1 } },
    { new: true },
  ).lean();
  return claimed !== null;
}

async function recordProviderOutcome(providerId: string, outcome: ProviderOutcome, message: string | null, now: Date): Promise<void> {
  const ok = outcome === 'ok' || outcome === 'noFlights';
  await FlightProviderStatusModel.updateOne(
    { providerId },
    ok
      ? { $set: { lastSuccessAt: now, lastOutcome: outcome } }
      : { $set: { lastErrorAt: now, lastError: message ?? outcome, lastOutcome: outcome } },
    { upsert: true },
  ).catch(() => undefined);
}

async function fetchOnce(url: string, headers: Record<string, string>, timeoutMs: number): Promise<string> {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
  const text = await res.text();
  if (!res.ok) throw new ProviderHttpError(res.status, `HTTP ${res.status}`);
  return text;
}

/** Primarni gostitelj, ob 403/5xx/omrežni napaki pa še rezervni (ista pot). 429 in 4xx razen 403 se NE
 * preusmerijo — pomenijo isto pri obeh gostiteljih. */
async function fetchWithFallback(request: ProviderRequest, timeoutMs: number, logger: Logger | undefined, providerId: string): Promise<string> {
  try {
    return await fetchOnce(request.url, request.headers, timeoutMs);
  } catch (err) {
    const status = err instanceof ProviderHttpError ? err.status : null;
    const eligible = request.fallbackUrl && (status === null || status === 403 || status >= 500);
    if (!eligible) throw err;
    logger?.warn({ event: 'flight.provider.fallback', providerId, status }, 'Primarni gostitelj ni odgovoril; poskus na rezervnem');
    return fetchOnce(request.fallbackUrl!, request.headers, timeoutMs);
  }
}

function outcomeForError(err: unknown): { outcome: ProviderOutcome; message: string } {
  if (err instanceof ProviderHttpError) {
    if (err.status === 429) return { outcome: 'rateLimited', message: 'Vir omejuje zahteve (429); poskus ob naslednjem zagonu.' };
    if (err.status === 401) return { outcome: 'unreachable', message: 'Vir je zavrnil dostop — preveri žeton.' };
    if (err.status === 403) return { outcome: 'unreachable', message: 'Vir je dostop zavrnil (403). Ne poskušamo obiti; poskus ob naslednjem zagonu.' };
    return { outcome: 'unreachable', message: `Vir ni odgovoril pravilno (HTTP ${err.status}).` };
  }
  const name = err instanceof Error ? err.name : '';
  if (name === 'TimeoutError' || name === 'AbortError') return { outcome: 'unreachable', message: 'Vir ni odgovoril v časovni omejitvi.' };
  return { outcome: 'unreachable', message: 'Vir ni dosegljiv.' };
}

/**
 * Izvede vse poizvedbe načrta. Vrstni red po virih, vsak s svojim semaforjem in razmikom; napake
 * ene poizvedbe ne ustavijo drugih.
 */
export async function runQueries(
  plan: QueryPlan,
  providers: readonly FlightProvider[],
  env: Env,
  logger: Logger | undefined,
  now: Date,
  options: RunnerOptions = {},
): Promise<RunnerSummary> {
  const retryDelays = options.retryDelaysMs ?? [2000, 8000];
  const sleep = options.sleep ?? defaultSleep;
  const executions = new Map<string, QueryExecution>();
  const rateLimitedProviders: string[] = [];
  let providerRequests = 0;
  let done = 0;
  const total = plan.queries.size;
  const globalSemaphore = createSemaphore(env.FLIGHT_PROVIDER_CONCURRENCY);

  const byProvider = new Map<string, Array<[string, ProviderQuery]>>();
  for (const [key, q] of plan.queries) {
    const list = byProvider.get(q.providerId) ?? [];
    list.push([key, q]);
    byProvider.set(q.providerId, list);
  }

  for (const provider of providers) {
    const list = byProvider.get(provider.id) ?? [];
    if (list.length === 0) continue;

    if (!(await claimDailyRun(provider, now, provider.dailyRunLimit))) {
      rateLimitedProviders.push(provider.id);
      for (const [key, query] of list) {
        executions.set(key, {
          key,
          query,
          fromCache: false,
          result: {
            outcome: 'rateLimited',
            offers: [],
            incompleteCount: 0,
            message: `Vir je bil danes že vprašan ${provider.dailyRunLimit}-krat; naslednji zagon jutri.`,
          },
        });
        done += 1;
      }
      await options.onProgress?.(done, total);
      continue;
    }

    const providerSemaphore = createSemaphore(Math.max(1, provider.maxConcurrency));
    const pace = provider.minGapMs > 0 ? createPacer(provider.minGapMs, sleep) : null;

    await Promise.all(
      list.map(([key, query]) =>
        globalSemaphore.run(() =>
          providerSemaphore.run(async () => {
            if (await options.shouldCancel?.()) {
              executions.set(key, {
                key,
                query,
                fromCache: false,
                result: { outcome: 'unreachable', offers: [], incompleteCount: 0, message: 'Zagon je bil prekinjen.' },
              });
              return;
            }
            if (pace) await pace();
            const exec = await executeQuery(provider, key, query, env, now, retryDelays, sleep, logger);
            executions.set(key, exec);
            if (!exec.fromCache && !provider.local) providerRequests += 1;
            await recordProviderOutcome(provider.id, exec.result.outcome, exec.result.message, now);
            done += 1;
            await options.onProgress?.(done, total);
          }),
        ),
      ),
    );
  }

  return { executions, providerRequests, rateLimitedProviders };
}

async function executeQuery(
  provider: FlightProvider,
  key: string,
  query: ProviderQuery,
  env: Env,
  now: Date,
  retryDelays: number[],
  sleep: (ms: number) => Promise<void>,
  logger: Logger | undefined,
): Promise<QueryExecution> {
  const airports = findAirport;

  if (provider.local) {
    const body = provider.localBody?.(query, now);
    const result = provider.parse(body, query, airports, now, env);
    return { key, query, result, fromCache: false };
  }

  const request = provider.request(query, env);
  let lastError: unknown = null;
  let calledSource = false;

  const fetcher = async () => {
    calledSource = true;
    let attempt = 0;
    for (;;) {
      try {
        const body = await fetchWithFallback(request, env.FLIGHT_PROVIDER_TIMEOUT_MS, logger, provider.id);
        return { status: 200 as const, body, contentType: 'application/json' };
      } catch (err) {
        lastError = err;
        const retryable = !(err instanceof ProviderHttpError) || err.status >= 500;
        if (!retryable || attempt >= retryDelays.length) throw err;
        const delay = retryDelays[attempt] ?? 0;
        attempt += 1;
        logger?.warn({ event: 'flight.provider.retry', providerId: provider.id, attempt, delayMs: delay }, 'Vir ni odgovoril; ponovni poskus');
        if (delay > 0) await sleep(delay);
      }
    }
  };

  try {
    const cached = await getOrRefresh({
      key: cacheKeyFor(provider.id, key),
      sourceUrl: request.url,
      ttlSeconds: env.FLIGHT_PROVIDER_CACHE_SECONDS,
      fetcher,
    });
    if (cached.freshness.kind === 'stale') {
      const { outcome, message } = outcomeForError(lastError);
      return { key, query, fromCache: false, result: { outcome, offers: [], incompleteCount: 0, message } };
    }
    const result = provider.parse(cached.payload, query, airports, now, env);
    return { key, query, result, fromCache: !calledSource };
  } catch (err) {
    const { outcome, message } = outcomeForError(err instanceof CacheMissError ? lastError : err);
    logger?.warn({ event: 'flight.provider.failed', providerId: provider.id, outcome, err: lastError ?? err }, message);
    return { key, query, fromCache: false, result: { outcome, offers: [], incompleteCount: 0, message } };
  }
}

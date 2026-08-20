import { ExternalCacheModel } from './model.js';
import { resolveFreshness, ageSeconds, type FreshnessState } from '../../domain/freshness.js';

// research.md §2, §4: predpomnilnik je usklajen z izvorom (ne agresivnejši), zapis
// preživi ponovni zagon in NE izbriše ob izteku — člen VIII in FR-026.

export class CacheMissError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CacheMissError';
  }
}

export interface ConditionalFetchResult {
  /** `304` pomeni "vir pravi, da se ni spremenilo" — telo se ne prenaša znova. */
  status: 200 | 304;
  /** `Buffer` za binarne vire (radar), navaden objekt za JSON (vreme). */
  body?: unknown;
  contentType?: string;
  etag?: string | null;
  lastModified?: string | null;
}

export type Fetcher = (conditional: {
  etag: string | null;
  lastModified: string | null;
}) => Promise<ConditionalFetchResult>;

export interface CacheResult {
  payload: unknown;
  contentType: string;
  freshness: FreshnessState;
  ageSeconds: number;
}

interface GetOrRefreshParams {
  key: string;
  sourceUrl: string;
  ttlSeconds: number;
  fetcher: Fetcher;
}

/**
 * Vrne predpomnjen podatek, in ga po potrebi osveži. Znotraj TTL se vir NE kliče nikoli
 * (člen VIII). Ob izteku TTL poskusi osvežitev prek `fetcher`; neuspeh vrne zadnji znani
 * podatek z oznako `stale` (FR-026), ne napako — razen če zapisa še nikoli ni bilo, v
 * katerem primeru vrže `CacheMissError` (klicatelj to prevede v 503).
 */
export async function getOrRefresh(params: GetOrRefreshParams): Promise<CacheResult> {
  const now = new Date();
  const existing = await ExternalCacheModel.findOne({ key: params.key });

  const currentState = resolveFreshness(
    {
      fetchedAt: existing?.fetchedAt ?? null,
      expiresAt: existing?.expiresAt ?? null,
      lastAttemptSucceeded: existing ? existing.lastError === null : null,
    },
    now,
  );

  if (currentState.kind === 'fresh' && existing) {
    return {
      payload: existing.payload,
      contentType: existing.contentType,
      freshness: currentState,
      ageSeconds: ageSeconds(existing.fetchedAt, now),
    };
  }

  try {
    const result = await params.fetcher({
      etag: existing?.etag ?? null,
      lastModified: existing?.lastModified ?? null,
    });

    if (result.status === 304 && existing) {
      await ExternalCacheModel.updateOne(
        { key: params.key },
        {
          expiresAt: new Date(now.getTime() + params.ttlSeconds * 1000),
          lastAttemptAt: now,
          lastError: null,
          consecutiveFailures: 0,
        },
      );
      return {
        payload: existing.payload,
        contentType: existing.contentType,
        freshness: { kind: 'refreshed', fetchedAt: existing.fetchedAt },
        ageSeconds: ageSeconds(existing.fetchedAt, now),
      };
    }

    if (!result.body || !result.contentType) {
      throw new Error('Odgovor vira nima telesa niti ob statusu 200.');
    }

    await ExternalCacheModel.updateOne(
      { key: params.key },
      {
        key: params.key,
        sourceUrl: params.sourceUrl,
        contentType: result.contentType,
        payload: result.body,
        fetchedAt: now,
        expiresAt: new Date(now.getTime() + params.ttlSeconds * 1000),
        etag: result.etag ?? null,
        lastModified: result.lastModified ?? null,
        lastAttemptAt: now,
        lastError: null,
        consecutiveFailures: 0,
      },
      { upsert: true },
    );

    return {
      payload: result.body,
      contentType: result.contentType,
      freshness: { kind: 'refreshed', fetchedAt: now },
      ageSeconds: 0,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    if (existing) {
      // Člen VI: tiha napaka ni sprejemljiva — zabeleži se, tudi ko odjemalec dobi podatek.
      await ExternalCacheModel.updateOne(
        { key: params.key },
        { lastAttemptAt: now, lastError: message, $inc: { consecutiveFailures: 1 } },
      );
      return {
        payload: existing.payload,
        contentType: existing.contentType,
        freshness: { kind: 'stale', fetchedAt: existing.fetchedAt },
        ageSeconds: ageSeconds(existing.fetchedAt, now),
      };
    }

    // Zapisa še nikoli ni bilo in prvi poskus je spodletel — ni česa prikazati (FR-026,
    // robni primer iz spec.md: "sporočilo, da podatka še ni, in ponovni poskus").
    throw new CacheMissError(message);
  }
}

/** Za /health (T073): starost trenutno predpomnjenih virov, brez sprožitve osvežitve. */
export async function peekCacheAge(key: string): Promise<{ ageSeconds: number; stale: boolean } | null> {
  const existing = await ExternalCacheModel.findOne({ key }).lean();
  if (!existing) return null;
  const state = resolveFreshness(
    {
      fetchedAt: existing.fetchedAt,
      expiresAt: existing.expiresAt,
      lastAttemptSucceeded: existing.lastError === null,
    },
  );
  return { ageSeconds: ageSeconds(existing.fetchedAt), stale: state.kind === 'stale' };
}

import { CacheMissError, getOrRefresh } from '../../../platform/cache/service.js';
import { reserveSourceRequest, type UsageSource } from './usage.js';
import type { FailureCode, SourceOutcome, SourceRuntime } from './types.js';

// Skupen prenos za vire LEGO skenerja (018, research §2, člen VIII). Vsaka zahteva gre prek
// `platform/cache/getOrRefresh` (znotraj TTL vir ni vprašan), pred pravim klicem rezervira dnevno mejo
// vira v bazi in počaka razmik. Skrivnosti so SAMO v glavah zahteve: `sourceUrl` za predpomnilnik je
// URL brez podpisa in brez ključev (člen IV).
//
// Telo se v predpomnilnik shrani kot BESEDILO, ne kot objekt: JSON odgovora vira lahko vsebuje ključe,
// ki jih Mongo v `Mixed` ne dovoli.
//
// `stale` odgovor (osvežitev spodletela, uporabljen zadnji znani podatek) se vrne kot `stale: true`;
// o tem, ali je star podatek sprejemljiv, odloča klicatelj (katalog in cenik da, oglasi ne).

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export class DailyLimitError extends Error {
  constructor(public readonly source: string) {
    super(`Dnevna meja zahtev vira ${source} je dosežena.`);
    this.name = 'DailyLimitError';
  }
}

export interface HttpRequest {
  url: string;
  method?: 'GET' | 'POST';
  headers: Record<string, string>;
  body?: string;
}

export interface CachedFetchParams {
  usageSource: UsageSource;
  /** Ključ v `ExternalCache`, npr. `lego:rebrickable:set:75192-1`. */
  cacheKey: string;
  /** URL brez skrivnosti (za zapis in dnevnik). */
  sourceUrl: string;
  /** Zahteva se sestavi šele ob pravem prenosu (podpis BrickLink vsebuje čas in nonce). */
  buildRequest: () => HttpRequest | Promise<HttpRequest>;
  ttlSeconds: number;
  dailyLimit: number;
  rt: SourceRuntime;
  /** Razmik vira (`rt.pace`). */
  paceId: Parameters<SourceRuntime['pace']>[0];
  /** 404 je veljaven odgovor "ne obstaja": predpomni se kot `null` (ne trati dnevne meje vsak zagon). */
  notFoundAsNull?: boolean;
}

function failureFor(err: unknown, label: string): { code: FailureCode; message: string } {
  if (err instanceof DailyLimitError) return { code: 'daily-limit', message: `Dnevna meja zahtev vira ${label} je dosežena; poskus ob naslednjem zagonu.` };
  if (err instanceof HttpError) {
    if (err.status === 429) return { code: 'rate-limited', message: `Vir ${label} omejuje zahteve (429); poskus ob naslednjem zagonu.` };
    if (err.status === 401 || err.status === 403) return { code: 'unauthorized', message: `Vir ${label} je zavrnil dostop (${err.status}) — preveri ključe in registriran IP naslov.` };
    return { code: 'unreachable', message: `Vir ${label} ni odgovoril pravilno (HTTP ${err.status}).` };
  }
  const name = err instanceof Error ? err.name : '';
  if (name === 'TimeoutError' || name === 'AbortError') return { code: 'unreachable', message: `Vir ${label} ni odgovoril v časovni omejitvi.` };
  return { code: 'unreachable', message: `Vir ${label} ni dosegljiv.` };
}

/** Prenese JSON prek predpomnilnika; vrne razčlenjen objekt ali izid z razlogom. */
export async function fetchCachedJson(params: CachedFetchParams, label: string): Promise<SourceOutcome<unknown>> {
  const { rt } = params;
  let lastError: unknown = null;

  const fetcher = async () => {
    try {
      if (!(await reserveSourceRequest(params.usageSource, rt.now, params.dailyLimit))) throw new DailyLimitError(label);
      await rt.pace(params.paceId);
      const request = await params.buildRequest();
      const res = await fetch(request.url, {
        method: request.method ?? 'GET',
        headers: request.headers,
        body: request.body,
        signal: AbortSignal.timeout(rt.env.LEGO_TIMEOUT_MS),
      });
      const text = await res.text();
      if (res.status === 404 && params.notFoundAsNull) return { status: 200 as const, body: 'null', contentType: 'application/json' };
      if (!res.ok) {
        rt.logger?.warn({ event: 'lego.source.http', source: params.usageSource, status: res.status }, 'Vir LEGO skenerja je vrnil napako');
        throw new HttpError(res.status, `HTTP ${res.status}`);
      }
      return { status: 200 as const, body: text, contentType: 'application/json' };
    } catch (err) {
      lastError = err;
      throw err;
    }
  };

  try {
    const cached = await getOrRefresh({ key: params.cacheKey, sourceUrl: params.sourceUrl, ttlSeconds: params.ttlSeconds, fetcher });
    const stale = cached.freshness.kind === 'stale';
    let parsed: unknown;
    try {
      parsed = typeof cached.payload === 'string' ? JSON.parse(cached.payload) : cached.payload;
    } catch {
      return { ok: false, code: 'invalid', message: `Odgovor vira ${label} ni veljaven JSON.` };
    }
    return { ok: true, value: parsed, stale };
  } catch (err) {
    const cause = err instanceof CacheMissError ? (lastError ?? err) : err;
    const failure = failureFor(cause, label);
    rt.logger?.warn({ event: 'lego.source.failed', source: params.usageSource, code: failure.code }, 'Zahteva na vir LEGO skenerja je spodletela');
    return { ok: false, ...failure };
  }
}

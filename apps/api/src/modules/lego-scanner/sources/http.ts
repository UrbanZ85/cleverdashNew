import { fetchCachedJson as sharedFetchCachedJson, type CachedFetchParams as SharedParams } from '../../../platform/external-sources/http.js';
import type { SourceOutcome, SourceRuntime } from './types.js';

// Ovoj nad skupnim prenosom (`platform/external-sources/http.ts`, izvlečen v 019): LEGO doda samo svojo
// časovno omejitev in predpono dnevnika; obnašanje je enako kot pred izvleko (018, research §2).

export { DailyLimitError, HttpError } from '../../../platform/external-sources/http.js';
export type { HttpRequest } from '../../../platform/external-sources/http.js';

export type CachedFetchParams = Omit<SharedParams, 'rt' | 'timeoutMs' | 'logPrefix' | 'paceId'> & {
  rt: SourceRuntime;
  /** Razmik vira (`rt.pace`). */
  paceId: Parameters<SourceRuntime['pace']>[0];
};

/** Prenese JSON prek predpomnilnika; vrne razčlenjen objekt ali izid z razlogom. */
export function fetchCachedJson(params: CachedFetchParams, label: string): Promise<SourceOutcome<unknown>> {
  return sharedFetchCachedJson({ ...params, timeoutMs: params.rt.env.LEGO_TIMEOUT_MS, logPrefix: 'lego' }, label);
}

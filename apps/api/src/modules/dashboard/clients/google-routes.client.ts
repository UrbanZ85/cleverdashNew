import type { ConditionalFetchResult } from '../../../platform/cache/service.js';
import { ROUTES_FIELD_MASK } from '../../../domain/commute-route.js';

// Klic Google Routes API (`directions/v2:computeRoutes`) za eno smer poti. Vsa logika o
// tem, KAJ se pošlje in kako se odgovor bere, je v domain/commute-route.ts — tu je samo
// omrežje.
//
// Tri stvari, ki jih je ta vir zahteval in niso očitne:
//  1. `X-Goog-FieldMask` je OBVEZEN — brez njega vir vrne 400, ne privzetega nabora polj.
//  2. Ključ gre v glavo `X-Goog-Api-Key` in nikoli v poizvedbeni niz, kjer bi konačal v
//     dnevnikih posredniških strežnikov.
//  3. Zahteva je `POST` z JSON telesom, zato pogojnih glav (`ETag`/`If-None-Match`) ni —
//     `getOrRefresh` jih poda, ta odjemalec pa jih namenoma ignorira; osveževanje omejuje
//     TTL predpomnilnika (`COMMUTE_CACHE_SECONDS`, člen VIII), ne pogojna zahteva.

export class RoutesRequestFailedError extends Error {}

export function createComputeRoutesFetcher(params: {
  url: string;
  apiKey: string;
  body: Record<string, unknown>;
  timeoutMs: number;
}) {
  return async function fetchComputeRoutes(): Promise<ConditionalFetchResult> {
    // Člen VIII: klic ima svojo časovno omejitev in nikoli ne visi neomejeno — brskalnik
    // medtem čaka na odgovor ploščice.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), params.timeoutMs);
    try {
      const res = await fetch(params.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-goog-api-key': params.apiKey,
          'x-goog-fieldmask': ROUTES_FIELD_MASK,
        },
        body: JSON.stringify(params.body),
        signal: controller.signal,
      });

      if (!res.ok) {
        // Telo napake se zabeleži prek `lastError` v predpomnilniku (člen VI), uporabniku pa
        // se ne vrne: vsebuje podrobnosti o zahtevi in ključu, ki v vmesniku ne pomenijo nič.
        const detail = (await res.text().catch(() => '')).slice(0, 300);
        throw new RoutesRequestFailedError(`Routes API je vrnil ${res.status}: ${detail}`);
      }

      return {
        status: 200,
        body: (await res.json()) as unknown,
        contentType: 'application/json',
      };
    } finally {
      clearTimeout(timeout);
    }
  };
}

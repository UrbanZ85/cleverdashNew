import type { ConditionalFetchResult } from '../../platform/cache/service.js';

// Prenos ARSO virov za ta modul. Oba gresta prek `platform/cache/service.ts` (člen VIII) —
// tukaj je samo pogojna zahteva in zgornja meja telesa.
//
// Preverjeno neposredno proti viru 9. 9. 2026: obe datoteki pošiljata `etag` IN
// `last-modified`, torej pogojna zahteva dela in osvežitev znotraj `304` ne prenese 600 kB
// znova. `cache-control: no-cache, max-age=600` je usklajen s privzetkom
// `METEO_CACHE_SECONDS=600`.

/**
 * Zgornja meja prenesenega telesa. Stran z zgodovino je ~600 kB, seznam postaj ~800 kB
 * (9. 9. 2026); 4 MB je prostor za rast vira, ne za nesrečo — brez meje bi napaka na
 * ARSO strani (npr. vrnjena napačna datoteka) napolnila predpomnilnik v bazi.
 */
const MAX_BODY_BYTES = 4 * 1024 * 1024;

/** Stran z dvodnevno zgodovino postaje. Telo je HTML in se v predpomnilnik shrani kot NIZ:
 * razčlenjevanje (`domain/history-parse.ts`) je čista funkcija nad nizom, zato se predpomni
 * vir, ne izpeljanka — sprememba naše obdelave tako ne zahteva novega prenosa. */
export function createStationHistoryFetcher(sourceUrl: string) {
  return conditionalTextFetcher(sourceUrl, 'text/html', 'zgodovina postaje');
}

/** Seznam vseh samodejnih postaj (`observationAms_si_latest.xml`). */
export function createStationListFetcher(sourceUrl: string) {
  return conditionalTextFetcher(sourceUrl, 'application/xml', 'seznam postaj');
}

function conditionalTextFetcher(sourceUrl: string, accept: string, what: string) {
  return async function fetchArsoText(conditional: {
    etag: string | null;
    lastModified: string | null;
  }): Promise<ConditionalFetchResult> {
    const headers: Record<string, string> = { accept: `${accept}, text/plain` };
    if (conditional.etag) headers['if-none-match'] = conditional.etag;
    if (conditional.lastModified) headers['if-modified-since'] = conditional.lastModified;

    const res = await fetch(sourceUrl, { headers, redirect: 'error' });

    if (res.status === 304) return { status: 304 };
    if (!res.ok) throw new Error(`ARSO (${what}) je vrnil ${res.status}`);

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.byteLength > MAX_BODY_BYTES) {
      throw new Error(`ARSO (${what}) je vrnil telo, večje od ${MAX_BODY_BYTES} bajtov`);
    }
    const body = buffer.toString('utf8');
    if (body.trim().length === 0) {
      // Prazno telo je za `getOrRefresh` neuspel poskus (vrne se zadnji znani podatek), ne
      // veljaven odgovor, ki bi prepisal predpomnilnik s praznino.
      throw new Error(`ARSO (${what}) je vrnil prazno telo`);
    }

    return {
      status: 200,
      body,
      contentType: res.headers.get('content-type') ?? accept,
      etag: res.headers.get('etag'),
      lastModified: res.headers.get('last-modified'),
    };
  };
}

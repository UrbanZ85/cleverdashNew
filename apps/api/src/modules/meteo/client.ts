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
  return conditionalTextFetcher(sourceUrl, 'text/html', 'ARSO (zgodovina postaje)');
}

/** Seznam vseh samodejnih postaj (`observationAms_si_latest.xml`). */
export function createStationListFetcher(sourceUrl: string) {
  return conditionalTextFetcher(sourceUrl, 'application/xml', 'ARSO (seznam postaj)');
}

/**
 * Arhiv meritev postaje Neverin (`core.neverin.hr`). Telo je JSON in se, tako kot ARSO HTML,
 * v predpomnilnik shrani kot NIZ — razčlenjevanje (`domain/neverin-parse.ts`) je čista
 * funkcija nad nizom, zato se predpomni vir in ne izpeljanka.
 */
export function createNeverinFetcher(sourceUrl: string, webOrigin: string, what: string) {
  return conditionalTextFetcher(sourceUrl, 'application/json', `Neverin (${what})`, neverinHeaders(webOrigin));
}

/**
 * Glavi, brez katerih vir odgovori `403 {"error":{"code":"ORIGIN_BLOCKED"}}`.
 *
 * Vir je namenjen njihovi lastni strani in dostop omejuje po izvoru; brez `Origin` oziroma
 * `Referer` z njihovo domeno ne odgovori nikomur. To je zavestna odločitev lastnika te
 * namestitve (glej `NEVERIN_BASE_URL` v `.env.example`), ne privzetek — zato je tudi izvor
 * NASTAVLJIV in ne zapisan v kodi.
 *
 * Kar iz tega sledi za člen VIII, je zapisano v `NEVERIN_CACHE_SECONDS`: ker vir ne pošilja
 * `ETag` niti `Last-Modified`, pogojna zahteva ne deluje in vsaka osvežitev prenese celo
 * telo. Privzeti TTL je zato desetkrat daljši od njihovega `max-age=60` — en prenos na
 * postajo na deset minut, ne glede na to, koliko ljudi zavihek gleda.
 */
function neverinHeaders(webOrigin: string): Record<string, string> {
  const origin = webOrigin.replace(/\/+$/, '');
  return { origin, referer: `${origin}/` };
}

function conditionalTextFetcher(
  sourceUrl: string,
  accept: string,
  what: string,
  extraHeaders: Record<string, string> = {},
) {
  return async function fetchSourceText(conditional: {
    etag: string | null;
    lastModified: string | null;
  }): Promise<ConditionalFetchResult> {
    const headers: Record<string, string> = { ...extraHeaders, accept: `${accept}, text/plain` };
    if (conditional.etag) headers['if-none-match'] = conditional.etag;
    if (conditional.lastModified) headers['if-modified-since'] = conditional.lastModified;

    const res = await fetch(sourceUrl, { headers, redirect: 'error' });

    if (res.status === 304) return { status: 304 };
    if (!res.ok) throw new Error(`${what} je vrnil ${res.status}`);

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.byteLength > MAX_BODY_BYTES) {
      throw new Error(`${what} je vrnil telo, večje od ${MAX_BODY_BYTES} bajtov`);
    }
    const body = buffer.toString('utf8');
    if (body.trim().length === 0) {
      // Prazno telo je za `getOrRefresh` neuspel poskus (vrne se zadnji znani podatek), ne
      // veljaven odgovor, ki bi prepisal predpomnilnik s praznino.
      throw new Error(`${what} je vrnil prazno telo`);
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

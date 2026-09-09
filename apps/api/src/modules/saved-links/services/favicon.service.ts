import { validateOutboundUrl } from '../../../domain/outbound-url.js';
import { loadEnv } from '../../../platform/config/env.js';
import { getOrRefresh, type ConditionalFetchResult } from '../../../platform/cache/service.js';

// research.md §4, FR-012: bajti favicona gredo PREK NAŠEGA STREŽNIKA in obstoječega
// predpomnilnika (`platform/cache/service.ts`, isti kot ARSO radar in posnetek kamere).
// Odjemalec tujega gostitelja ne kliče nikoli (člen VIII, SC-005) — sicer bi seznam
// uporabnikovih shranjenih strani ob vsakem izrisu razkril vsakemu od teh gostiteljev.
//
// KLJUČ JE GOSTITELJ IN NE ZAPIS. To je bistvo te odločitve: dvajset shranjenih strani z
// `github.com` je EN prenos na teden, ne dvajset. Ključ po zapisu bi bil videti bolj
// natančen, v resnici pa bi pomenil dvajsetkrat več odhodnih klicev za isto sliko.
//
// Posledica, ki jo je treba poznati: predpomnilnik je deljen med uporabniki. To je namerno in
// varno — favicon je javna slika tuje strani in ne oseben podatek. V ključu se pojavi samo
// gostitelj, nikoli cel shranjeni naslov (ki bi bil lahko oseben) in nikoli ID uporabnika.

/** Zgornja meja prenesene slike. Favicon je nekaj kilobajtov; brez meje bi lahko vir (tudi
 * po nesreči) napolnil predpomnilnik v bazi z večmegabajtnim odgovorom. */
const MAX_FAVICON_BYTES = 512 * 1024;

/** Kar strežnik pove o sebi — isto kot pri branju imena strani. */
const USER_AGENT = 'CleverDash/1.0';

export class FaviconUnavailableError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'FaviconUnavailableError';
  }
}

export interface FaviconBytes {
  body: Buffer;
  contentType: string;
  fetchedAt: Date | null;
}

function createFaviconFetcher(sourceUrl: string) {
  return async function fetchFavicon(conditional: {
    etag: string | null;
    lastModified: string | null;
  }): Promise<ConditionalFetchResult> {
    const headers: Record<string, string> = { accept: 'image/*', 'user-agent': USER_AGENT };
    if (conditional.etag) headers['if-none-match'] = conditional.etag;
    if (conditional.lastModified) headers['if-modified-since'] = conditional.lastModified;

    const res = await fetch(sourceUrl, {
      headers,
      // `error` in ne `manual`: naslov favicona smo razrešili sami iz dokumenta, zato ni
      // razloga, da bi se premikal. Preusmeritev tu bi bila pot mimo varovala, ki jo pri
      // branju imena strani obravnavamo izrecno (tam je preusmeritev pričakovana, tu ne).
      redirect: 'error',
      signal: AbortSignal.timeout(loadEnv().SAVED_LINKS_METADATA_TIMEOUT_MS),
    });

    if (res.status === 304) return { status: 304 };
    if (!res.ok) throw new Error(`Favicon je vrnil ${res.status}`);

    const contentType = res.headers.get('content-type') ?? 'image/x-icon';
    if (!contentType.toLowerCase().startsWith('image/')) {
      // Stran, ki na `/favicon.ico` vrne svoj HTML (pogosta oblika "catch-all" 200), ni
      // favicon. Brez te preverbe bi se v predpomnilnik zapisal HTML z glavo `image/*` in
      // brskalnik bi izrisal pokvarjeno sliko.
      throw new Error(`Favicon ni slika (${contentType})`);
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.byteLength === 0) throw new Error('Favicon je prazen');
    if (buffer.byteLength > MAX_FAVICON_BYTES) {
      throw new Error(`Favicon je večji od ${MAX_FAVICON_BYTES} bajtov`);
    }

    return {
      status: 200,
      body: buffer,
      contentType,
      etag: res.headers.get('etag'),
      lastModified: res.headers.get('last-modified'),
    };
  };
}

/**
 * Bajti favicona za dani razrešeni naslov.
 *
 * Vrže `FaviconUnavailableError`, kadar favicona ni ali ga ni bilo mogoče prenesti — router
 * to prevede v `404`. To NI napaka, ki bi jo bilo treba pokazati uporabniku (research.md §9):
 * odjemalec ob njej izriše ikono.
 */
export async function getFaviconBytes(faviconUrl: string | null | undefined): Promise<FaviconBytes> {
  if (!faviconUrl) throw new FaviconUnavailableError('no-favicon-url');

  // Naslov se preveri ZNOVA ob vsakem prenosu, ne samo ob shranjevanju: pravila se lahko
  // poostrijo, dokument v bazi pa je star (ista opomba kot pri vtičnikih, 005).
  const guard = validateOutboundUrl(faviconUrl);
  if (!guard.ok) throw new FaviconUnavailableError(guard.reason);

  try {
    const result = await getOrRefresh({
      key: `favicon:${guard.url.hostname.toLowerCase()}`,
      sourceUrl: guard.url.href,
      ttlSeconds: loadEnv().SAVED_LINKS_FAVICON_TTL_SECONDS,
      fetcher: createFaviconFetcher(guard.url.href),
    });

    const payload = result.payload;
    if (!Buffer.isBuffer(payload)) throw new FaviconUnavailableError('not-binary');

    return {
      body: payload,
      contentType: result.contentType,
      fetchedAt: result.freshness.kind === 'never-fetched' ? null : result.freshness.fetchedAt,
    };
  } catch (err) {
    if (err instanceof FaviconUnavailableError) throw err;
    // `CacheMissError` (prvega prenosa ni bilo mogoče opraviti) in vsaka druga napaka sta za
    // klicatelja isto: favicona ni.
    throw new FaviconUnavailableError(err instanceof Error ? err.message : 'unknown');
  }
}

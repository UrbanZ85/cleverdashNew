import type { ConditionalFetchResult } from '../../../platform/cache/service.js';

// research.md §2. Preverjeno neposredno 19. 8. 2026: izvor pošilja `etag` IN
// `last-modified`, torej je pogojna zahteva (`If-None-Match`/`If-Modified-Since`) na
// voljo — ob `304` se slika ne prenese znova. `cache-control: no-cache, max-age=300` je
// usklajen z `RADAR_CACHE_SECONDS=300`.
//
// `si43-rm-anim.gif` je bil prav tako preverjen in vrača 404 — ne uporabljaj ga.

export function createArsoRadarFetcher(sourceUrl: string) {
  return async function fetchArsoRadar(conditional: {
    etag: string | null;
    lastModified: string | null;
  }): Promise<ConditionalFetchResult> {
    const headers: Record<string, string> = {};
    if (conditional.etag) headers['if-none-match'] = conditional.etag;
    if (conditional.lastModified) headers['if-modified-since'] = conditional.lastModified;

    const res = await fetch(sourceUrl, { headers });

    if (res.status === 304) {
      return { status: 304 };
    }
    if (!res.ok) {
      throw new Error(`ARSO (radar) je vrnil ${res.status}`);
    }

    const contentType = res.headers.get('content-type') ?? 'image/gif';
    const buffer = Buffer.from(await res.arrayBuffer());
    return {
      status: 200,
      body: buffer,
      contentType,
      etag: res.headers.get('etag'),
      lastModified: res.headers.get('last-modified'),
    };
  };
}

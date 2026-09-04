import { Readable } from 'node:stream';
import type { Response } from 'express';
import { getOrRefresh, type CacheResult } from '../../../platform/cache/service.js';
import { decrypt } from '../../../platform/crypto/secret-box.js';
import { loadEnv, type Env } from '../../../platform/config/env.js';
import { ProblemError } from '../../../platform/errors/problem.js';

// research.md §3 (posnetek, predpomnjen) in §4 (zvezen tok, pass-through brez
// predpomnjenja). FR-020, FR-021, FR-024, FR-041. Ponovna uporaba `platform/cache` brez
// sprememb — enak vzorec kot ARSO radar/vreme (001).

export interface CameraCredentials {
  username: string;
  password: string;
}

interface ProxyableCamera {
  previewUrl: string;
  credentialsEncrypted?: string | null;
}

function buildAuthHeaders(camera: ProxyableCamera, env: Env): Record<string, string> {
  if (!camera.credentialsEncrypted) return {};
  // Dešifrirano samo tukaj, kratko, v pomnilniku — nikoli zapisano v dnevnik ali vrnjeno
  // prek API-ja (FR-005, research.md §14).
  const raw = decrypt(camera.credentialsEncrypted, env.CREDENTIALS_ENCRYPTION_KEY);
  const credentials = JSON.parse(raw) as CameraCredentials;
  const basic = Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64');
  return { authorization: `Basic ${basic}` };
}

/**
 * Trenutni posnetek prek `platform/cache.getOrRefresh` — ena kamera na več napravah ni več
 * zahtev na vir (FR-021). Neuspeh vrne zadnji znani posnetek z `stale`, razen ob prvem
 * zajemu (`CacheMissError`, klicatelj to prevede v `503`).
 */
export async function fetchCameraSnapshot(cameraId: string, camera: ProxyableCamera & { refreshIntervalSeconds: number }): Promise<CacheResult> {
  const env = loadEnv();

  return getOrRefresh({
    key: `camera:${cameraId}:preview`,
    sourceUrl: camera.previewUrl,
    ttlSeconds: camera.refreshIntervalSeconds,
    fetcher: async () => {
      const headers = buildAuthHeaders(camera, env);
      const res = await fetch(camera.previewUrl, { headers });
      if (!res.ok) {
        throw new Error(`Kamera je vrnila ${res.status}`);
      }
      const contentType = res.headers.get('content-type') ?? 'image/jpeg';
      const buffer = Buffer.from(await res.arrayBuffer());
      return { status: 200 as const, body: buffer, contentType };
    },
  });
}

/**
 * Zvezen tok (`mjpeg`/`hls`) prek proxyja — preprost pass-through, BREZ predpomnjenja
 * (research.md §4: zavestna poenostavitev, ni deljenega multipleksiranja med napravami).
 * Vrne odprt odgovor za neposredno pretakanje (`pipeCameraStream`).
 */
export async function openCameraStream(camera: ProxyableCamera): Promise<globalThis.Response> {
  const env = loadEnv();
  const headers = buildAuthHeaders(camera, env);
  const upstream = await fetch(camera.previewUrl, { headers });
  if (!upstream.ok || !upstream.body) {
    throw new ProblemError(502, 'Vir ni dosegljiv', `Kamera je vrnila ${upstream.status}.`);
  }
  return upstream;
}

/** Pretoči odprt odgovor iz `openCameraStream` naravnost v Express odgovor. */
export function pipeCameraStream(upstream: globalThis.Response, res: Response): void {
  const contentType = upstream.headers.get('content-type');
  if (contentType) res.type(contentType);
  res.status(200);
  // `upstream.body` je preverjen (ne `null`) v `openCameraStream` pred vrnitvijo. Cast prek
  // `unknown`: globalni (fetch) `ReadableStream` in `node:stream/web`-ov `ReadableStream`
  // sta strukturno enaka, a nista imensko isti tip (brez "dom" v lib).
  const webStream = upstream.body as unknown as import('node:stream/web').ReadableStream<Uint8Array>;
  Readable.fromWeb(webStream).pipe(res);
}

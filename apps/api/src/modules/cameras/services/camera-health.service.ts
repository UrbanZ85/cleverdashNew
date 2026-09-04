import { ExternalCacheModel } from '../../../platform/cache/model.js';
import { resolveFreshness, ageSeconds } from '../../../domain/freshness.js';
import { loadEnv } from '../../../platform/config/env.js';

// research.md §3, data-model.md "Izpeljano: zdravje kamere". FR-011, FR-042, Story 5.
// "CameraHealth" iz spec.md Key Entities NI lastna kolekcija — je pogled na `ExternalCache`
// zapis kamere (isti mehanizem kot ARSO radar/vreme), z enim dodatnim stanjem za kamere
// vrste `iframe` brez `previewUrl` za predogled (strežniško ni preverljivo).

export type CameraHealthState = 'ok' | 'stale' | 'unreachable' | 'unknown' | 'not-applicable';

export interface CameraHealth {
  state: CameraHealthState;
  lastSuccessAt: string | null;
  ageSeconds: number | null;
  consecutiveFailures: number | null;
  lastError: string | null;
}

const NOT_APPLICABLE: CameraHealth = {
  state: 'not-applicable',
  lastSuccessAt: null,
  ageSeconds: null,
  consecutiveFailures: null,
  lastError: null,
};

export interface HealthCheckableCamera {
  type: 'snapshot' | 'mjpeg' | 'hls' | 'iframe' | 'snapshot+iframe';
}

/** Zdravje je izpeljano iz `ExternalCache` zapisa, ki ga polni SAMO
 * `camera-proxy.service.ts` → `fetchCameraSnapshot()` — torej samo vrsti `snapshot` in
 * `snapshot+iframe` (research.md §3). Samostojen `iframe` nima naslova za predogled;
 * `mjpeg`/`hls` gresta prek `openCameraStream()` (pass-through, BREZ predpomnjenja,
 * research.md §4) in zato tudi nikoli ne ustvarita zapisa v `ExternalCache`. Za vse tri bi
 * `getCameraHealth` sicer vrnil trajno "unknown" namesto resnične ugotovitve — namesto tega
 * vrne "not-applicable", kar UI-ju pove, da strežniško preverjanje sploh ni na voljo. */
export function isHealthCheckable(camera: HealthCheckableCamera): boolean {
  return camera.type === 'snapshot' || camera.type === 'snapshot+iframe';
}

export async function getCameraHealth(cameraId: string, camera: HealthCheckableCamera): Promise<CameraHealth> {
  if (!isHealthCheckable(camera)) return NOT_APPLICABLE;

  const env = loadEnv();
  const key = `camera:${cameraId}:preview`;
  const existing = await ExternalCacheModel.findOne({ key }).lean();

  if (!existing) {
    return { state: 'unknown', lastSuccessAt: null, ageSeconds: null, consecutiveFailures: null, lastError: null };
  }

  const freshness = resolveFreshness({
    fetchedAt: existing.fetchedAt,
    expiresAt: existing.expiresAt,
    lastAttemptSucceeded: existing.lastError === null,
  });

  const consecutiveFailures = existing.consecutiveFailures ?? 0;
  const base = {
    lastSuccessAt: existing.fetchedAt.toISOString(),
    ageSeconds: ageSeconds(existing.fetchedAt),
    consecutiveFailures,
    lastError: existing.lastError ?? null,
  };

  if (freshness.kind === 'fresh' || freshness.kind === 'refreshed') {
    return { ...base, state: 'ok' };
  }
  // freshness.kind === 'stale' (edino preostalo stanje, ker `existing` obstaja)
  const state: CameraHealthState = consecutiveFailures >= env.CAMERA_UNREACHABLE_THRESHOLD ? 'unreachable' : 'stale';
  return { ...base, state };
}

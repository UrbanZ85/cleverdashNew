import { loadEnv } from '../../../platform/config/env.js';
import { rollupStorage, type StorageSourceSummary, type StorageUserRow } from '../domain/storage-rollup.js';
import type { IntegrityReport } from '../domain/integrity.js';
import { readAllUsers, readSourceRows, resolveSources } from './storage-usage.service.js';
import { checkIntegrity, readVolumeStats, type VolumeStats } from './disk-scan.service.js';

// Predpomnilnik pregleda porabe.
//
// ZAKAJ V PROCESU IN NE V `platform/cache/` (research.md §6): tista zbirka je predpomnilnik
// ZUNANJIH virov — shema zahteva `sourceUrl`, `etag` in `lastModified`, ker je zgrajena okoli
// člena VIII. Pregled porabe ni zunanji vir, ampak draga poizvedba po lastni bazi. Zapis v bazo bi
// bil odveč: en proces, majhna namestitev, in podatek je ves čas izpeljiv iz zbirk.
//
// ENA POIZVEDBA V TEKU (single-flight): trije hkratni obiski zaslona sprožijo EN izračun in tri
// iste odgovore. Brez tega bi vsak obisk po izteku predpomnilnika pomenil svoj sprehod po nosilcu
// in svoje agregacije čez vse zapise namestitve.

export interface StorageSnapshot {
  computedAt: Date;
  cachedUntil: Date;
  totalBytes: number;
  sources: StorageSourceSummary[];
  byUser: StorageUserRow[];
  volume: VolumeStats | null;
  volumeUnavailableReason: string | null;
  integrity: IntegrityReport;
}

let cached: StorageSnapshot | null = null;
let inFlight: Promise<StorageSnapshot> | null = null;

async function compute(): Promise<StorageSnapshot> {
  const computedAt = new Date();
  const sources = await resolveSources();

  // Vzporedno: agregacije, imenik in nosilec se med sabo ne potrebujejo. Sprehod po nosilcu je
  // najdaljši del in bi zaporedno izvajanje podvojilo čas odgovora.
  const [rows, users, volumeResult, integrity] = await Promise.all([
    readSourceRows(sources),
    readAllUsers(),
    readVolumeStats(),
    checkIntegrity(computedAt),
  ]);

  const rollup = rollupStorage({ sources, rows, users });

  return {
    computedAt,
    cachedUntil: new Date(computedAt.getTime() + loadEnv().ANALYTICS_CACHE_SECONDS * 1000),
    totalBytes: rollup.totalBytes,
    sources: rollup.sources,
    byUser: rollup.byUser,
    volume: volumeResult.volume,
    volumeUnavailableReason: volumeResult.unavailableReason,
    integrity,
  };
}

/**
 * Pregled porabe, predpomnjen za `ANALYTICS_CACHE_SECONDS`.
 *
 * `fresh` zavrže predpomnjeno vrednost. Ostaja stvar metode GET in ne mutacije, ker ponoven
 * izračun ne spremeni nobenega stanja — kot mutacija bi šla zahteva skozi `Idempotency-Key` in bi
 * lahko vrnila SHRANJEN odgovor, kar je nasprotje tega, kar "daj mi svežega" pomeni.
 */
export async function getStorageSnapshot(options: { fresh?: boolean } = {}): Promise<StorageSnapshot> {
  if (!options.fresh && cached && cached.cachedUntil > new Date()) return cached;

  // Tudi ob `fresh` se pridružimo izračunu, ki že teče: dva hkratna klika na "Osveži" sta ena
  // osvežitev. Zahteva, ki je prišla PREDEN je ta izračun začel, dobi njegov rezultat — kar je
  // novejše od tega, kar bi dobila iz predpomnilnika.
  inFlight ??= compute()
    .then((snapshot) => {
      cached = snapshot;
      return snapshot;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

/** Samo za teste: pobriše predpomnjeno vrednost med primeri. */
export function resetSnapshotCacheForTests(): void {
  cached = null;
  inFlight = null;
}

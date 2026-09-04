import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { loadEnv, type Env } from '../../../platform/config/env.js';
import type { Logger } from '../../../platform/logging/logger.js';
import { SharedFileModel } from '../models/shared-file.model.js';
import { FileShareGrantModel } from '../models/file-share-grant.model.js';
import { isPastRetention } from '../domain/share-lifecycle.js';
import { blobDir, discardTemp, ensureDirs, removeBlob, statBlob, tempDir } from './blob-storage.service.js';

// FR-043/FR-044, research.md §15: pometač modula.
//
// LASTEN in ne obstoječi scheduler iz 002: ta je last drugega modula in klic vanj bi bil uvoz
// med moduloma (člen I). Vzorec je isti, izvod je svoj — in ob odstranitvi zavihka izgine z
// modulom vred.
//
// DOHITEVAJOČ in IDEMPOTENTEN (člen V.2 in V.3, preneseno na čiščenje): vsak zagon se vpraša
// "kaj bi moralo biti pobrisano in ni" in to stori. Zaustavitev čez konec tedna zato ne pomeni,
// da poteklo ostane za vedno. Dvakrat pobrisano je enkrat pobrisano.
//
// OPOZORILO, ki je nastalo iz obstoječe kode: `SCREENSHOT_RETENTION_DAYS`
// (platform/config/env.ts) je razglašen in ga NIHČE NE BERE — čiščenja posnetkov ni. Ta modul
// te napake ne sme ponoviti, zato je pometač naloga s testom, ne opomba v `.env.example`.

/** Sirota, mlajša od tega, se NE pobriše: lahko je nalaganje, ki ravno teče, in pometač, ki bi
 * jo pobrisal, bi prekinil delo uporabnika (data-model.md). */
const ORPHAN_GRACE_MS = 24 * 60 * 60 * 1000;

export interface CleanupReport {
  expired: number;
  stalledUploads: number;
  orphanBlobs: number;
  brokenMarked: number;
}

type CleanupEnv = Pick<Env, 'FILE_SHARE_RETENTION_DAYS' | 'FILE_SHARE_UPLOAD_TIMEOUT_MINUTES'>;

/** 1. Potekle datoteke: vsebina IN zapis, po roku hrambe, ki teče od poteka. */
async function removeExpired(env: CleanupEnv, now: Date): Promise<number> {
  const candidates = await SharedFileModel.find({ expiresAt: { $ne: null, $lte: now } })
    .select('_id storageId expiresAt')
    .lean<Array<{ _id: unknown; storageId: string; expiresAt: Date }>>();

  let removed = 0;
  for (const file of candidates) {
    if (!isPastRetention(file.expiresAt, now, env.FILE_SHARE_RETENTION_DAYS)) continue;
    // Najprej vsebina, nato zapis — obratno bi ob napaki pustilo siroto, ki je nihče ne najde.
    await removeBlob(file.storageId);
    await discardTemp(file.storageId);
    await FileShareGrantModel.deleteMany({ fileId: file._id });
    await SharedFileModel.deleteOne({ _id: file._id });
    removed += 1;
  }
  return removed;
}

/** 2. Obtičala nalaganja: zapis `uploading`, ki se že dolgo ni premaknil. */
async function removeStalledUploads(env: CleanupEnv, now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - env.FILE_SHARE_UPLOAD_TIMEOUT_MINUTES * 60 * 1000);
  const stalled = await SharedFileModel.find({ state: 'uploading', updatedAt: { $lte: cutoff } })
    .select('_id storageId')
    .lean<Array<{ _id: unknown; storageId: string }>>();

  for (const file of stalled) {
    await discardTemp(file.storageId);
    await removeBlob(file.storageId);
    await SharedFileModel.deleteOne({ _id: file._id });
  }
  return stalled.length;
}

async function listStorageIds(dir: string, suffix: string, nested: boolean): Promise<Array<{ id: string; path: string }>> {
  const out: Array<{ id: string; path: string }> = [];
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (nested) {
      let inner: string[];
      try {
        inner = await readdir(full);
      } catch {
        continue;
      }
      for (const name of inner) out.push({ id: name, path: join(full, name) });
    } else if (entry.endsWith(suffix)) {
      out.push({ id: entry.slice(0, -suffix.length), path: full });
    }
  }
  return out;
}

/** 3. Osirotele vsebine: datoteka na disku brez zapisa, starejša od 24 ur. */
async function removeOrphanBlobs(now: Date): Promise<number> {
  const candidates = [
    ...(await listStorageIds(blobDir(), '', true)),
    ...(await listStorageIds(tempDir(), '.part', false)),
  ];
  if (candidates.length === 0) return 0;

  const known = new Set(
    (await SharedFileModel.find({ storageId: { $in: candidates.map((c) => c.id) } })
      .select('storageId')
      .lean<Array<{ storageId: string }>>()).map((f) => f.storageId),
  );

  let removed = 0;
  for (const candidate of candidates) {
    if (known.has(candidate.id)) continue;
    let info;
    try {
      info = await stat(candidate.path);
    } catch {
      continue;
    }
    if (now.getTime() - info.mtimeMs < ORPHAN_GRACE_MS) continue;
    await removeBlob(candidate.id);
    await discardTemp(candidate.id);
    removed += 1;
  }
  return removed;
}

/** 4. Zapisi brez vsebine: označi kot pokvarjene, da jih lastnik VIDI (člen VII). */
async function markBroken(): Promise<number> {
  const files = await SharedFileModel.find({ state: 'ready' })
    .select('_id storageId byteSize')
    .lean<Array<{ _id: unknown; storageId: string; byteSize: number }>>();

  let marked = 0;
  for (const file of files) {
    const info = await statBlob(file.storageId);
    if (info && info.size === file.byteSize) continue;
    await SharedFileModel.updateOne({ _id: file._id }, { $set: { state: 'broken' } });
    marked += 1;
  }
  return marked;
}

/** Ena celotna pometnja. Idempotentna: drugi zagon nad istim stanjem ne naredi ničesar. */
export async function runFileShareCleanup(now = new Date(), env: CleanupEnv = loadEnv()): Promise<CleanupReport> {
  return {
    expired: await removeExpired(env, now),
    stalledUploads: await removeStalledUploads(env, now),
    orphanBlobs: await removeOrphanBlobs(now),
    brokenMarked: await markBroken(),
  };
}

let timer: NodeJS.Timeout | undefined;

/**
 * Zažene pometač: takoj ob zagonu (dohitevanje) in nato periodično.
 *
 * `unref()` pomeni, da ta časovnik ne drži procesa pri življenju — pomembno za teste in za
 * čisto zaustavitev vsebnika.
 */
export function startFileShareCleanup(logger: Logger): void {
  const env = loadEnv();
  const intervalMs = env.FILE_SHARE_CLEANUP_INTERVAL_MINUTES * 60 * 1000;

  const tick = async (): Promise<void> => {
    try {
      await ensureDirs();
      const report = await runFileShareCleanup();
      const total = report.expired + report.stalledUploads + report.orphanBlobs + report.brokenMarked;
      if (total > 0) logger.info({ event: 'fileShare.cleanup', ...report }, 'Pometač deljenih datotek');
    } catch (err) {
      // Tiho spodletel pometač bi pomenil disk, ki raste brez pojasnila (člen VII).
      logger.error({ event: 'fileShare.cleanup.failed', err }, 'Pometač deljenih datotek je spodletel');
    }
  };

  void tick();
  timer = setInterval(() => void tick(), intervalMs);
  timer.unref();
}

/** Samo za teste. */
export function stopFileShareCleanup(): void {
  if (timer) clearInterval(timer);
  timer = undefined;
}

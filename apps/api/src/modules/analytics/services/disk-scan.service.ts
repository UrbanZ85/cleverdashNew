import { readdir, stat, statfs } from 'node:fs/promises';
import { join } from 'node:path';
import mongoose from 'mongoose';
import { loadEnv } from '../../../platform/config/env.js';
import { buildIntegrityReport, type BlobOnDisk, type FileRecord, type IntegrityReport } from '../domain/integrity.js';

// Nosilec: koliko ga je in kaj na njem leži.
//
// POSTAVITVE NOSILCA TA MODUL NE POZNA (research.md §8). Modul 009 hrani vsebino kot
// `blobs/<xx>/<storageId>`, a te oblike tu ni prepisane: mapa `blobs/` se prehodi rekurzivno in
// vzame se `basename` vsake datoteke. Edina predpostavka je torej "ime datoteke je `storageId`" —
// ne pa tudi število ravni ali dolžina predala.
//
// Če bi 009 kdaj spremenil razbitje po predalih, ta koda še vedno dela. Če bi spremenil
// poimenovanje, pa naenkrat VSE izpade kot sirota — kar je glasna in takoj vidna napaka, ne tiha
// (člen VII). To je zavestna izbira med dvema načinoma, kako se zmotiti.

const BLOB_DIR = 'blobs';
const SHARED_FILES_COLLECTION = 'sharedfiles';

export interface VolumeStats {
  path: string;
  totalBytes: number;
  freeBytes: number;
}

export interface VolumeResult {
  volume: VolumeStats | null;
  /** Zakaj nosilca ni bilo mogoče prebrati. `null`, kadar je bil. */
  unavailableReason: string | null;
}

/**
 * Zasedenost nosilca pod `FILE_SHARE_DIR`.
 *
 * To je DRUG PODATEK od izmerjene porabe in se z njo ne sešteva (FR-015): na nosilcu so tudi baza
 * in dnevniki, vsota zabeleženih velikosti pa ne pozna ne indeksov ne stiskanja.
 *
 * Ob napaki `null` in razlog — nikoli tiha ničla, ki bi bila videti kot poln disk (člen VII).
 */
export async function readVolumeStats(): Promise<VolumeResult> {
  const path = loadEnv().FILE_SHARE_DIR;
  try {
    const fs = await statfs(path);
    return {
      volume: {
        path,
        totalBytes: fs.bsize * fs.blocks,
        // `bavail` in ne `bfree`: rezervirani bloki za root so prosti za jedro, ne za nas, in
        // številka, ki obljublja prostor, ki ga proces ne more dobiti, je napačna številka.
        freeBytes: fs.bsize * fs.bavail,
      },
      unavailableReason: null,
    };
  } catch (err) {
    return {
      volume: null,
      unavailableReason: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Rekurziven sprehod; vrne vsako datoteko z njenim imenom, velikostjo in časom spremembe. */
async function walk(dir: string, out: BlobOnDisk[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    // Mape ni (nosilec prazen ali ni montiran). Prazen rezultat je pravilen odgovor: sirot ni.
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full, out);
      continue;
    }
    if (!entry.isFile()) continue;
    try {
      const info = await stat(full);
      out.push({ storageId: entry.name, bytes: info.size, modifiedAt: info.mtime });
    } catch {
      // Datoteka je izginila med sprehodom — pometač modula 009 teče vzporedno. To ni napaka
      // pregleda in zapis o njej bi bil šum.
    }
  }
}

export async function listBlobsOnDisk(): Promise<BlobOnDisk[]> {
  const out: BlobOnDisk[] = [];
  await walk(join(loadEnv().FILE_SHARE_DIR, BLOB_DIR), out);
  return out;
}

/**
 * Zapisi o datotekah, kakor jih za razsodbo potrebuje `domain/integrity.ts`.
 *
 * Bere se po imenu zbirke — iz istega razloga kot vse drugo v tem modulu. Zbirke ni, kadar je
 * modul 009 odstranjen; takrat razhajanj po definiciji ni.
 */
async function readFileRecords(): Promise<FileRecord[]> {
  const connection = mongoose.connection.db;
  if (!connection) return [];
  const names = await connection.listCollections({ name: SHARED_FILES_COLLECTION }, { nameOnly: true }).toArray();
  if (names.length === 0) return [];

  const rows = await connection
    .collection(SHARED_FILES_COLLECTION)
    .find({}, { projection: { storageId: 1, byteSize: 1, state: 1, updatedAt: 1 } })
    .toArray();

  return rows.map((row) => ({
    storageId: String(row.storageId ?? ''),
    byteSize: typeof row.byteSize === 'number' ? row.byteSize : 0,
    state: String(row.state ?? 'unknown'),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt : new Date(0),
  }));
}

/** Celotna preverba celovitosti: baza proti nosilcu. Ničesar ne popravi (FR-020). */
export async function checkIntegrity(now: Date = new Date()): Promise<IntegrityReport> {
  const env = loadEnv();
  const [records, blobs] = await Promise.all([readFileRecords(), listBlobsOnDisk()]);
  return buildIntegrityReport({
    records,
    blobs,
    now,
    orphanGraceHours: env.ANALYTICS_ORPHAN_GRACE_HOURS,
    stalledUploadMinutes: env.FILE_SHARE_UPLOAD_TIMEOUT_MINUTES,
  });
}

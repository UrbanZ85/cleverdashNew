import { createReadStream, createWriteStream, type WriteStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { loadEnv } from '../../../platform/config/env.js';

// research.md §5, data-model.md: vsebina datotek živi na datotečnem sistemu, ne v bazi.
//
//   $FILE_SHARE_DIR/
//     tmp/<storageId>.part      nalaganje, ki teče
//     blobs/<xx>/<storageId>    dokončano nalaganje (xx = prva dva znaka storageId)
//
// Datoteka pride v `blobs/` IZKLJUČNO s `fs.rename` iz `tmp/`. Znotraj istega nosilca je
// preimenovanje atomarno, zato datoteka v `blobs/` po definiciji pomeni dokončano nalaganje —
// delna datoteka tam ne more nastati. Iz tega sledi pogoj namestitve: `tmp/` in `blobs/` MORATA
// biti na istem nosilcu (oba sta pod `FILE_SHARE_DIR`, kar to zagotavlja).
//
// Ime na disku je `storageId` in NIKOLI uporabnikovo ime datoteke: vnos, ki postane pot, je pot
// v `../../`.

const TMP_DIR = 'tmp';
const BLOB_DIR = 'blobs';
/** 256 predalov. Nekaj tisoč vnosov v eni mapi upočasni vsako operacijo nad njo. */
const SHARD_LENGTH = 2;

function root(): string {
  return loadEnv().FILE_SHARE_DIR;
}

export function newStorageId(): string {
  return randomBytes(16).toString('hex');
}

export function tempPathFor(storageId: string): string {
  return join(root(), TMP_DIR, `${storageId}.part`);
}

export function blobPathFor(storageId: string): string {
  return join(root(), BLOB_DIR, storageId.slice(0, SHARD_LENGTH), storageId);
}

export function tempDir(): string {
  return join(root(), TMP_DIR);
}

export function blobDir(): string {
  return join(root(), BLOB_DIR);
}

/** Ustvari oba imenika ob zagonu. Klic je idempotenten (`recursive: true`). */
export async function ensureDirs(): Promise<void> {
  await mkdir(tempDir(), { recursive: true });
  await mkdir(blobDir(), { recursive: true });
}

/** Odpre tok za pisanje v `tmp/`. Klicatelj je odgovoren, da ob prekinitvi pokliče `discard`. */
export async function openTempWrite(storageId: string): Promise<WriteStream> {
  await mkdir(tempDir(), { recursive: true });
  return createWriteStream(tempPathFor(storageId));
}

/**
 * Objavi naloženo datoteko: `tmp/<id>.part` → `blobs/<xx>/<id>`.
 *
 * Preimenovanje in ne kopiranje — atomarnost je edini razlog, da je lahko obstoj datoteke v
 * `blobs/` dokaz o dokončanem nalaganju.
 */
export async function publish(storageId: string): Promise<void> {
  const target = blobPathFor(storageId);
  await mkdir(dirname(target), { recursive: true });
  await rename(tempPathFor(storageId), target);
}

/** Odstrani nedokončano nalaganje. Ne vrže, če datoteke ni — prekinitev lahko pride večkrat. */
export async function discardTemp(storageId: string): Promise<void> {
  await rm(tempPathFor(storageId), { force: true });
}

/** Odstrani objavljeno vsebino. Vrže, če brisanje spodleti iz drugega razloga kot "ne obstaja" —
 * tiho neuspelo brisanje bi pomenilo zapis, ki izgine, in datoteko, ki ostane (člen VII). */
export async function removeBlob(storageId: string): Promise<void> {
  await rm(blobPathFor(storageId), { force: true });
}

export async function statBlob(storageId: string): Promise<{ size: number } | null> {
  try {
    const info = await stat(blobPathFor(storageId));
    return { size: info.size };
  } catch {
    return null;
  }
}

export function readBlob(storageId: string) {
  return createReadStream(blobPathFor(storageId));
}

/** Absolutna pot za `res.download()`, ki relativnih ne sprejme. */
export function absoluteBlobPath(storageId: string): string {
  return resolve(blobPathFor(storageId));
}

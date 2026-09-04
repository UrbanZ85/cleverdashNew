import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTestEnv } from '../setup/test-env.js';
import {
  absoluteBlobPath,
  blobPathFor,
  discardTemp,
  ensureDirs,
  newStorageId,
  openTempWrite,
  publish,
  removeBlob,
  statBlob,
  tempPathFor,
} from '../../src/modules/file-sharing/services/blob-storage.service.js';

// research.md §5: objava naložene datoteke MORA biti atomarno preimenovanje. Ta test je edino
// mesto, ki to dejansko dokaže — brez njega bi bilo "atomarno" samo trditev v komentarju.

let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'cleverdash-blob-'));
  setTestEnv({ FILE_SHARE_DIR: dir });
});

afterAll(() => rm(dir, { recursive: true, force: true }));

beforeEach(async () => {
  await rm(dir, { recursive: true, force: true });
  setTestEnv({ FILE_SHARE_DIR: dir });
  await ensureDirs();
});

async function writeTemp(storageId: string, content: string): Promise<void> {
  const stream = await openTempWrite(storageId);
  await new Promise<void>((resolveWrite, rejectWrite) => {
    stream.on('error', rejectWrite);
    stream.on('close', () => resolveWrite());
    stream.end(content);
  });
}

describe('blob-storage', () => {
  it('ensureDirs ustvari oba imenika in je idempotenten', async () => {
    await ensureDirs();
    await ensureDirs();
    expect(existsSync(join(dir, 'tmp'))).toBe(true);
    expect(existsSync(join(dir, 'blobs'))).toBe(true);
  });

  it('publish je PREIMENOVANJE, ne kopiranje — ista datoteka, ne dva izvoda', async () => {
    const storageId = newStorageId();
    await writeTemp(storageId, 'vsebina');

    const before = await stat(tempPathFor(storageId));
    await publish(storageId);
    const after = await stat(absoluteBlobPath(storageId));

    // Inode (ino) je enak samo, če je šlo za preimenovanje. Kopiranje 500 MB bi bilo hkrati
    // počasno IN ne bi bilo atomarno.
    expect(after.ino).toBe(before.ino);
    expect(after.size).toBe(before.size);
    expect(existsSync(tempPathFor(storageId))).toBe(false);
  });

  it('delna datoteka nikoli ne konča v blobs/ — dokler ni publish, je samo v tmp/', async () => {
    const storageId = newStorageId();
    await writeTemp(storageId, 'delno');
    expect(existsSync(tempPathFor(storageId))).toBe(true);
    expect(existsSync(blobPathFor(storageId))).toBe(false);

    await discardTemp(storageId);
    expect(existsSync(tempPathFor(storageId))).toBe(false);
    expect(await readdir(join(dir, 'blobs'))).toEqual([]);
  });

  it('discardTemp neobstoječe datoteke ne vrže — prekinitev lahko pride večkrat', async () => {
    await expect(discardTemp(newStorageId())).resolves.toBeUndefined();
  });

  it('removeBlob neobstoječe datoteke ne vrže', async () => {
    await expect(removeBlob(newStorageId())).resolves.toBeUndefined();
  });

  it('pot nikoli ne vsebuje uporabnikovega imena datoteke', async () => {
    // Ime datoteke je uporabnikov vnos; pot je izpeljana IZKLJUČNO iz naključnega storageId.
    const storageId = newStorageId();
    expect(storageId).toMatch(/^[0-9a-f]{32}$/);
    expect(blobPathFor(storageId)).toContain(storageId);
    expect(blobPathFor(storageId)).not.toContain('..');
  });

  it('datoteke so razporejene v predale po prvih dveh znakih', async () => {
    const storageId = newStorageId();
    await writeTemp(storageId, 'x');
    await publish(storageId);
    const shards = await readdir(join(dir, 'blobs'));
    expect(shards).toEqual([storageId.slice(0, 2)]);
  });

  it('statBlob vrne velikost objavljene datoteke in null za neobstoječo', async () => {
    const storageId = newStorageId();
    await writeTemp(storageId, 'sedem!!');
    await publish(storageId);
    expect(await statBlob(storageId)).toEqual({ size: 7 });
    expect(await statBlob(newStorageId())).toBeNull();
  });

  it('tmp/ in blobs/ sta pod istim korenom — pogoj, da je rename atomaren', async () => {
    // Če bi kdo prekril samo enega od njiju z drugim nosilcem, `rename` ne bi bil več
    // preimenovanje, ampak kopiranje (research.md §5).
    const storageId = newStorageId();
    expect(tempPathFor(storageId).startsWith(dir)).toBe(true);
    expect(blobPathFor(storageId).startsWith(dir)).toBe(true);
  });

  it('objavljeno vsebino je mogoče odstraniti', async () => {
    const storageId = newStorageId();
    await writeFile(tempPathFor(storageId), 'x');
    await publish(storageId);
    await removeBlob(storageId);
    expect(await statBlob(storageId)).toBeNull();
  });
});

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../src/main.js';
import { startTestDb, stopTestDb, clearTestDb } from '../setup/mongo-memory.js';
import { setTestEnv } from '../setup/test-env.js';
import { SharedFileModel } from '../../src/modules/file-sharing/models/shared-file.model.js';
import { blobDir, tempDir } from '../../src/modules/file-sharing/services/blob-storage.service.js';
import { loginAndUnlock, unlock } from '../contract/file-sharing/_helpers.js';

// SC-001/SC-002/SC-008, research.md §4: velika datoteka gre CELA skozi, a NE skozi pomnilnik.
//
// Vsebnik `api` ima `mem_limit: 1500m` in v njem že raste Chromium. Obstoječi vzorec za binarno
// telo (`express.raw` v modules/notes/router.ts) bi telo zbral v `Buffer` — pri 500 MB bi to
// vsebnik ubilo. Ta test je edino mesto, ki dokazuje, da se to ne dogaja.

/** 32 MB je dovolj, da bi se razlika videla, in dovolj malo, da test teče hitro. Prava
 * preveritev pri 500 MB je v quickstart.md §4, na resnični namestitvi. */
const SIZE = 32 * 1024 * 1024;

// Vsak test dobi SVOJ imenik na disku: `clearTestDb()` pobriše bazo, diska pa ne, in datoteke
// prejšnjih testov bi štetju v tem testu podtaknile tuje vnose.
let dir: string;

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterAll(stopTestDb);
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'cleverdash-stream-'));
  setTestEnv({ FILE_SHARE_DIR: dir });
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  delete process.env.FILE_SHARE_DIR;
  setTestEnv();
  await clearTestDb();
});

async function countFiles(dir: string): Promise<number> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    let total = 0;
    for (const entry of entries) {
      if (entry.isDirectory()) total += (await readdir(`${dir}/${entry.name}`)).length;
      else total += 1;
    }
    return total;
  } catch {
    return 0;
  }
}

describe('Pretakanje velike datoteke', () => {
  it('vsebina pride CELA nazaj — kontrolni vsoti se ujemata (SC-001)', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const content = randomBytes(SIZE);
    const expected = createHash('sha256').update(content).digest('hex');

    const created = await request(app)
      .post('/api/v1/files')
      .set('Authorization', `Bearer ${token}`)
      .send({ fileName: 'velika.bin', byteSize: content.byteLength })
      .expect(201);

    const uploaded = await request(app)
      .put(`/api/v1/files/${created.body.id}/content`)
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'application/octet-stream')
      .send(content)
      .expect(201);

    const shareToken = uploaded.body.shareUrl.split('/d/')[1];
    const { cookie } = await unlock(app, shareToken, uploaded.body.password);
    const downloaded = await request(app)
      .get(`/api/v1/share/${shareToken}/content`)
      .set('Cookie', cookie)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);

    expect(createHash('sha256').update(downloaded.body as Buffer).digest('hex')).toBe(expected);
    expect((downloaded.body as Buffer).byteLength).toBe(SIZE);
  }, 120_000);

  it('poraba pomnilnika ne raste sorazmerno z velikostjo datoteke (SC-002)', async () => {
    // Ne meri absolutne porabe (na to vpliva vse ostalo v procesu), ampak RAZLIKO pred in po
    // nalaganju. Če bi telo končalo v `Buffer`, bi razlika bila reda velikosti datoteke.
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const content = randomBytes(SIZE);

    global.gc?.();
    const before = process.memoryUsage().heapUsed;

    const created = await request(app)
      .post('/api/v1/files')
      .set('Authorization', `Bearer ${token}`)
      .send({ fileName: 'velika.bin', byteSize: content.byteLength })
      .expect(201);
    await request(app)
      .put(`/api/v1/files/${created.body.id}/content`)
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'application/octet-stream')
      .send(content)
      .expect(201);

    global.gc?.();
    const grew = process.memoryUsage().heapUsed - before;

    // Prag je namerno velikodušen (polovica datoteke): dokazuje razliko med "teče skozi" in
    // "se zbere v pomnilnik", ne natančne porabe.
    expect(grew).toBeLessThan(SIZE / 2);
  }, 120_000);
});

describe('Prekinjeno nalaganje (FR-006, SC-008)', () => {
  it('prekinjena zahteva ne pusti ne zapisa na seznamu ne datoteke v blobs/', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);

    const created = await request(app)
      .post('/api/v1/files')
      .set('Authorization', `Bearer ${token}`)
      .send({ fileName: 'prekinjena.bin', byteSize: SIZE })
      .expect(201);

    // Prekinemo med pošiljanjem: zahteva se odpravi, preden telo pride do konca.
    const req = request(app)
      .put(`/api/v1/files/${created.body.id}/content`)
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'application/octet-stream')
      .send(randomBytes(SIZE));
    setTimeout(() => req.abort(), 15);
    await req.catch(() => undefined);

    // Nekaj časa, da strežnik dokonča pospravljanje po prekinitvi.
    await new Promise((r) => setTimeout(r, 300));

    const list = await request(app).get('/api/v1/files').set('Authorization', `Bearer ${token}`).expect(200);
    expect(list.body.files).toHaveLength(0);
    expect(await countFiles(blobDir())).toBe(0);

    // Zapis ostane v stanju `uploading` (ali ga ni več) — nikoli pa `ready`.
    expect(await SharedFileModel.countDocuments({ state: 'ready' })).toBe(0);
  }, 60_000);

  it('po uspešnem nalaganju v tmp/ ne ostane nič', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);

    const created = await request(app)
      .post('/api/v1/files')
      .set('Authorization', `Bearer ${token}`)
      .send({ fileName: 'ok.bin', byteSize: 1024 })
      .expect(201);
    await request(app)
      .put(`/api/v1/files/${created.body.id}/content`)
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'application/octet-stream')
      .send(randomBytes(1024))
      .expect(201);

    // Objava je PREIMENOVANJE iz tmp/ v blobs/ (research.md §5) — v tmp/ zato ne sme ostati
    // ničesar, in v blobs/ je natanko ena datoteka.
    expect(await countFiles(tempDir())).toBe(0);
    expect(await countFiles(blobDir())).toBe(1);
  });
});

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { mkdtemp, mkdir, rm, utimes, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../src/main.js';
import { startTestDb, stopTestDb, clearTestDb } from '../setup/mongo-memory.js';
import { setTestEnv } from '../setup/test-env.js';
import { SharedFileModel } from '../../src/modules/file-sharing/models/shared-file.model.js';
import { runFileShareCleanup } from '../../src/modules/file-sharing/services/cleanup.service.js';
import { blobPathFor, statBlob, tempPathFor } from '../../src/modules/file-sharing/services/blob-storage.service.js';
import { loginAndUnlock, uploadFile } from '../contract/file-sharing/_helpers.js';

// FR-043/FR-044, research.md §15: pometač modula.
//
// Obstaja iz opozorila v obstoječi kodi: `SCREENSHOT_RETENTION_DAYS` je razglašen in ga nihče
// ne bere — čiščenja posnetkov ni. Tu je vsako od štirih opravil pokrito s testom, da se ista
// napaka ne ponovi.

const DAY = 24 * 60 * 60 * 1000;

let dir: string;

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterAll(stopTestDb);
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'cleverdash-cleanup-'));
  setTestEnv({ FILE_SHARE_DIR: dir });
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  delete process.env.FILE_SHARE_DIR;
  delete process.env.FILE_SHARE_RETENTION_DAYS;
  delete process.env.FILE_SHARE_UPLOAD_TIMEOUT_MINUTES;
  setTestEnv();
  await clearTestDb();
});

describe('1. Potekle datoteke', () => {
  it('se pobrišejo šele PO roku hrambe — ki teče od poteka, ne od nalaganja', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const share = await uploadFile(app, token);
    const storageId = (await SharedFileModel.findById(share.id).lean())!.storageId;

    // Potekla pred tremi dnevi, rok hrambe je sedem: še ostane.
    await SharedFileModel.updateOne({ _id: share.id }, { $set: { expiresAt: new Date(Date.now() - 3 * DAY) } });
    let report = await runFileShareCleanup();
    expect(report.expired).toBe(0);
    expect(await statBlob(storageId)).not.toBeNull();

    // Osem dni po poteku: gre.
    await SharedFileModel.updateOne({ _id: share.id }, { $set: { expiresAt: new Date(Date.now() - 8 * DAY) } });
    report = await runFileShareCleanup();
    expect(report.expired).toBe(1);
    expect(await statBlob(storageId)).toBeNull();
    expect(await SharedFileModel.countDocuments({ _id: share.id })).toBe(0);
  });

  it('datoteka BREZ ROKA se ne pobriše nikoli sama', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const share = await uploadFile(app, token, { expiresInDays: null });

    const report = await runFileShareCleanup(new Date(Date.now() + 1000 * DAY));
    expect(report.expired).toBe(0);
    expect(await SharedFileModel.countDocuments({ _id: share.id })).toBe(1);
  });
});

describe('2. Obtičala nalaganja', () => {
  it('zapis `uploading`, ki se dolgo ni premaknil, izgine skupaj z delno datoteko', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);

    const created = await request(app)
      .post('/api/v1/files')
      .set('Authorization', `Bearer ${token}`)
      .send({ fileName: 'obticala.bin', byteSize: 5000 })
      .expect(201);

    const doc = await SharedFileModel.findById(created.body.id).lean();
    await writeFile(tempPathFor(doc!.storageId), 'delno');

    // Postaramo zapis čez `FILE_SHARE_UPLOAD_TIMEOUT_MINUTES` (privzeto 360 min).
    await SharedFileModel.collection.updateOne(
      { _id: doc!._id },
      { $set: { updatedAt: new Date(Date.now() - 7 * 60 * 60 * 1000) } },
    );

    const report = await runFileShareCleanup();
    expect(report.stalledUploads).toBe(1);
    expect(existsSync(tempPathFor(doc!.storageId))).toBe(false);
    expect(await SharedFileModel.countDocuments({})).toBe(0);
  });

  it('sveže nalaganje, ki ravno teče, se NE pobriše', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    await request(app)
      .post('/api/v1/files')
      .set('Authorization', `Bearer ${token}`)
      .send({ fileName: 'sveza.bin', byteSize: 5000 })
      .expect(201);

    const report = await runFileShareCleanup();
    expect(report.stalledUploads).toBe(0);
    expect(await SharedFileModel.countDocuments({ state: 'uploading' })).toBe(1);
  });
});

describe('3. Osirotele vsebine', () => {
  it('datoteka brez zapisa, starejša od 24 ur, se pobriše', async () => {
    await createApp();
    const storageId = 'a'.repeat(32);
    const path = blobPathFor(storageId);
    await mkdir(join(dir, 'blobs', 'aa'), { recursive: true });
    await writeFile(path, 'sirota');
    const old = new Date(Date.now() - 30 * 60 * 60 * 1000);
    await utimes(path, old, old);

    const report = await runFileShareCleanup();
    expect(report.orphanBlobs).toBe(1);
    expect(existsSync(path)).toBe(false);
  });

  it('sirota, MLAJŠA od 24 ur, ostane — lahko je nalaganje, ki ravno teče', async () => {
    // Brez te dobe bi pometač prekinil delo uporabnika, ki ravno nalaga (data-model.md).
    await createApp();
    const storageId = 'b'.repeat(32);
    const path = blobPathFor(storageId);
    await mkdir(join(dir, 'blobs', 'bb'), { recursive: true });
    await writeFile(path, 'ravno nastaja');

    const report = await runFileShareCleanup();
    expect(report.orphanBlobs).toBe(0);
    expect(existsSync(path)).toBe(true);
  });

  it('datoteke, ki ZAPIS ima, ne pobriše, čeprav je stara', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const share = await uploadFile(app, token);
    const storageId = (await SharedFileModel.findById(share.id).lean())!.storageId;
    const old = new Date(Date.now() - 30 * 60 * 60 * 1000);
    await utimes(blobPathFor(storageId), old, old);

    const report = await runFileShareCleanup();
    expect(report.orphanBlobs).toBe(0);
    expect(await statBlob(storageId)).not.toBeNull();
  });
});

describe('4. Zapisi brez vsebine', () => {
  it('se označijo kot pokvarjeni, da jih lastnik VIDI (člen VII)', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const share = await uploadFile(app, token);
    const storageId = (await SharedFileModel.findById(share.id).lean())!.storageId;

    await rm(blobPathFor(storageId), { force: true });

    const report = await runFileShareCleanup();
    expect(report.brokenMarked).toBe(1);

    const list = await request(app).get('/api/v1/files').set('Authorization', `Bearer ${token}`).expect(200);
    expect(list.body.files[0].state).toBe('broken');
    // In prevzem tak zapis zavrne z razlogom, ne s prazno datoteko (SC-011).
    await request(app).get(`/api/v1/share/${share.token}`).expect(404);
  });
});

describe('Dohitevanje in idempotentnost (FR-044, člen V.2)', () => {
  it('prvi zagon po izpadu pobere ves zaostanek, drugi ne naredi ničesar', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    for (const name of ['a.bin', 'b.bin', 'c.bin']) {
      const share = await uploadFile(app, token, { fileName: name });
      await SharedFileModel.updateOne({ _id: share.id }, { $set: { expiresAt: new Date(Date.now() - 30 * DAY) } });
    }

    const prvi = await runFileShareCleanup();
    expect(prvi.expired).toBe(3);

    const drugi = await runFileShareCleanup();
    expect(drugi).toEqual({ expired: 0, stalledUploads: 0, orphanBlobs: 0, brokenMarked: 0 });
    expect(await SharedFileModel.countDocuments({})).toBe(0);
  });
});

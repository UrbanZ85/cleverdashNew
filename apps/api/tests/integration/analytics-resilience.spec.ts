import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { mkdir, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Express } from 'express';
import { createApp } from '../../src/main.js';
import { clearTestDb, startTestDb, stopTestDb } from '../setup/mongo-memory.js';
import { setTestEnv } from '../setup/test-env.js';
import { loadEnv } from '../../src/platform/config/env.js';
import { resetSnapshotCacheForTests } from '../../src/modules/analytics/services/snapshot-cache.service.js';
import { RecipeImageModel } from '../../src/modules/recipes/models/recipe-image.model.js';
import { SharedFileModel } from '../../src/modules/file-sharing/models/shared-file.model.js';
import { AUTH, loginAsAdmin, loginAsUser } from '../contract/analytics/_helpers.js';

// SC-007 in US4. Dva primera, ki ju z enotskim testom ni mogoče dokazati, ker gre za vedenje ob
// resnični bazi in resničnem disku:
//
//  1. ODSTRANJEN MODUL. Brisanje zavihka je brisanje ene mape in enega vnosa v registru (člen I).
//     Analitika mora to preživeti — vir se izpusti, ostalo ostane.
//  2. RAZHAJANJE MED DISKOM IN BAZO. Člen VII: pregled mora povedati, da je nekaj narobe.

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(async () => {
  resetSnapshotCacheForTests();
  await clearTestDb();
});

let app: Express;
async function boot(): Promise<Express> {
  app = (await createApp()).app;
  return app;
}

describe('analitika preživi odstranitev modula (SC-007)', () => {
  it('brez zbirke enega vira pregled odgovori, vir pa je označen za odsotnega', async () => {
    const app = await boot();
    const admin = await loginAsAdmin(app);
    const ana = await loginAsUser(app, 'ana');

    // Najprej zbirka obstaja in vir je merjen.
    await RecipeImageModel.create({
      recipeId: ana.userId,
      ownerId: ana.userId,
      uploadedBy: ana.userId,
      mimeType: 'image/jpeg',
      byteSize: 1234,
      data: Buffer.alloc(8),
    });
    const before = await request(app).get('/api/v1/analytics/storage?fresh=true').set(AUTH(admin.token));
    expect(before.body.sources.find((s: { id: string }) => s.id === 'recipe-images')).toMatchObject({
      present: true,
      totalBytes: 1234,
    });

    // Modul 013 "odstranjen": njegove zbirke ni več.
    await mongoose.connection.db!.dropCollection('recipeimages');
    resetSnapshotCacheForTests();

    const after = await request(app).get('/api/v1/analytics/storage?fresh=true').set(AUTH(admin.token));
    expect(after.status).toBe(200);
    expect(after.body.sources.find((s: { id: string }) => s.id === 'recipe-images')).toMatchObject({
      present: false,
      totalBytes: 0,
      recordCount: 0,
    });
    // Vrstica OSTANE — razlika med "ni vsebine" in "ni modula" je za administratorja pomembna.
    expect(after.body.sources).toHaveLength(before.body.sources.length);
    // Ostali viri niso prizadeti in tabela oseb je nedotaknjena.
    expect(after.body.byUser.length).toBe(before.body.byUser.length);
  });
});

describe('razhajanje med diskom in bazo (US4, člen VII)', () => {
  it('zapis brez vsebine na disku je prijavljen kot manjkajoča vsebina', async () => {
    const app = await boot();
    const admin = await loginAsAdmin(app);
    const ana = await loginAsUser(app, 'ana');

    await SharedFileModel.create({
      userId: ana.userId,
      displayName: 'izginila.bin',
      byteSize: 4096,
      storageId: 'de' + 'a'.repeat(30),
      state: 'ready',
    });

    const res = await request(app).get('/api/v1/analytics/storage?fresh=true').set(AUTH(admin.token));

    expect(res.body.integrity.clean).toBe(false);
    expect(res.body.integrity.findings).toContainEqual({
      kind: 'missing-content',
      recordCount: 1,
      bytes: 4096,
    });
  });

  it('datoteka na disku brez zapisa v bazi je prijavljena kot sirota', async () => {
    const app = await boot();
    const admin = await loginAsAdmin(app);

    const blobsDir = join(loadEnv().FILE_SHARE_DIR, 'blobs', 'ab');
    await mkdir(blobsDir, { recursive: true });
    const orphan = join(blobsDir, 'ab' + 'c'.repeat(30));
    await writeFile(orphan, Buffer.alloc(2048));
    // Postarana: sveža sirota je lahko nalaganje, ki ravno teče, in se namenoma ne prijavi.
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
    await utimes(orphan, twoDaysAgo, twoDaysAgo);

    const res = await request(app).get('/api/v1/analytics/storage?fresh=true').set(AUTH(admin.token));

    const finding = res.body.integrity.findings.find((f: { kind: string }) => f.kind === 'orphan-blob');
    expect(finding).toBeDefined();
    expect(finding.recordCount).toBeGreaterThanOrEqual(1);
    expect(finding.bytes).toBeGreaterThanOrEqual(2048);
  });

  it('pregled ničesar ne pobriše (FR-020)', async () => {
    const app = await boot();
    const admin = await loginAsAdmin(app);
    const ana = await loginAsUser(app, 'ana');

    await SharedFileModel.create({
      userId: ana.userId,
      displayName: 'izginila.bin',
      byteSize: 10,
      storageId: 'ef' + 'a'.repeat(30),
      state: 'ready',
    });

    await request(app).get('/api/v1/analytics/storage?fresh=true').set(AUTH(admin.token));
    await request(app).get('/api/v1/analytics/storage?fresh=true').set(AUTH(admin.token));

    // Zapis je še vedno tu: pregled ugotovi in pove, ne pospravi.
    expect(await SharedFileModel.countDocuments({})).toBe(1);
  });
});

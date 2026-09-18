import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../../src/main.js';
import { clearTestDb, startTestDb, stopTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { resetSnapshotCacheForTests } from '../../../src/modules/analytics/services/snapshot-cache.service.js';
import { RecipeImageModel } from '../../../src/modules/recipes/models/recipe-image.model.js';
import { NoteAudioModel } from '../../../src/modules/notes/models/note-audio.model.js';
import { SharedFileModel } from '../../../src/modules/file-sharing/models/shared-file.model.js';
import { AUTH, loginAsAdmin, loginAsUser } from './_helpers.js';

// US1 — FR-005 do FR-015, SC-001, SC-003.

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

async function seedImage(ownerId: string, bytes: number, thumbBytes = 0) {
  await RecipeImageModel.create({
    recipeId: ownerId,
    ownerId,
    uploadedBy: ownerId,
    mimeType: 'image/jpeg',
    byteSize: bytes,
    data: Buffer.alloc(8),
    thumb: thumbBytes > 0 ? Buffer.alloc(thumbBytes) : null,
    thumbMimeType: thumbBytes > 0 ? 'image/jpeg' : null,
  });
}

describe('GET /analytics/storage', () => {
  it('sešteje porabo po virih in po osebah; vsota vrstice je vsota postavk', async () => {
    const app = await boot();
    const admin = await loginAsAdmin(app);
    const ana = await loginAsUser(app, 'ana');

    await seedImage(ana.userId, 1000);
    await NoteAudioModel.create({ noteId: ana.userId, userId: ana.userId, byteSize: 2000, mimeType: 'audio/webm', data: Buffer.alloc(8) });
    await SharedFileModel.create({
      userId: ana.userId,
      displayName: 'a.bin',
      byteSize: 3000,
      storageId: 'aa' + 'f'.repeat(30),
      state: 'ready',
    });

    const res = await request(app).get('/api/v1/analytics/storage').set(AUTH(admin.token));

    expect(res.status).toBe(200);
    expect(res.body.totalBytes).toBe(6000);

    const row = res.body.byUser.find((u: { userId: string }) => u.userId === ana.userId);
    expect(row.totalBytes).toBe(6000);
    expect(row.perSource['recipe-images']).toBe(1000);
    expect(row.perSource['note-audio']).toBe(2000);
    expect(row.perSource['shared-files']).toBe(3000);
    // Zamaskirana e-pošta, ne cela (FR-009).
    expect(row.maskedEmail).toBe('a…a@agenda.si');
    expect(JSON.stringify(res.body)).not.toContain('ana@agenda.si');
  });

  it('pomanjšava slike je všteta v porabo (FR-006)', async () => {
    // Model 013 zanjo ne hrani `byteSize`; izmeri se z `$binarySize` (research.md §3).
    const app = await boot();
    const admin = await loginAsAdmin(app);
    const ana = await loginAsUser(app, 'ana');

    await seedImage(ana.userId, 1000, 250);

    const res = await request(app).get('/api/v1/analytics/storage').set(AUTH(admin.token));
    expect(res.body.sources.find((s: { id: string }) => s.id === 'recipe-images').totalBytes).toBe(1250);
  });

  it('oseba brez vsebine je v tabeli z ničlo (FR-008)', async () => {
    const app = await boot();
    const admin = await loginAsAdmin(app);
    const prazna = await loginAsUser(app, 'prazna');

    const res = await request(app).get('/api/v1/analytics/storage').set(AUTH(admin.token));
    const row = res.body.byUser.find((u: { userId: string }) => u.userId === prazna.userId);
    expect(row).toBeDefined();
    expect(row.totalBytes).toBe(0);
  });

  it('prejete datoteke so SVOJ vir in se ne štejejo dvakrat', async () => {
    const app = await boot();
    const admin = await loginAsAdmin(app);
    const ana = await loginAsUser(app, 'ana');

    await SharedFileModel.create({
      userId: ana.userId, displayName: 'lastna.bin', byteSize: 100,
      storageId: 'ab' + 'f'.repeat(30), state: 'ready',
    });
    await SharedFileModel.create({
      userId: ana.userId, displayName: 'prejeta.bin', byteSize: 400,
      storageId: 'ac' + 'f'.repeat(30), state: 'ready', inboxId: ana.userId,
    });

    const res = await request(app).get('/api/v1/analytics/storage').set(AUTH(admin.token));
    const byId = Object.fromEntries(res.body.sources.map((s: { id: string; totalBytes: number }) => [s.id, s.totalBytes]));
    expect(byId['shared-files']).toBe(100);
    expect(byId['shared-files-received']).toBe(400);
    expect(res.body.totalBytes).toBe(500);
  });

  it('šteje tudi zapise brez bajtov (recepti, beležke) — število, ne velikost', async () => {
    const app = await boot();
    const admin = await loginAsAdmin(app);
    const res = await request(app).get('/api/v1/analytics/storage').set(AUTH(admin.token));
    const recipes = res.body.sources.find((s: { id: string }) => s.id === 'recipes');
    expect(recipes).toMatchObject({ totalBytes: 0 });
    expect(recipes).toHaveProperty('recordCount');
  });

  it('navede čas izračuna in veljavnost predpomnilnika (FR-041)', async () => {
    const app = await boot();
    const admin = await loginAsAdmin(app);
    const res = await request(app).get('/api/v1/analytics/storage').set(AUTH(admin.token));
    expect(new Date(res.body.cachedUntil).getTime()).toBeGreaterThan(new Date(res.body.computedAt).getTime());
  });

  it('ponovljen klic vrne PREDPOMNJEN izračun, `fresh=true` pa novega (FR-040, SC-003)', async () => {
    const app = await boot();
    const admin = await loginAsAdmin(app);

    const first = await request(app).get('/api/v1/analytics/storage').set(AUTH(admin.token));
    const cached = await request(app).get('/api/v1/analytics/storage').set(AUTH(admin.token));
    expect(cached.body.computedAt).toBe(first.body.computedAt);

    const fresh = await request(app).get('/api/v1/analytics/storage?fresh=true').set(AUTH(admin.token));
    expect(new Date(fresh.body.computedAt).getTime()).toBeGreaterThanOrEqual(new Date(first.body.computedAt).getTime());
    expect(fresh.body.computedAt).not.toBe(first.body.computedAt);
  });

  it('`fresh=false` NE osveži — niz "false" se ne sme brati kot resnica', async () => {
    const app = await boot();
    const admin = await loginAsAdmin(app);
    const first = await request(app).get('/api/v1/analytics/storage').set(AUTH(admin.token));
    const second = await request(app).get('/api/v1/analytics/storage?fresh=false').set(AUTH(admin.token));
    expect(second.body.computedAt).toBe(first.body.computedAt);
  });

  it('zasedenost nosilca je LOČENO polje in ne del vsote (FR-011, FR-015)', async () => {
    const app = await boot();
    const admin = await loginAsAdmin(app);
    const res = await request(app).get('/api/v1/analytics/storage').set(AUTH(admin.token));

    expect(res.body).toHaveProperty('volume');
    if (res.body.volume !== null) {
      expect(res.body.volume.totalBytes).toBeGreaterThan(0);
      expect(res.body.volume).not.toHaveProperty('usedByContent');
    } else {
      // Če nosilca ni bilo mogoče prebrati, MORA biti naveden razlog — ne tiha ničla (člen VII).
      expect(res.body.volumeUnavailableReason).toBeTruthy();
    }
  });

  it('na čisti namestitvi je preverba celovitosti izrecno čista (FR-019)', async () => {
    const app = await boot();
    const admin = await loginAsAdmin(app);
    const res = await request(app).get('/api/v1/analytics/storage').set(AUTH(admin.token));
    expect(res.body.integrity.clean).toBe(true);
    expect(res.body.integrity.findings).toEqual([]);
  });
});

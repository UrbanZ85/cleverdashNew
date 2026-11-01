import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../../src/main.js';
import { clearTestDb, startTestDb, stopTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { ScannerResultModel } from '../../../src/platform/scanner/models/scanner-result.model.js';
import { AUTH, loginAs, registerMockType, seedDefinition } from './_helpers.js';

// Pripenjanje rezultatov: shranjeno v bazi, pripeti na vrhu in brez poteka.

beforeAll(async () => {
  setTestEnv({});
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(clearTestDb);

let app: Express;
async function boot() {
  app = (await createApp()).app;
  registerMockType('mocks', 'single');
}

async function seedResult(definitionId: unknown, userId: unknown, key: string, seenOffsetMs: number) {
  const now = new Date();
  return ScannerResultModel.create({
    definitionId,
    userId,
    scannerType: 'mocks',
    identityKey: key,
    source: 'mock',
    title: key,
    dataAt: now,
    firstSeenAt: now,
    lastSeenAt: new Date(now.getTime() + seenOffsetMs),
    lastCheckedAt: now,
    lastChangeType: 'NEW',
    expiresAt: new Date(now.getTime() + 86_400_000),
  });
}

describe('PUT /scanners/:id/results/:resultId/pin', () => {
  it('pripne, pripeti je prvi in ne poteče; odpne vrne rok', async () => {
    await boot();
    const ana = await loginAs(app, 'ana');
    const def = await seedDefinition(ana.userId, 'mocks');
    const newer = await seedResult(def._id, def.userId, 'newer', 1000);
    const older = await seedResult(def._id, def.userId, 'older', 0);

    const url = `/api/v1/scanners/${def._id}/results/${older._id}/pin`;
    const pin = await request(app).put(url).set(AUTH(ana.token)).send({ pinned: true });
    expect(pin.status).toBe(200);
    expect(pin.body).toEqual({ pinned: true });

    const list = await request(app).get(`/api/v1/scanners/${def._id}/results`).set(AUTH(ana.token));
    expect(list.body.results.map((r: { id: string; pinned: boolean }) => [r.id, r.pinned])).toEqual([
      [String(older._id), true],
      [String(newer._id), false],
    ]);
    expect((await ScannerResultModel.findById(older._id).lean())?.expiresAt.getUTCFullYear()).toBe(2100);

    await request(app).put(url).set(AUTH(ana.token)).send({ pinned: false });
    const after = await ScannerResultModel.findById(older._id).lean();
    expect(after?.pinnedAt).toBeNull();
    expect(after!.expiresAt.getUTCFullYear()).toBeLessThan(2100);
  });

  it('tuj rezultat in neveljavno telo: 404 oziroma 400', async () => {
    await boot();
    const ana = await loginAs(app, 'ana');
    const bor = await loginAs(app, 'bor');
    const def = await seedDefinition(ana.userId, 'mocks');
    const r = await seedResult(def._id, def.userId, 'k', 0);
    const url = `/api/v1/scanners/${def._id}/results/${r._id}/pin`;
    expect((await request(app).put(url).set(AUTH(bor.token)).send({ pinned: true })).status).toBe(404);
    expect((await request(app).put(url).set(AUTH(ana.token)).send({ pinned: 'da' })).status).toBe(400);
    expect((await request(app).put(`/api/v1/scanners/${def._id}/results/000000000000000000000000/pin`).set(AUTH(ana.token)).send({ pinned: true })).status).toBe(404);
  });
});

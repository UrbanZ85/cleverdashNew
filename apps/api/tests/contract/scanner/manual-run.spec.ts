import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../../src/main.js';
import { clearTestDb, startTestDb, stopTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { ScannerRunModel } from '../../../src/platform/scanner/models/scanner-run.model.js';
import { seedMatch, seedOffer, seedRule } from '../flight-deals/_helpers.js';
import { AUTH, loginAs, okOutcome, registerMockType, seedDefinition, type MockHandle } from './_helpers.js';

// US5 (FR-020, FR-026): ročni zagon lastnika, zagoni skenerja, rezultati prek bralnika tipa.

beforeAll(async () => {
  setTestEnv({ FLIGHT_FAKE_PROVIDER_ENABLED: 'true' });
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(clearTestDb);

let app: Express;
let single: MockHandle;
async function boot() {
  app = (await createApp()).app;
  single = registerMockType('mocks', 'single');
  registerMockType('mockoff', 'single', { enabled: false });
}

async function waitFinished(runId: string): Promise<void> {
  for (let i = 0; i < 50; i += 1) {
    const doc = await ScannerRunModel.findById(runId).lean<{ status: string } | null>();
    if (doc && doc.status !== 'queued' && doc.status !== 'running') return;
    await new Promise((r) => setTimeout(r, 50));
  }
}

describe('POST /scanners/:id/run', () => {
  it('lastnik → 202; tuj → 404; iskanje letov (batch) → 403; izklopljen tip → 400; isti skener teče → 409; deluje pri enabled=false', async () => {
    await boot();
    const ana = await loginAs(app, 'ana');
    const bor = await loginAs(app, 'bor');
    const def = await seedDefinition(ana.userId, 'mocks', { enabled: false });
    const rule = await seedRule(ana.userId);
    const off = await seedDefinition(ana.userId, 'mockoff');
    single.behaviour.execute = async (ctx) => {
      const { events, counters } = await ctx.results!.reconcile([{ identity: 'a', source: 'mock', title: 'A', price: { amount: 5, currency: 'EUR' }, data: {} }], { sourceSucceeded: true });
      return okOutcome({ counters, events, definitions: [{ definitionId: ctx.definition!.id, ownerId: ctx.definition!.userId, outcome: 'ok', message: null }] });
    };

    const started = await request(app).post(`/api/v1/scanners/${def._id}/run`).set(AUTH(ana.token));
    expect(started.status).toBe(202);
    expect(started.body).toMatchObject({ type: 'mocks', trigger: 'manual', scope: { kind: 'definition', scannerId: String(def._id), owner: { displayName: 'Uporabnik ANA' } } });
    await waitFinished(started.body.id);

    expect((await request(app).post(`/api/v1/scanners/${def._id}/run`).set(AUTH(bor.token))).status).toBe(404);
    expect((await request(app).post(`/api/v1/scanners/${rule._id}/run`).set(AUTH(ana.token))).status).toBe(403);
    expect((await request(app).post(`/api/v1/scanners/${off._id}/run`).set(AUTH(ana.token))).status).toBe(400);

    const now = new Date();
    await ScannerRunModel.create({ scannerType: 'mocks', scope: { kind: 'definition', definitionId: def._id, ownerId: def.userId }, slotKey: 'manual:busy', trigger: 'manual', status: 'running', createdAt: now, startedAt: now, heartbeatAt: now, expiresAt: new Date(now.getTime() + 86_400_000) });
    expect((await request(app).post(`/api/v1/scanners/${def._id}/run`).set(AUTH(ana.token))).status).toBe(409);

    const runs = await request(app).get(`/api/v1/scanners/${def._id}/runs`).set(AUTH(ana.token));
    expect(runs.status).toBe(200);
    expect(runs.body.runs).toHaveLength(2);
    expect(runs.body.runs.every((r: { type: string }) => r.type === 'mocks')).toBe(true);
    expect(runs.body.runs[1]).toMatchObject({ status: 'succeeded', counters: { seen: 1, new: 1, definitions: 1 } });

    const results = await request(app).get(`/api/v1/scanners/${def._id}/results`).set(AUTH(ana.token));
    expect(results.body.total).toBe(1);
    expect(results.body.results[0]).toMatchObject({ scannerId: String(def._id), type: 'mocks', title: 'A', price: { amount: 5, currency: 'EUR' }, lastChangeType: 'NEW', url: null, change: null });
    const detail = await request(app).get(`/api/v1/scanners/${def._id}/results/${results.body.results[0].id}`).set(AUTH(ana.token));
    expect(detail.body.history).toHaveLength(1);
    expect((await request(app).get(`/api/v1/scanners/${def._id}/results/ni-id`).set(AUTH(ana.token))).status).toBe(404);
  });

  it('iskanje letov: zagoni so zagoni tipa, rezultati pridejo prek bralnika tipa v obliki Result', async () => {
    await boot();
    const ana = await loginAs(app, 'ana');
    const rule = await seedRule(ana.userId);
    const offer = await seedOffer();
    await seedMatch({ _id: rule._id, userId: rule.userId }, { _id: offer._id, expiresAt: offer.expiresAt });
    const now = new Date();
    await ScannerRunModel.create({ scannerType: 'flights', scope: { kind: 'type' }, slotKey: 'manual:f1', trigger: 'manual', status: 'succeeded', createdAt: now, startedAt: now, finishedAt: now, heartbeatAt: now, expiresAt: new Date(now.getTime() + 86_400_000) });

    const runs = await request(app).get(`/api/v1/scanners/${rule._id}/runs`).set(AUTH(ana.token));
    expect(runs.body.runs).toHaveLength(1);
    expect(runs.body.runs[0]).toMatchObject({ type: 'flights', status: 'succeeded' });

    const results = await request(app).get(`/api/v1/scanners/${rule._id}/results`).set(AUTH(ana.token));
    expect(results.status).toBe(200);
    expect(results.body.total).toBe(1);
    expect(results.body.results[0]).toMatchObject({ scannerId: String(rule._id), type: 'flights', source: 'fake', price: { amount: 178, currency: 'EUR' }, url: 'https://example.test/book' });
    expect(results.body.results[0].title).toMatch(/^LJU → STN, /);
    const detail = await request(app).get(`/api/v1/scanners/${rule._id}/results/${offer._id}`).set(AUTH(ana.token));
    expect(detail.status).toBe(200);
    expect(detail.body.data).toMatchObject({ providerId: 'fake' });
    expect(Array.isArray(detail.body.history)).toBe(true);
  });
});

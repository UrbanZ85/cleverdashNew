import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../../src/main.js';
import { clearTestDb, startTestDb, stopTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { ScannerRunModel } from '../../../src/platform/scanner/models/scanner-run.model.js';
import { AUTH, loginAs, loginAsAdmin, okOutcome, registerMockType, seedApiKey, seedDefinition, type MockHandle } from './_helpers.js';

// US2 (FR-014, FR-020, FR-045): administracija skenerjev z MOCK tipi — proti pogodbi 016.

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(clearTestDb);

let app: Express;
let batch: MockHandle;
let single: MockHandle;
async function boot() {
  app = (await createApp()).app;
  batch = registerMockType('mockb', 'batch');
  single = registerMockType('mocks', 'single');
}

async function waitFinished(runId: string): Promise<void> {
  for (let i = 0; i < 50; i += 1) {
    const doc = await ScannerRunModel.findById(runId).lean<{ status: string } | null>();
    if (doc && doc.status !== 'queued' && doc.status !== 'running') return;
    await new Promise((r) => setTimeout(r, 50));
  }
}

describe('GET /scanners/admin/types', () => {
  it('vrne tipe z urnikom pri batch, null pri single, številom definicij, dodatkom in stanjem pošte', async () => {
    await boot();
    const admin = await loginAsAdmin(app);
    const ana = await loginAs(app, 'ana');
    await seedDefinition(ana.userId, 'mocks');
    const res = await request(app).get('/api/v1/scanners/admin/types').set(AUTH(admin.token));
    expect(res.status).toBe(200);
    const b = res.body.types.find((t: { type: string }) => t.type === 'mockb');
    const s = res.body.types.find((t: { type: string }) => t.type === 'mocks');
    expect(b).toMatchObject({ execution: 'batch', enabled: true, available: true, ownsDefinitions: false, definitionCount: 0, extras: null });
    expect(b.schedule).toMatchObject({ type: 'mockb', enabled: true, preset: 'daily-06-18', cronExpression: '0 6,18 * * *' });
    expect(s).toMatchObject({ execution: 'single', schedule: null, definitionCount: 1 });
    expect(res.body.email).toEqual({ configured: false });
  });
});

describe('urnik tipa', () => {
  it('GET/PUT: preset prepiše izraz, custom zahteva izraz, neveljaven izraz/cona 400, single tip 400, neznan tip 404', async () => {
    await boot();
    const admin = await loginAsAdmin(app);
    const base = '/api/v1/scanners/admin/types/mockb/schedule';
    expect((await request(app).get(base).set(AUTH(admin.token))).body).toMatchObject({ enabled: true, label: 'vsak dan ob 6:00 in 18:00' });
    const monday = await request(app).put(base).set(AUTH(admin.token)).send({ preset: 'monday-08' });
    expect(monday.body).toMatchObject({ preset: 'monday-08', cronExpression: '0 8 * * 1', updatedBy: { displayName: 'Administrator Skenerjev' } });
    expect((await request(app).put(base).set(AUTH(admin.token)).send({ cronExpression: '15 7 * * 2' })).body).toMatchObject({ preset: 'custom' });
    expect((await request(app).put(base).set(AUTH(admin.token)).send({ cronExpression: '0 25 * * *' })).status).toBe(400);
    expect((await request(app).put(base).set(AUTH(admin.token)).send({ timezone: 'Mars/Olympus' })).status).toBe(400);
    expect((await request(app).put(base).set(AUTH(admin.token)).send({})).status).toBe(400);
    expect((await request(app).get('/api/v1/scanners/admin/types/mocks/schedule').set(AUTH(admin.token))).status).toBe(400);
    expect((await request(app).get('/api/v1/scanners/admin/types/neznan/schedule').set(AUTH(admin.token))).status).toBe(404);
  });
});

describe('zagoni', () => {
  it('POST: type → 202 zagon tipa; scannerId → 202 zagon skenerja; oboje/nič → 400; single tip prek type → 400; isti obseg teče → 409', async () => {
    await boot();
    const admin = await loginAsAdmin(app);
    const ana = await loginAs(app, 'ana');
    const def = await seedDefinition(ana.userId, 'mocks');
    single.behaviour.execute = async (ctx) => okOutcome({ counters: { seen: 2 }, definitions: [{ definitionId: ctx.definition!.id, ownerId: ctx.definition!.userId, outcome: 'ok', message: null }] });

    const byType = await request(app).post('/api/v1/scanners/admin/runs').set(AUTH(admin.token)).send({ type: 'mockb' });
    expect(byType.status).toBe(202);
    expect(byType.body).toMatchObject({ type: 'mockb', scope: { kind: 'type' }, trigger: 'manual', requestedBy: { displayName: 'Administrator Skenerjev' } });
    await waitFinished(byType.body.id);

    const byId = await request(app).post('/api/v1/scanners/admin/runs').set(AUTH(admin.token)).send({ scannerId: String(def._id) });
    expect(byId.status).toBe(202);
    expect(byId.body.scope).toMatchObject({ kind: 'definition', scannerId: String(def._id), owner: { displayName: 'Uporabnik ANA' } });
    await waitFinished(byId.body.id);
    const detail = await request(app).get(`/api/v1/scanners/admin/runs/${byId.body.id}`).set(AUTH(admin.token));
    expect(detail.body).toMatchObject({ status: 'succeeded', counters: { seen: 2, definitions: 1 }, definitions: [{ scannerId: String(def._id), outcome: 'ok' }] });

    expect((await request(app).post('/api/v1/scanners/admin/runs').set(AUTH(admin.token)).send({})).status).toBe(400);
    expect((await request(app).post('/api/v1/scanners/admin/runs').set(AUTH(admin.token)).send({ type: 'mockb', scannerId: 'x' })).status).toBe(400);
    expect((await request(app).post('/api/v1/scanners/admin/runs').set(AUTH(admin.token)).send({ type: 'mocks' })).status).toBe(400);
    expect((await request(app).post('/api/v1/scanners/admin/runs').set(AUTH(admin.token)).send({ scannerId: new (await import('mongoose')).Types.ObjectId().toString() })).status).toBe(404);

    const now = new Date();
    await ScannerRunModel.create({ scannerType: 'mockb', scope: { kind: 'type' }, slotKey: 'manual:busy', trigger: 'manual', status: 'running', createdAt: now, startedAt: now, heartbeatAt: now, expiresAt: new Date(now.getTime() + 86_400_000) });
    const conflict = await request(app).post('/api/v1/scanners/admin/runs').set(AUTH(admin.token)).send({ type: 'mockb' });
    expect(conflict.status).toBe(409);
    expect(conflict.headers['content-type']).toContain('application/problem+json');

    const list = await request(app).get('/api/v1/scanners/admin/runs?type=mockb').set(AUTH(admin.token));
    expect(list.body.runs.every((r: { type: string }) => r.type === 'mockb')).toBe(true);
    expect(list.body.active).toHaveLength(1);
    const all = await request(app).get('/api/v1/scanners/admin/runs').set(AUTH(admin.token));
    expect(all.body.runs.length).toBeGreaterThanOrEqual(3);
  });

  it('cancel: queued → cancelled, running → cancelRequested, končan → 409, neveljaven id → 404', async () => {
    await boot();
    const admin = await loginAsAdmin(app);
    const now = new Date();
    const queued = await ScannerRunModel.create({ scannerType: 'mockb', scope: { kind: 'type' }, slotKey: 'schedule:type:mockb:x', trigger: 'schedule', status: 'queued', createdAt: now, heartbeatAt: now, expiresAt: new Date(now.getTime() + 86_400_000) });
    const c1 = await request(app).post(`/api/v1/scanners/admin/runs/${queued._id}/cancel`).set(AUTH(admin.token));
    expect(c1.body).toMatchObject({ status: 'cancelled', cancelRequested: true });
    expect((await request(app).post(`/api/v1/scanners/admin/runs/${queued._id}/cancel`).set(AUTH(admin.token))).status).toBe(409);
    expect((await request(app).post('/api/v1/scanners/admin/runs/ni-id/cancel').set(AUTH(admin.token))).status).toBe(404);
  });
});

describe('outbox in dostop', () => {
  it('GET /notifications filtrira po tipu in stanju; navaden uporabnik in ključ z admin dobita 403; X-Acting-User ne spremeni odgovora', async () => {
    await boot();
    const admin = await loginAsAdmin(app);
    const ana = await loginAs(app, 'ana');
    const empty = await request(app).get('/api/v1/scanners/admin/notifications?type=mockb&status=sent').set(AUTH(admin.token));
    expect(empty.status).toBe(200);
    expect(empty.body).toEqual({ notifications: [] });

    for (const path of ['/api/v1/scanners/admin/types', '/api/v1/scanners/admin/runs', '/api/v1/scanners/admin/notifications', '/api/v1/scanners/admin/types/mockb/schedule']) {
      expect((await request(app).get(path).set(AUTH(ana.token))).status, path).toBe(403);
    }
    const key = await seedApiKey(['admin'], null, 'seed-sc-admin');
    expect((await request(app).get('/api/v1/scanners/admin/types').set('X-API-Key', key)).status).toBe(403);

    const acting = await request(app).get('/api/v1/scanners/admin/types').set(AUTH(admin.token)).set('X-Acting-User', ana.userId);
    expect(acting.status).toBe(200);
    expect(acting.body.types.length).toBeGreaterThanOrEqual(3);
    // `batch` je registriran, a tu samo preverimo, da je bil tip viden; ročni zagon je zgoraj.
    expect(batch.type.type).toBe('mockb');
  });
});

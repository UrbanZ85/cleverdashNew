import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../../src/main.js';
import { clearTestDb, startTestDb, stopTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { ScannerRunModel } from '../../../src/platform/scanner/models/scanner-run.model.js';
import { getLogger } from '../../../src/platform/logging/logger.js';
import { loadEnv } from '../../../src/platform/config/env.js';
import { runScannerTick, stopScannerSchedulerForTests } from '../../../src/platform/scanner/services/tick.js';
import { resetFakeProviderForTests } from '../../../src/modules/flight-deals/providers/fake.provider.js';
import { AUTH, loginAs, loginAsAdmin, seedRule } from '../flight-deals/_helpers.js';

// US6 iz 015 (FR-045 do FR-053) nad administracijo jedra skenerjev (016, US2): urnik tipa `flights`,
// zagoni, preklic, viri kot dodatek tipa — proti pogodbi 016. Pričakovanja so ista kot pred
// refaktoringom; spremenjene so poti in oblika odgovorov po pogodbi.

beforeAll(async () => {
  setTestEnv({ FLIGHT_FAKE_PROVIDER_ENABLED: 'true' });
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(async () => {
  stopScannerSchedulerForTests();
  resetFakeProviderForTests();
  await clearTestDb();
});

let app: Express;
async function boot() {
  app = (await createApp()).app;
}

const SCHEDULE = '/api/v1/scanners/admin/types/flights/schedule';
const OPTS = { typeOptions: { runner: { retryDelaysMs: [0, 0] } } };

describe('urnik tipa flights', () => {
  it('privzeto: vklopljen, vsak dan ob 6:00 in 18:00, Europe/Ljubljana, z naslednjim terminom (FR-049)', async () => {
    await boot();
    const admin = await loginAsAdmin(app);
    const res = await request(app).get(SCHEDULE).set(AUTH(admin.token));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ type: 'flights', enabled: true, preset: 'daily-06-18', cronExpression: '0 6,18 * * *', timezone: 'Europe/Ljubljana', updatedBy: null });
    expect(res.body.nextRunAt).toMatch(/T(04|05|16|17):00:00\.000Z$/);
    expect(res.body.nextRunLocal).toMatch(/ob (06|18):00$/);
    const types = await request(app).get('/api/v1/scanners/types').set(AUTH(admin.token));
    expect(types.body.presets.map((p: { id: string }) => p.id)).toEqual(['hourly', 'daily-06', 'daily-06-18', 'every-6h', 'monday-08']);
  });

  it('preset prepiše izraz; custom zahteva izraz; neveljaven izraz → 400 z razlago (FR-046, FR-047)', async () => {
    await boot();
    const admin = await loginAsAdmin(app);
    const monday = await request(app).put(SCHEDULE).set(AUTH(admin.token)).send({ preset: 'monday-08' });
    expect(monday.status).toBe(200);
    expect(monday.body).toMatchObject({ preset: 'monday-08', cronExpression: '0 8 * * 1' });
    expect(monday.body.updatedBy).toMatchObject({ displayName: 'Administrator Letov' });

    const custom = await request(app).put(SCHEDULE).set(AUTH(admin.token)).send({ cronExpression: '30 7 * * 2' });
    expect(custom.body).toMatchObject({ preset: 'custom', cronExpression: '30 7 * * 2' });

    const bad = await request(app).put(SCHEDULE).set(AUTH(admin.token)).send({ cronExpression: '0 25 * * *' });
    expect(bad.status).toBe(400);
    expect(bad.body.detail).toMatch(/ni veljaven/);
    const badTz = await request(app).put(SCHEDULE).set(AUTH(admin.token)).send({ timezone: 'Mars/Olympus' });
    expect(badTz.status).toBe(400);
  });

  it('izklopljen urnik: nextRunAt null, tik ne ustvari zagona, ročni zagon pa deluje', async () => {
    await boot();
    const admin = await loginAsAdmin(app);
    const off = await request(app).put(SCHEDULE).set(AUTH(admin.token)).send({ enabled: false });
    expect(off.body.nextRunAt).toBeNull();
    const tick = await runScannerTick(loadEnv(), getLogger(loadEnv()), new Date(), OPTS);
    expect(tick?.scheduled).toBe(0);
    expect(await ScannerRunModel.countDocuments()).toBe(0);
    const manual = await request(app).post('/api/v1/scanners/admin/runs').set(AUTH(admin.token)).send({ type: 'flights' });
    expect(manual.status).toBe(202);
    expect(manual.body).toMatchObject({ type: 'flights', trigger: 'manual', scope: { kind: 'type' }, requestedBy: expect.objectContaining({ displayName: 'Administrator Letov' }) });
  });

  it('navaden uporabnik urnika ne more spremeniti in zagona ne more sprožiti (SC-005)', async () => {
    await boot();
    const user = await loginAs(app, 'ana');
    expect((await request(app).put(SCHEDULE).set(AUTH(user.token)).send({ enabled: false })).status).toBe(403);
    expect((await request(app).post('/api/v1/scanners/admin/runs').set(AUTH(user.token)).send({ type: 'flights' })).status).toBe(403);
  });
});

describe('zagoni', () => {
  it('ročni zagon s testnim virom konča s števci; drugi klic med tekom → 409', async () => {
    await boot();
    const admin = await loginAsAdmin(app);
    const ana = await loginAs(app, 'ana');
    await seedRule(ana.userId);
    const started = await request(app).post('/api/v1/scanners/admin/runs').set(AUTH(admin.token)).send({ type: 'flights' });
    expect(started.status).toBe(202);
    const runId = started.body.id as string;
    // Zagon teče asinhrono; počakaj do konca.
    for (let i = 0; i < 50; i += 1) {
      const doc = await ScannerRunModel.findById(runId).lean<{ status: string } | null>();
      if (doc && doc.status !== 'queued' && doc.status !== 'running') break;
      await new Promise((r) => setTimeout(r, 100));
    }
    const res = await request(app).get(`/api/v1/scanners/admin/runs/${runId}`).set(AUTH(admin.token));
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('succeeded');
    expect(res.body.counters).toMatchObject({ rules: 1, newMatches: 2, providerRequests: 0, definitions: 1 });
    expect(res.body.definitions).toEqual([{ scannerId: expect.any(String), outcome: 'ok', message: null }]);
    expect(res.body.extras.providers.find((p: { providerId: string }) => p.providerId === 'fake')).toMatchObject({ enabled: true, ok: 1 });

    const list = await request(app).get('/api/v1/scanners/admin/runs?type=flights').set(AUTH(admin.token));
    expect(list.body.runs).toHaveLength(1);
    expect(list.body.active).toEqual([]);
  });

  it('409 med tekom in preklic: queued → cancelled, končan → 409', async () => {
    await boot();
    const admin = await loginAsAdmin(app);
    const now = new Date();
    const running = await ScannerRunModel.create({
      scannerType: 'flights',
      scope: { kind: 'type' },
      slotKey: 'manual:test-running',
      trigger: 'manual',
      status: 'running',
      createdAt: now,
      startedAt: now,
      heartbeatAt: now,
      cancelRequested: false,
      expiresAt: new Date(now.getTime() + 86_400_000),
    });
    const conflict = await request(app).post('/api/v1/scanners/admin/runs').set(AUTH(admin.token)).send({ type: 'flights' });
    expect(conflict.status).toBe(409);
    expect(conflict.headers['content-type']).toContain('application/problem+json');

    const cancel = await request(app).post(`/api/v1/scanners/admin/runs/${running._id}/cancel`).set(AUTH(admin.token));
    expect(cancel.status).toBe(200);
    expect(cancel.body.cancelRequested).toBe(true);
    expect(cancel.body.status).toBe('running'); // konča ga izvajalec, ko preveri zastavico

    await ScannerRunModel.updateOne({ _id: running._id }, { $set: { status: 'cancelled' } });
    const again = await request(app).post(`/api/v1/scanners/admin/runs/${running._id}/cancel`).set(AUTH(admin.token));
    expect(again.status).toBe(409);
    expect((await request(app).get('/api/v1/scanners/admin/runs/ni-id').set(AUTH(admin.token))).status).toBe(404);
  });
});

describe('viri in outbox', () => {
  it('admin vidi zadnjo napako, dnevno mejo in stanje pošte kot dodatek tipa; X-Acting-User ne spremeni odgovora', async () => {
    await boot();
    const admin = await loginAsAdmin(app);
    const ana = await loginAs(app, 'ana');
    const res = await request(app).get('/api/v1/scanners/admin/types').set(AUTH(admin.token));
    expect(res.status).toBe(200);
    const flights = res.body.types.find((t: { type: string }) => t.type === 'flights');
    expect(flights).toMatchObject({ label: 'Leti', execution: 'batch', ownsDefinitions: true, schedule: { enabled: true } });
    const ryanair = flights.extras.providers.find((p: { id: string }) => p.id === 'ryanair');
    expect(ryanair).toMatchObject({ official: false, enabled: false, dailyLimit: 2, requestsToday: 0, lastError: null });
    expect(res.body.email).toEqual({ configured: false });

    const acting = await request(app).get('/api/v1/scanners/admin/types').set(AUTH(admin.token)).set('X-Acting-User', ana.userId);
    expect(acting.status).toBe(200);
    expect(acting.body.types.length).toBe(res.body.types.length);

    const outbox = await request(app).get('/api/v1/scanners/admin/notifications?type=flights&status=suppressed').set(AUTH(admin.token));
    expect(outbox.status).toBe(200);
    expect(outbox.body).toEqual({ notifications: [] });
  });
});

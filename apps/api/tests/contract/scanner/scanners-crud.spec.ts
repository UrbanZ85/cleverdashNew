import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../../src/main.js';
import { clearTestDb, startTestDb, stopTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { ScannerDefinitionModel } from '../../../src/platform/scanner/models/scanner-definition.model.js';
import { ScannerResultModel } from '../../../src/platform/scanner/models/scanner-result.model.js';
import { ScannerResultHistoryModel } from '../../../src/platform/scanner/models/scanner-result-history.model.js';
import { Types } from 'mongoose';
import { seedRule } from '../flight-deals/_helpers.js';
import { AUTH, loginAs, registerMockType, seedApiKey, seedDefinition } from './_helpers.js';

// US4 (FR-005, FR-006, FR-009, FR-012, FR-015): CRUD generičnih definicij — proti pogodbi 016.

beforeAll(async () => {
  setTestEnv({ SCANNER_MAX_DEFINITIONS_PER_USER: '2' });
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(clearTestDb);

let app: Express;
async function boot() {
  app = (await createApp()).app;
  registerMockType('mocks', 'single');
  registerMockType('mockb', 'batch');
  registerMockType('mockoff', 'single', { enabled: false });
}

const VALID = { name: 'Moj mock', type: 'mocks', schedule: { preset: 'hourly' }, config: { n: 3 } };

describe('POST /scanners', () => {
  it('ustvari z urnikom, config preverjen po shemi tipa, 201 s celim skenerjem', async () => {
    await boot();
    const ana = await loginAs(app, 'ana');
    const res = await request(app).post('/api/v1/scanners').set(AUTH(ana.token)).send(VALID);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name: 'Moj mock',
      type: 'mocks',
      typeLabel: 'Tip mocks',
      enabled: true,
      config: { n: 3 },
      notifications: { enabled: true, mode: 'all-changes' },
      resultCount: 0,
      lastRun: null,
      schedule: { mode: 'own', preset: 'hourly', cronExpression: '0 * * * *', timezone: 'Europe/Ljubljana', label: 'vsako uro' },
    });
    expect(res.body.schedule.nextRunAt).toMatch(/:00:00\.000Z$/);
    expect(res.body.links).toEqual({ edit: `/scanners/${res.body.id}/edit`, results: `/scanners/${res.body.id}` });
    // Nov skener ne dohiteva: pokrito do zdaj.
    expect((await ScannerDefinitionModel.findById(res.body.id).lean())?.schedule.lastScheduledSlotAt).toBeTruthy();
  });

  it('400: config po shemi, pomen (validateConfig), tip z lastnimi definicijami, neregistriran, izklopljen, batch, cron, cona, meja', async () => {
    await boot();
    const ana = await loginAs(app, 'ana');
    const post = (body: Record<string, unknown>) => request(app).post('/api/v1/scanners').set(AUTH(ana.token)).send(body);
    expect((await post({ ...VALID, config: { n: 'x' } })).body.detail).toMatch(/Nastavitve skenerja niso veljavne/);
    expect((await post({ ...VALID, config: { n: 13 } })).body.detail).toBe('Trinajst ni dovoljeno.');
    const flights = await post({ ...VALID, type: 'flights' });
    expect(flights.status).toBe(400);
    expect(flights.body.detail).toContain('/flight-deals/searches/new');
    expect((await post({ ...VALID, type: 'neznan' })).status).toBe(400);
    expect((await post({ ...VALID, type: 'mockoff' })).body.detail).toMatch(/izklopljen/);
    expect((await post({ ...VALID, type: 'mockb' })).body.detail).toMatch(/urniku tipa/);
    expect((await post({ ...VALID, schedule: { cronExpression: '0 25 * * *' } })).body.detail).toMatch(/ni veljaven/);
    expect((await post({ ...VALID, schedule: { timezone: 'Mars/Olympus' } })).status).toBe(400);
    expect((await post({ ...VALID, config: { n: 1, fn: 'x' } })).status).toBe(201); // odvečna polja shema tipa odreže
    expect((await post({ ...VALID, name: 'Drugi' })).status).toBe(201);
    const limit = await post({ ...VALID, name: 'Tretji' });
    expect(limit.status).toBe(400);
    expect(limit.body.detail).toMatch(/mejo 2/);
  });
});

describe('GET/PATCH/DELETE /scanners/:id', () => {
  it('GET: lasten 200; tuj 404; id iskanja letov 404; neveljaven id 404', async () => {
    await boot();
    const ana = await loginAs(app, 'ana');
    const bor = await loginAs(app, 'bor');
    const mine = await seedDefinition(ana.userId, 'mocks');
    const theirs = await seedDefinition(bor.userId, 'mocks');
    const rule = await seedRule(ana.userId);
    expect((await request(app).get(`/api/v1/scanners/${mine._id}`).set(AUTH(ana.token))).status).toBe(200);
    expect((await request(app).get(`/api/v1/scanners/${theirs._id}`).set(AUTH(ana.token))).status).toBe(404);
    expect((await request(app).get(`/api/v1/scanners/${rule._id}`).set(AUTH(ana.token))).status).toBe(404);
    expect((await request(app).get('/api/v1/scanners/ni-id').set(AUTH(ana.token))).status).toBe(404);
  });

  it('PATCH: delni vnos, config kot celota, sprememba izraza premakne pokrito-do; prazen patch 400; tuj 404', async () => {
    await boot();
    const ana = await loginAs(app, 'ana');
    const bor = await loginAs(app, 'bor');
    const def = await seedDefinition(ana.userId, 'mocks');
    const before = (await ScannerDefinitionModel.findById(def._id).lean())?.schedule.lastScheduledSlotAt ?? null;
    expect(before).toBeNull();

    const renamed = await request(app).patch(`/api/v1/scanners/${def._id}`).set(AUTH(ana.token)).send({ name: 'Novo ime', enabled: false, notifications: { enabled: false } });
    expect(renamed.status).toBe(200);
    expect(renamed.body).toMatchObject({ name: 'Novo ime', enabled: false, notifications: { enabled: false }, config: { n: 3 } });
    expect(renamed.body.schedule.nextRunAt).toBeNull();

    expect((await request(app).patch(`/api/v1/scanners/${def._id}`).set(AUTH(ana.token)).send({ config: { n: 13 } })).status).toBe(400);
    const cfg = await request(app).patch(`/api/v1/scanners/${def._id}`).set(AUTH(ana.token)).send({ config: { n: 7 } });
    expect(cfg.body.config).toEqual({ n: 7 });

    const sched = await request(app).patch(`/api/v1/scanners/${def._id}`).set(AUTH(ana.token)).send({ schedule: { preset: 'every-6h', timezone: 'America/New_York' } });
    expect(sched.body.schedule).toMatchObject({ preset: 'every-6h', cronExpression: '0 */6 * * *', timezone: 'America/New_York', label: 'vsakih 6 ur (America/New_York)' });
    expect((await ScannerDefinitionModel.findById(def._id).lean())?.schedule.lastScheduledSlotAt).toBeTruthy();

    expect((await request(app).patch(`/api/v1/scanners/${def._id}`).set(AUTH(ana.token)).send({})).status).toBe(400);
    expect((await request(app).patch(`/api/v1/scanners/${def._id}`).set(AUTH(bor.token)).send({ name: 'x' })).status).toBe(404);
  });

  it('DELETE: 200 {deleted:true}, rezultati in zgodovina izbrisani; drugi klic 404', async () => {
    await boot();
    const ana = await loginAs(app, 'ana');
    const def = await seedDefinition(ana.userId, 'mocks');
    const now = new Date();
    const result = await ScannerResultModel.create({
      definitionId: def._id,
      userId: def.userId,
      scannerType: 'mocks',
      identityKey: 'k',
      source: 'mock',
      title: 'x',
      dataAt: now,
      firstSeenAt: now,
      lastSeenAt: now,
      lastCheckedAt: now,
      lastChangeType: 'NEW',
      expiresAt: new Date(now.getTime() + 86_400_000),
    });
    await ScannerResultHistoryModel.create({ resultId: result._id, runId: new Types.ObjectId(), checkedAt: now, changeType: 'NEW', expiresAt: now });
    const res = await request(app).delete(`/api/v1/scanners/${def._id}`).set(AUTH(ana.token));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deleted: true });
    expect(await ScannerResultModel.countDocuments()).toBe(0);
    expect(await ScannerResultHistoryModel.countDocuments()).toBe(0);
    expect((await request(app).delete(`/api/v1/scanners/${def._id}`).set(AUTH(ana.token))).status).toBe(404);
  });

  it('Idempotency-Key: ponovljen POST vrne isti odgovor, ne drugega skenerja', async () => {
    await boot();
    const ana = await loginAs(app, 'ana');
    const key = 'idem-016-1';
    const first = await request(app).post('/api/v1/scanners').set(AUTH(ana.token)).set('Idempotency-Key', key).send(VALID);
    const second = await request(app).post('/api/v1/scanners').set(AUTH(ana.token)).set('Idempotency-Key', key).send(VALID);
    expect(first.status).toBe(201);
    expect(second.body.id).toBe(first.body.id);
    expect(await ScannerDefinitionModel.countDocuments()).toBe(1);
  });

  it('API ključ: scanners:write brez obsega tipa → 403; z obsegom tipa ustvari v imenu lastnika', async () => {
    await boot();
    const ana = await loginAs(app, 'ana');
    registerMockType('scoped', 'single', { scopes: { read: 'notes:read', write: 'notes:write' } });
    const writeOnly = await seedApiKey(['scanners:read', 'scanners:write'], ana.userId, 'seed-sc-w');
    expect((await request(app).post('/api/v1/scanners').set('X-API-Key', writeOnly).send({ ...VALID, type: 'scoped' })).status).toBe(403);
    const full = await seedApiKey(['scanners:read', 'scanners:write', 'notes:read', 'notes:write'], ana.userId, 'seed-sc-full');
    const created = await request(app).post('/api/v1/scanners').set('X-API-Key', full).send({ ...VALID, type: 'scoped' });
    expect(created.status).toBe(201);
    expect((await request(app).get('/api/v1/scanners').set(AUTH(ana.token))).body.scanners).toHaveLength(1);
  });
});

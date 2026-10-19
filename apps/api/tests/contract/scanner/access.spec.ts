import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../../src/main.js';
import { clearTestDb, startTestDb, stopTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { AUTH, loginAs, loginAsAdmin, registerMockType, seedApiKey, seedDefinition } from './_helpers.js';

// FR-007, FR-049, SC-008: kdo pride kam. Prevzem imena (012) velja za seznam, ne za administracijo.

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(clearTestDb);

let app: Express;
async function boot() {
  app = (await createApp()).app;
  registerMockType('mocks', 'single');
}

describe('dostop do jedra skenerjev', () => {
  it('navaden uporabnik ima zavihek in bere svoj (prazen) seznam; brez poverilnic 401/403', async () => {
    await boot();
    const ana = await loginAs(app, 'ana');
    const tabs = await request(app).get('/api/v1/tabs').set(AUTH(ana.token));
    expect((tabs.body as Array<{ id: string }>).map((t) => t.id)).toContain('scanners');
    const res = await request(app).get('/api/v1/scanners').set(AUTH(ana.token));
    expect(res.body).toEqual({ scanners: [], limits: { maxPerUser: 20 } });
    const anon = await request(app).get('/api/v1/scanners');
    expect([401, 403]).toContain(anon.status);
    expect(anon.headers['content-type']).toContain('application/problem+json');
  });

  it('API ključ brez scanners:read dobi 403 na seznamu; ključ brez scanners:write ne more pisati', async () => {
    await boot();
    const ana = await loginAs(app, 'ana');
    expect((await request(app).get('/api/v1/scanners').set('X-API-Key', await seedApiKey(['notes:read']))).status).toBe(403);
    const read = await seedApiKey(['scanners:read'], ana.userId, 'seed-sc-r');
    expect((await request(app).get('/api/v1/scanners').set('X-API-Key', read)).status).toBe(200);
    expect((await request(app).post('/api/v1/scanners').set('X-API-Key', read).send({ name: 'x', type: 'mocks', config: { n: 1 } })).status).toBe(403);
  });

  it('admin vidi vse; s prevzetim imenom (X-Acting-User) vidi skenerje prevzetega uporabnika', async () => {
    await boot();
    const admin = await loginAsAdmin(app);
    const ana = await loginAs(app, 'ana');
    await seedDefinition(ana.userId, 'mocks', { name: 'Anin' });
    expect((await request(app).get('/api/v1/scanners').set(AUTH(admin.token))).body.scanners).toEqual([]);
    const acting = await request(app).get('/api/v1/scanners').set(AUTH(admin.token)).set('X-Acting-User', ana.userId);
    expect(acting.status).toBe(200);
    expect(acting.body.scanners.map((s: { name: string }) => s.name)).toEqual(['Anin']);
  });
});

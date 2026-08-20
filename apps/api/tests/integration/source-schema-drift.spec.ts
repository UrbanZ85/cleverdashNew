import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/main.js';
import { startTestDb, stopTestDb, clearTestDb } from '../setup/mongo-memory.js';
import { setTestEnv } from '../setup/test-env.js';
import { ExternalCacheModel } from '../../src/platform/cache/model.js';

// research.md §13: uspešen odgovor (HTTP 200) s spremenjeno strukturo uporabljenega dela
// MORA šteti kot neuspel poskus osvežitve, ne kot uspeh z napačnimi podatki. Brez tega bi
// ploščica prikazala razčlenjeno "smeti" namesto zadnjega znanega podatka.

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(() => {
  vi.unstubAllGlobals();
  return clearTestDb();
});

async function loginAndUnlock(app: import('express').Express) {
  const login = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'admin@example.com', password: 'zacetno-geslo-12', platform: 'android' });
  await request(app)
    .post('/api/v1/auth/password')
    .set('Authorization', `Bearer ${login.body.accessToken}`)
    .send({ currentPassword: 'zacetno-geslo-12', newPassword: 'novo-mocno-geslo-123' });
  return login.body.accessToken as string;
}

const GOOD = {
  observation: { features: [{ properties: { days: [{ date: 'x', timeline: [{ t: '25', valid: '2026-08-19T10:00:00+00:00' }] }] } }] },
  forecast3h: { features: [{ properties: { days: [{ date: 'x', timeline: [] }] } }] },
};

describe('spremenjena struktura odgovora vira (schema drift)', () => {
  it('uspešen 200 z manjkajočim "valid" v timeline zavrne razčlenjevanje in obdrži zadnji znan podatek', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);

    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(GOOD), { status: 200, headers: { 'content-type': 'application/json' } })));
    const first = await request(app).get('/api/v1/dashboard/weather').set('Authorization', `Bearer ${token}`);
    expect(first.body.observation.temperatureC).toBe(25);

    await ExternalCacheModel.updateMany({}, { expiresAt: new Date(Date.now() - 1000) });

    // Vir zdaj vrne HTTP 200, a "valid" manjka — shema to zavrne kot neveljavno.
    const broken = JSON.parse(JSON.stringify(GOOD));
    delete broken.observation.features[0].properties.days[0].timeline[0].valid;
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(broken), { status: 200, headers: { 'content-type': 'application/json' } })));

    const second = await request(app).get('/api/v1/dashboard/weather').set('Authorization', `Bearer ${token}`);
    expect(second.status).toBe(200);
    expect(second.body.source.stale).toBe(true); // šteje kot neuspel poskus, ne kot uspeh
    expect(second.body.observation.temperatureC).toBe(25); // stari, veljavni podatek ostane
  });
});

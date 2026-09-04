import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/main.js';
import { startTestDb, stopTestDb, clearTestDb } from '../setup/mongo-memory.js';
import { setTestEnv } from '../setup/test-env.js';
import { ExternalCacheModel } from '../../src/platform/cache/model.js';
import { fakeKeycloakForTests } from '../setup/keycloak-global.js';
import { loginAsTestUser } from '../setup/login-as-test-user.js';

// 004: `openid-client` (Keycloak) uporablja isti globalni `fetch` — klici proti ponarejenemu
// Keycloaku (127.0.0.1) MORAJO iti do resničnega omrežja, ne v spodnje ročne mocke.
const realFetch = globalThis.fetch;
function stubFetchOnly(impl: (input: string | URL) => Promise<Response>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      if (String(input).includes('127.0.0.1')) return realFetch(input, init);
      return impl(input);
    }),
  );
}

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

// 004: nadomesti prejšnjo prijavo z e-pošto/geslom — glej tests/setup/login-as-test-user.ts.
async function loginAndUnlock(app: import('express').Express) {
  const { accessToken } = await loginAsTestUser(app, fakeKeycloakForTests, { roles: ['cleverdash-admin'] });
  return accessToken;
}

const GOOD = {
  observation: { features: [{ properties: { days: [{ date: 'x', timeline: [{ t: '25', valid: '2026-08-19T10:00:00+00:00' }] }] } }] },
  forecast3h: { features: [{ properties: { days: [{ date: 'x', timeline: [] }] } }] },
};

describe('spremenjena struktura odgovora vira (schema drift)', () => {
  it('uspešen 200 z manjkajočim "valid" v timeline zavrne razčlenjevanje in obdrži zadnji znan podatek', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);

    stubFetchOnly(async () => new Response(JSON.stringify(GOOD), { status: 200, headers: { 'content-type': 'application/json' } }));
    const first = await request(app).get('/api/v1/dashboard/weather').set('Authorization', `Bearer ${token}`);
    expect(first.body.observation.temperatureC).toBe(25);

    await ExternalCacheModel.updateMany({}, { expiresAt: new Date(Date.now() - 1000) });

    // Vir zdaj vrne HTTP 200, a "valid" manjka — shema to zavrne kot neveljavno.
    const broken = JSON.parse(JSON.stringify(GOOD));
    delete broken.observation.features[0].properties.days[0].timeline[0].valid;
    stubFetchOnly(async () => new Response(JSON.stringify(broken), { status: 200, headers: { 'content-type': 'application/json' } }));

    const second = await request(app).get('/api/v1/dashboard/weather').set('Authorization', `Bearer ${token}`);
    expect(second.status).toBe(200);
    expect(second.body.source.stale).toBe(true); // šteje kot neuspel poskus, ne kot uspeh
    expect(second.body.observation.temperatureC).toBe(25); // stari, veljavni podatek ostane
  });
});

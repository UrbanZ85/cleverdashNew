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

// FR-026, SC-003: vir ne odgovori → zadnji znani podatek s stale:true, NE napaka in NE
// prazen zaslon.

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

const OK_WEATHER = {
  observation: { features: [{ properties: { days: [{ date: 'x', timeline: [{ t: '20', valid: '2026-08-19T10:00:00+00:00' }] }] } }] },
  forecast3h: { features: [{ properties: { days: [{ date: 'x', timeline: [] }] } }] },
};

describe('izpad zunanjega vira med delovanjem (FR-026, SC-003)', () => {
  it('vreme: potem ko je bil vir dosegljiv, izpad vrne zadnji znani podatek s stale:true', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);

    // 1. vir je dosegljiv
    stubFetchOnly(async () => new Response(JSON.stringify(OK_WEATHER), { status: 200, headers: { 'content-type': 'application/json' } }));
    const first = await request(app).get('/api/v1/dashboard/weather').set('Authorization', `Bearer ${token}`);
    expect(first.status).toBe(200);
    expect(first.body.source.stale).toBe(false);

    // 2. TTL poteče, vir postane nedosegljiv
    await ExternalCacheModel.updateMany({}, { expiresAt: new Date(Date.now() - 1000) });
    stubFetchOnly(async () => {
      throw new Error('ECONNREFUSED');
    });

    const second = await request(app).get('/api/v1/dashboard/weather').set('Authorization', `Bearer ${token}`);
    expect(second.status).toBe(200); // NE napaka
    expect(second.body.source.stale).toBe(true);
    expect(second.body.observation.temperatureC).toBe(20); // isti podatek kot prej
  });

  it('radar: izpad ne vpliva na vremensko ploščico (izolacija po viru)', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);

    stubFetchOnly(async (input) => {
      const url = String(input);
      if (url.includes('vreme')) {
        return new Response(JSON.stringify(OK_WEATHER), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      throw new Error('radar nedosegljiv');
    });

    const weather = await request(app).get('/api/v1/dashboard/weather').set('Authorization', `Bearer ${token}`);
    expect(weather.status).toBe(200);

    const radar = await request(app).get('/api/v1/dashboard/radar').set('Authorization', `Bearer ${token}`);
    expect(radar.status).toBe(503); // radarja še nikoli ni bilo — ločen vir, ločen izid
  });
});

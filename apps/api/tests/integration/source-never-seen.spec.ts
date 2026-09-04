import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/main.js';
import { startTestDb, stopTestDb, clearTestDb } from '../setup/mongo-memory.js';
import { setTestEnv } from '../setup/test-env.js';
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

// Robni primer iz spec.md: "zadnji znani podatek ne obstaja (prvi zagon ob izpadu)" →
// sporočilo, da podatka še ni, in možnost ponovnega poskusa. Na API ravni je to 503 z
// jasnim, netehničnim sporočilom (RFC 9457).

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

describe('vira ni bilo nikoli (prvi zagon ob izpadu)', () => {
  it('/dashboard/weather vrne 503 z netehničnim sporočilom in correlationId', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    stubFetchOnly(async () => {
      throw new Error('getaddrinfo ENOTFOUND vreme.arso.gov.si');
    });

    const res = await request(app).get('/api/v1/dashboard/weather').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(503);
    expect(res.body.detail).not.toContain('ENOTFOUND'); // brez tehnične podrobnosti (FR-026)
    expect(res.body.correlationId).toBeTruthy();
  });

  it('/dashboard/radar vrne 503, ko slike še nikoli ni bilo', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    stubFetchOnly(async () => {
      throw new Error('timeout');
    });

    const res = await request(app).get('/api/v1/dashboard/radar').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(503);
  });

  it('po enkratnem 503 nov poskus uspe, ko vir spet odgovori (gumb "poskusi znova")', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    stubFetchOnly(async () => {
      throw new Error('timeout');
    });
    const failed = await request(app).get('/api/v1/dashboard/radar').set('Authorization', `Bearer ${token}`);
    expect(failed.status).toBe(503);

    stubFetchOnly(async () => new Response(Buffer.from('gif'), { status: 200, headers: { 'content-type': 'image/gif' } }));
    const retried = await request(app).get('/api/v1/dashboard/radar').set('Authorization', `Bearer ${token}`);
    expect(retried.status).toBe(200);
  });
});

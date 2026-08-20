import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/main.js';
import { startTestDb, stopTestDb, clearTestDb } from '../setup/mongo-memory.js';
import { setTestEnv } from '../setup/test-env.js';

// FR-027, SC-009: navedba vira ni oblikovna podrobnost, je funkcionalna zahteva. Ta test
// obstaja ločeno od dashboard.spec.ts, da sprememba tam po pomoti ne izgubi pokritja tega
// pogoja — namen je posebej izpostavljen, ne le naključno preverjen mimogrede.

function stubFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes('vreme.arso.gov.si')) {
        return new Response(
          JSON.stringify({
            observation: { features: [{ properties: { days: [{ date: 'x', timeline: [{ valid: '2026-08-19T13:00:00+00:00' }] }] } }] },
            forecast3h: { features: [{ properties: { days: [{ date: 'x', timeline: [] }] } }] },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(Buffer.from('gif'), {
        status: 200,
        headers: { 'content-type': 'image/gif', etag: '"e1"', 'last-modified': 'Wed, 19 Aug 2026 13:00:00 GMT' },
      });
    }),
  );
}

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(() => {
  vi.unstubAllGlobals();
  return clearTestDb();
});
beforeEach(stubFetch);

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

describe('navedba vira ARSO (FR-027, SC-009)', () => {
  it('/dashboard/weather nosi attribution s pravilnim besedilom in povezavo', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const res = await request(app).get('/api/v1/dashboard/weather').set('Authorization', `Bearer ${token}`);
    expect(res.body.source.attribution).toEqual({ text: 'Vir: ARSO', url: 'https://meteo.arso.gov.si' });
  });

  it('/dashboard/forecast nosi attribution', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const res = await request(app).get('/api/v1/dashboard/forecast').set('Authorization', `Bearer ${token}`);
    expect(res.body.source.attribution).toEqual({ text: 'Vir: ARSO', url: 'https://meteo.arso.gov.si' });
  });

  it('/dashboard/radar nosi attribution v glavi X-Source-Attribution', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const res = await request(app).get('/api/v1/dashboard/radar').set('Authorization', `Bearer ${token}`);
    expect(res.headers['x-source-attribution']).toBe('Vir: ARSO');
  });
});

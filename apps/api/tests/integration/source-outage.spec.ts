import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/main.js';
import { startTestDb, stopTestDb, clearTestDb } from '../setup/mongo-memory.js';
import { setTestEnv } from '../setup/test-env.js';
import { ExternalCacheModel } from '../../src/platform/cache/model.js';

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

const OK_WEATHER = {
  observation: { features: [{ properties: { days: [{ date: 'x', timeline: [{ t: '20', valid: '2026-08-19T10:00:00+00:00' }] }] } }] },
  forecast3h: { features: [{ properties: { days: [{ date: 'x', timeline: [] }] } }] },
};

describe('izpad zunanjega vira med delovanjem (FR-026, SC-003)', () => {
  it('vreme: potem ko je bil vir dosegljiv, izpad vrne zadnji znani podatek s stale:true', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);

    // 1. vir je dosegljiv
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(OK_WEATHER), { status: 200, headers: { 'content-type': 'application/json' } })));
    const first = await request(app).get('/api/v1/dashboard/weather').set('Authorization', `Bearer ${token}`);
    expect(first.status).toBe(200);
    expect(first.body.source.stale).toBe(false);

    // 2. TTL poteče, vir postane nedosegljiv
    await ExternalCacheModel.updateMany({}, { expiresAt: new Date(Date.now() - 1000) });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED'); }));

    const second = await request(app).get('/api/v1/dashboard/weather').set('Authorization', `Bearer ${token}`);
    expect(second.status).toBe(200); // NE napaka
    expect(second.body.source.stale).toBe(true);
    expect(second.body.observation.temperatureC).toBe(20); // isti podatek kot prej
  });

  it('radar: izpad ne vpliva na vremensko ploščico (izolacija po viru)', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url.includes('vreme')) {
          return new Response(JSON.stringify(OK_WEATHER), { status: 200, headers: { 'content-type': 'application/json' } });
        }
        throw new Error('radar nedosegljiv');
      }),
    );

    const weather = await request(app).get('/api/v1/dashboard/weather').set('Authorization', `Bearer ${token}`);
    expect(weather.status).toBe(200);

    const radar = await request(app).get('/api/v1/dashboard/radar').set('Authorization', `Bearer ${token}`);
    expect(radar.status).toBe(503); // radarja še nikoli ni bilo — ločen vir, ločen izid
  });
});

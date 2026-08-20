import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/main.js';
import { startTestDb, stopTestDb, clearTestDb } from '../setup/mongo-memory.js';
import { setTestEnv } from '../setup/test-env.js';

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

describe('vira ni bilo nikoli (prvi zagon ob izpadu)', () => {
  it('/dashboard/weather vrne 503 z netehničnim sporočilom in correlationId', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('getaddrinfo ENOTFOUND vreme.arso.gov.si'); }));

    const res = await request(app).get('/api/v1/dashboard/weather').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(503);
    expect(res.body.detail).not.toContain('ENOTFOUND'); // brez tehnične podrobnosti (FR-026)
    expect(res.body.correlationId).toBeTruthy();
  });

  it('/dashboard/radar vrne 503, ko slike še nikoli ni bilo', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('timeout'); }));

    const res = await request(app).get('/api/v1/dashboard/radar').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(503);
  });

  it('po enkratnem 503 nov poskus uspe, ko vir spet odgovori (gumb "poskusi znova")', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('timeout'); }));
    const failed = await request(app).get('/api/v1/dashboard/radar').set('Authorization', `Bearer ${token}`);
    expect(failed.status).toBe(503);

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(Buffer.from('gif'), { status: 200, headers: { 'content-type': 'image/gif' } })),
    );
    const retried = await request(app).get('/api/v1/dashboard/radar').set('Authorization', `Bearer ${token}`);
    expect(retried.status).toBe(200);
  });
});

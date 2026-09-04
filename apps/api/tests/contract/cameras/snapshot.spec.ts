import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/main.js';
import { startTestDb, stopTestDb, clearTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { loginAndUnlock, seedCameraFixture } from './_helpers.js';

// Pogodbeni test: GET /cameras/{id}/snapshot (FR-041, FR-021).

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(() => {
  vi.unstubAllGlobals();
  return clearTestDb();
});

// 004: `openid-client` (Keycloak) uporablja isti globalni `fetch` — klici proti ponarejenemu
// Keycloaku (127.0.0.1) MORAJO iti do resničnega omrežja, ne v spodnje ročne mocke.
const realFetch = globalThis.fetch;

function stubFetchOk() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      if (String(input).includes('127.0.0.1')) return realFetch(input, init);
      return new Response(Buffer.from('jpeg-binarni-placeholder'), {
        status: 200,
        headers: { 'content-type': 'image/jpeg' },
      });
    }),
  );
}

function stubFetchFail() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      if (String(input).includes('127.0.0.1')) return realFetch(input, init);
      return new Response('napaka', { status: 500 });
    }),
  );
}

describe('GET /cameras/{id}/snapshot pogodba', () => {
  it('vrne sliko in glave svežosti ob prvem uspešnem zajemu', async () => {
    stubFetchOk();
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const camera = await seedCameraFixture({ type: 'snapshot', previewUrl: 'https://example.com/snap.jpg' });

    const res = await request(app)
      .get(`/api/v1/cameras/${camera._id}/snapshot`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('image/jpeg');
    expect(res.headers['x-camera-freshness']).toBe('refreshed');
    expect(res.headers['x-camera-age-seconds']).toBe('0');
  });

  it('brez predhodnega zajema in neuspešnim virom vrne 503 (never-fetched, FR-026 vzorec)', async () => {
    stubFetchFail();
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const camera = await seedCameraFixture({ type: 'snapshot', previewUrl: 'https://example.com/snap.jpg' });

    const res = await request(app)
      .get(`/api/v1/cameras/${camera._id}/snapshot`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(503);
  });

  it('neuspel poskus po uspešnem zajemu vrne zadnji znani posnetek kot "stale" (FR-011)', async () => {
    stubFetchOk();
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const camera = await seedCameraFixture({
      type: 'snapshot',
      previewUrl: 'https://example.com/snap.jpg',
      refreshIntervalSeconds: 0,
    });
    await request(app).get(`/api/v1/cameras/${camera._id}/snapshot`).set('Authorization', `Bearer ${token}`);

    stubFetchFail();
    const res = await request(app)
      .get(`/api/v1/cameras/${camera._id}/snapshot`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.headers['x-camera-freshness']).toBe('stale');
  });

  it('neobstoječa kamera vrne 404', async () => {
    stubFetchOk();
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const res = await request(app)
      .get('/api/v1/cameras/000000000000000000000000/snapshot')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

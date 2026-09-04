import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/main.js';
import { startTestDb, stopTestDb, clearTestDb } from '../setup/mongo-memory.js';
import { setTestEnv } from '../setup/test-env.js';
import { loginAndUnlock, seedCameraFixture } from '../contract/cameras/_helpers.js';

// quickstart.md §3.5, §4 primer 7-8: kamera po CAMERA_UNREACHABLE_THRESHOLD zaporednih
// neuspehih preide v "unreachable", ostale kamere ostanejo nedotaknjene (Story 5).

beforeAll(async () => {
  setTestEnv({ CAMERA_UNREACHABLE_THRESHOLD: '2' });
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(() => {
  vi.unstubAllGlobals();
  return clearTestDb();
});

// 004: `openid-client` (Keycloak) uporablja isti globalni `fetch` — klici proti ponarejenemu
// Keycloaku (127.0.0.1) MORAJO iti do resničnega omrežja, ne v spodnje ročne mocke, sicer
// vsaka naslednja avtenticirana zahteva spodleti (živo preverjanje na vsako zahtevo, FR-006).
const realFetch = globalThis.fetch;

describe('Kamera ne dela — US5 konec-do-konca', () => {
  it('dva zaporedna neuspeha (prag=2) postavita kamero na "unreachable", druga kamera ostane "ok"', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);

    const broken = await seedCameraFixture({
      name: 'Pokvarjena',
      type: 'snapshot',
      previewUrl: 'https://example.com/broken.jpg',
      refreshIntervalSeconds: 0,
    });
    const healthy = await seedCameraFixture({
      name: 'Zdrava',
      type: 'snapshot',
      previewUrl: 'https://example.com/healthy.jpg',
      order: 1,
      refreshIntervalSeconds: 3600,
    });

    // Prvi uspešen zajem obeh (da imata izhodišče v ExternalCache).
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        if (String(input).includes('127.0.0.1')) return realFetch(input, init);
        return new Response(Buffer.from('jpeg'), { status: 200, headers: { 'content-type': 'image/jpeg' } });
      }),
    );
    await request(app).get(`/api/v1/cameras/${broken._id}/snapshot`).set('Authorization', `Bearer ${token}`);
    await request(app).get(`/api/v1/cameras/${healthy._id}/snapshot`).set('Authorization', `Bearer ${token}`);

    // Dva zaporedna neuspeha SAMO za "broken" (refreshIntervalSeconds: 0 pomeni takojšen izteg).
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        if (String(input).includes('127.0.0.1')) return realFetch(input, init);
        return new Response('napaka', { status: 500 });
      }),
    );
    await request(app).get(`/api/v1/cameras/${broken._id}/snapshot`).set('Authorization', `Bearer ${token}`);
    await request(app).get(`/api/v1/cameras/${broken._id}/snapshot`).set('Authorization', `Bearer ${token}`);

    const brokenHealth = await request(app)
      .get(`/api/v1/cameras/${broken._id}/health`)
      .set('Authorization', `Bearer ${token}`);
    expect(brokenHealth.body.state).toBe('unreachable');
    expect(brokenHealth.body.consecutiveFailures).toBe(2);

    const healthyHealth = await request(app)
      .get(`/api/v1/cameras/${healthy._id}/health`)
      .set('Authorization', `Bearer ${token}`);
    expect(healthyHealth.body.state).toBe('ok');
  });
});

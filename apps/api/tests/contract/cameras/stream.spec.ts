import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/main.js';
import { startTestDb, stopTestDb, clearTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { loginAndUnlock, seedCameraFixture } from './_helpers.js';

// Pogodbeni test: GET /cameras/{id}/stream (research.md §4 — pass-through, brez
// predpomnjenja).

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

describe('GET /cameras/{id}/stream pogodba', () => {
  it('pretoči telo in vrsto vsebine iz vira', async () => {
    // Namerno NE `multipart/x-mixed-replace` (dejanska vrsta za mjpeg, glej openapi.yaml):
    // supertest/superagent samodejno poskuša razčleniti odgovore s to vrsto vsebine kot
    // pravi multipart tok in zavrne ta placeholder telesa (ni resničnih meja). Backend sam
    // (`pipeCameraStream`) je slep na vsebino — pretaka karkoli vrne vir — zato ta test
    // preverja isti mehanizem z nevtralno vrsto vsebine, brez odjemalčeve posebne obravnave.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        if (String(input).includes('127.0.0.1')) return realFetch(input, init);
        return new Response('tok-placeholder', {
          status: 200,
          headers: { 'content-type': 'application/octet-stream' },
        });
      }),
    );
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const camera = await seedCameraFixture({ type: 'mjpeg', previewUrl: 'https://example.com/stream' });

    const res = await request(app)
      .get(`/api/v1/cameras/${camera._id}/stream`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/octet-stream');
    // `application/octet-stream` se v supertest/superagent razčleni kot binarno telo
    // (`res.body`, Buffer), ne `res.text` — od tod pretvorba.
    expect(Buffer.from(res.body as Uint8Array).toString('utf8')).toBe('tok-placeholder');
  });

  it('nedosegljiv vir vrne 502', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        if (String(input).includes('127.0.0.1')) return realFetch(input, init);
        return new Response('napaka', { status: 500 });
      }),
    );
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const camera = await seedCameraFixture({ type: 'mjpeg', previewUrl: 'https://example.com/stream' });

    const res = await request(app)
      .get(`/api/v1/cameras/${camera._id}/stream`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(502);
  });
});

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/main.js';
import { startTestDb, stopTestDb, clearTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { loginAndUnlock } from './_helpers.js';

// Pogodbeni test: GET /cameras/arso-webcams (FR-037).

function weatherFixture(webcam?: { direction: string; image: string }[]) {
  return {
    observation: {
      features: [
        {
          properties: {
            days: [
              {
                date: '2026-08-19',
                timeline: [
                  {
                    t: '20',
                    valid: '2026-08-19T13:00:00+00:00',
                    ...(webcam ? { webcam } : {}),
                  },
                ],
              },
            ],
          },
        },
      ],
    },
    forecast3h: {
      features: [{ properties: { days: [{ date: '2026-08-19', timeline: [] }] } }],
    },
  };
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

// 004: `openid-client` (Keycloak) uporablja isti globalni `fetch` — klici proti ponarejenemu
// Keycloaku (127.0.0.1) MORAJO iti do resničnega omrežja, ne v spodnje ročne mocke.
const realFetch = globalThis.fetch;

describe('GET /cameras/arso-webcams pogodba', () => {
  it('vrne seznam kandidatov za lokacijo, ki ima webcam', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        if (String(input).includes('127.0.0.1')) return realFetch(input, init);
        return new Response(JSON.stringify(weatherFixture([{ direction: 'S', image: 'dir/ljubljana.jpg' }])), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }),
    );
    const { app } = await createApp();
    const token = await loginAndUnlock(app);

    const res = await request(app)
      .get('/api/v1/cameras/arso-webcams?location=Ljubljana')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    // `image` v ARSO odgovoru je relativna pot — pretvorjena v celoten naslov prek
    // ARSO_WEBCAM_BASE_URL (privzeto https://meteo.arso.gov.si/uploads/probase/www/observ/
    // webcam/, preverjeno proti pravi 800×600 JPEG sliki 21. 8. 2026).
    expect(res.body.webcams).toEqual([
      {
        direction: 'S',
        imageUrl: 'https://meteo.arso.gov.si/uploads/probase/www/observ/webcam/dir/ljubljana.jpg',
      },
    ]);
  });

  it('lokacija brez webcam slike vrne prazen seznam, ne napako (Edge Cases)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        if (String(input).includes('127.0.0.1')) return realFetch(input, init);
        return new Response(JSON.stringify(weatherFixture()), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }),
    );
    const { app } = await createApp();
    const token = await loginAndUnlock(app);

    const res = await request(app)
      .get('/api/v1/cameras/arso-webcams?location=Maribor')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.webcams).toEqual([]);
  });

  it('manjkajoč parameter location vrne 400', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const res = await request(app).get('/api/v1/cameras/arso-webcams').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });
});

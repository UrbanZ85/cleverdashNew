import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/main.js';
import { startTestDb, stopTestDb, clearTestDb } from '../setup/mongo-memory.js';
import { setTestEnv } from '../setup/test-env.js';

// Pogodbeni testi proti /dashboard/* iz openapi.yaml. `fetch` je zamenjan, da testi ne
// obremenjujejo pravega ARSO ob vsakem zagonu — člen VIII velja tudi za CI, ne samo za
// odjemalca v brskalniku.

const WEATHER_FIXTURE = {
  observation: {
    features: [
      {
        properties: {
          days: [
            {
              date: '2026-08-19',
              timeline: [
                {
                  clouds_shortText: 'jasno',
                  dd_shortText: 'Z',
                  ff_shortText: 'zmeren Z',
                  clouds_icon_wwsyn_icon: 'clear_day',
                  t: '32',
                  rh: '36',
                  valid: '2026-08-19T13:00:00+00:00',
                },
              ],
            },
          ],
        },
      },
    ],
  },
  forecast3h: {
    features: [
      {
        properties: {
          days: [
            {
              date: '2026-08-19',
              timeline: [{ clouds_shortText: 'jasno', t: '33', valid: '2026-08-19T15:00:00+00:00' }],
            },
          ],
        },
      },
    ],
  },
};

function stubFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes('vreme.arso.gov.si')) {
        return new Response(JSON.stringify(WEATHER_FIXTURE), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.includes('radar')) {
        return new Response(Buffer.from('gif-binarni-placeholder'), {
          status: 200,
          headers: {
            'content-type': 'image/gif',
            etag: '"radar-etag-1"',
            'last-modified': 'Wed, 19 Aug 2026 13:00:00 GMT',
          },
        });
      }
      throw new Error(`Nepričakovan fetch na ${url}`);
    }),
  );
}

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

describe('GET /dashboard/weather', () => {
  it('vrne vremenski odčitek z navedbo vira', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);

    const res = await request(app).get('/api/v1/dashboard/weather').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.observation.temperatureC).toBe(32);
    expect(res.body.source.attribution.text).toBe('Vir: ARSO');
    expect(res.body.source.stale).toBe(false);
  });

  it('brez avtentikacije vrne 401', async () => {
    const { app } = await createApp();
    const res = await request(app).get('/api/v1/dashboard/weather');
    expect(res.status).toBe(401);
  });

  it('drugi klic znotraj TTL ne pokliče vira znova (člen VIII)', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const fetchSpy = fetch as unknown as ReturnType<typeof vi.fn>;

    await request(app).get('/api/v1/dashboard/weather').set('Authorization', `Bearer ${token}`);
    const callsAfterFirst = fetchSpy.mock.calls.length;
    await request(app).get('/api/v1/dashboard/weather').set('Authorization', `Bearer ${token}`);
    expect(fetchSpy.mock.calls.length).toBe(callsAfterFirst);
  });
});

describe('GET /dashboard/forecast', () => {
  it('uporabi isti vir kot trenutno vreme (FR-024)', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const res = await request(app).get('/api/v1/dashboard/forecast').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.entries[0].temperatureC).toBe(33);
  });
});

describe('GET /dashboard/radar', () => {
  it('vrne image/gif z glavami o svežosti in viru', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const res = await request(app).get('/api/v1/dashboard/radar').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('image/gif');
    expect(res.headers['x-source-attribution']).toBe('Vir: ARSO');
    expect(res.headers['x-source-stale']).toBe('false');
  });
});

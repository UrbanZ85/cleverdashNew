import { afterAll, afterEach, beforeEach, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/main.js';
import { startTestDb, stopTestDb, clearTestDb } from '../setup/mongo-memory.js';
import { setTestEnv } from '../setup/test-env.js';
import { fakeKeycloakForTests as fakeKeycloak } from '../setup/keycloak-global.js';
import { loginAsTestUser } from '../setup/login-as-test-user.js';

// Pogodbeni testi za `GET /dashboard/commute` (ploščica "Pot"). Google Routes API je
// zamenjan: člen VIII velja tudi za CI, poleg tega je vsaka zahteva tam plačljiva — test,
// ki bi klical pravi vir, bi bil račun in ne test.

const ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const realFetch = globalThis.fetch;

/** Zabeleži vse klice vira, da testi lahko preverijo, da je predpomnilnik zares zadržal drugi. */
let routeCalls: Array<{ body: unknown; headers: Record<string, string> }> = [];

function stubFetch(response: unknown = { routes: [{ duration: '2400s', staticDuration: '1800s', distanceMeters: 18400 }] }, status = 200) {
  routeCalls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith(ROUTES_URL)) {
        routeCalls.push({
          body: init?.body ? JSON.parse(String(init.body)) : null,
          headers: (init?.headers ?? {}) as Record<string, string>,
        });
        return new Response(JSON.stringify(response), {
          status,
          headers: { 'content-type': 'application/json' },
        });
      }
      // 004: klici proti ponarejenemu Keycloaku morajo iti do resničnega omrežja.
      return realFetch(input as RequestInfo, init);
    }),
  );
}

beforeAll(async () => {
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(async () => {
  vi.unstubAllGlobals();
  await clearTestDb();
});
beforeEach(() => {
  setTestEnv({ GOOGLE_MAPS_SERVER_KEY: 'test-server-key', COMMUTE_CACHE_SECONDS: '300' });
  stubFetch();
});

async function login(app: import('express').Express) {
  const { accessToken } = await loginAsTestUser(app, fakeKeycloak, { roles: ['cleverdash-user'] });
  return accessToken;
}

async function setPlaces(app: import('express').Express, token: string) {
  await request(app)
    .put('/api/v1/settings')
    .set('Authorization', `Bearer ${token}`)
    .send({
      commute: {
        home: { label: 'Doma', latitude: 46.062382, longitude: 14.560178 },
        work: { label: 'Služba', latitude: 45.9610473, longitude: 14.2979519 },
      },
    });
}

describe('GET /dashboard/commute', () => {
  it('brez avtentikacije vrne 401', async () => {
    const { app } = await createApp();
    const res = await request(app).get('/api/v1/dashboard/commute');
    expect(res.status).toBe(401);
  });

  it('brez nastavljenih krajev vrne 200 z razlogom, ne napako', async () => {
    // Ploščica mora dobiti odgovor, iz katerega zna povedati, kaj naj uporabnik stori —
    // 4xx/5xx bi v ploščici pomenil "ne deluje" (člen VII).
    const { app } = await createApp();
    const token = await login(app);
    const res = await request(app).get('/api/v1/dashboard/commute').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.configured).toBe(false);
    expect(res.body.legs).toHaveLength(2);
    expect(res.body.legs[0].travelUnavailable).toBe('not-configured');
    expect(res.body.legs[0].mapEmbedUrl).toBeNull();
    expect(routeCalls).toHaveLength(0);
  });

  it('vrne obe smeri s časom poti, zamudo in zemljevidom', async () => {
    const { app } = await createApp();
    const token = await login(app);
    await setPlaces(app, token);

    const res = await request(app).get('/api/v1/dashboard/commute').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.configured).toBe(true);
    expect(res.body.legs.map((l: { direction: string }) => l.direction)).toEqual(['to-work', 'to-home']);

    const toWork = res.body.legs[0];
    expect(toWork.label).toBe('V službo');
    expect(toWork.travel).toEqual({
      durationSeconds: 2400,
      staticDurationSeconds: 1800,
      delaySeconds: 600,
      distanceMeters: 18400,
    });
    expect(toWork.travelUnavailable).toBeNull();
    expect(toWork.mapEmbedUrl).toContain('output=embed');
    expect(res.body.source.attribution.text).toMatch(/Google/);
  });

  it('smeri sta obrnjeni — pot domov gre iz službe domov', async () => {
    const { app } = await createApp();
    const token = await login(app);
    await setPlaces(app, token);
    await request(app).get('/api/v1/dashboard/commute').set('Authorization', `Bearer ${token}`);

    const toWork = routeCalls[0]!.body as { origin: { location: { latLng: { latitude: number } } } };
    const toHome = routeCalls[1]!.body as { origin: { location: { latLng: { latitude: number } } } };
    expect(toWork.origin.location.latLng.latitude).toBe(46.062382);
    expect(toHome.origin.location.latLng.latitude).toBe(45.9610473);
  });

  it('pošlje obvezno masko polj in ključ v glavi, ne v naslovu', async () => {
    const { app } = await createApp();
    const token = await login(app);
    await setPlaces(app, token);
    await request(app).get('/api/v1/dashboard/commute').set('Authorization', `Bearer ${token}`);

    const headers = routeCalls[0]!.headers;
    // Brez maske vir vrne 400; ključ v poizvedbenem nizu bi konačal v tujih dnevnikih.
    expect(headers['x-goog-fieldmask']).toBe('routes.duration,routes.staticDuration,routes.distanceMeters');
    expect(headers['x-goog-api-key']).toBe('test-server-key');
  });

  it('druga zahteva v istem TTL vira ne kliče znova (člen VIII)', async () => {
    const { app } = await createApp();
    const token = await login(app);
    await setPlaces(app, token);

    await request(app).get('/api/v1/dashboard/commute').set('Authorization', `Bearer ${token}`);
    expect(routeCalls).toHaveLength(2); // po ena zahteva na smer
    await request(app).get('/api/v1/dashboard/commute').set('Authorization', `Bearer ${token}`);
    expect(routeCalls).toHaveLength(2); // nič novega — vsaka zahteva je plačljiva
  });

  it('brez ključa v okolju pokaže zemljevida in pove, da časa poti ni', async () => {
    setTestEnv({ GOOGLE_MAPS_SERVER_KEY: '' });
    const { app } = await createApp();
    const token = await login(app);
    await setPlaces(app, token);

    const res = await request(app).get('/api/v1/dashboard/commute').set('Authorization', `Bearer ${token}`);
    expect(res.body.legs[0].travelUnavailable).toBe('no-api-key');
    expect(res.body.legs[0].mapEmbedUrl).toContain('saddr=46.062382');
    expect(routeCalls).toHaveLength(0);
  });

  it('odgovor brez poti da "no-route", ne napake celotne ploščice', async () => {
    stubFetch({ routes: [] });
    const { app } = await createApp();
    const token = await login(app);
    await setPlaces(app, token);

    const res = await request(app).get('/api/v1/dashboard/commute').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.legs[0].travelUnavailable).toBe('no-route');
    expect(res.body.legs[1].travelUnavailable).toBe('no-route');
  });

  it('napaka vira da "source-unavailable", odgovor pa ostane 200', async () => {
    stubFetch({ error: { code: 403, message: 'API key not valid' } }, 403);
    const { app } = await createApp();
    const token = await login(app);
    await setPlaces(app, token);

    const res = await request(app).get('/api/v1/dashboard/commute').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.legs).toHaveLength(2);
    expect(res.body.legs[0].travelUnavailable).toBe('source-unavailable');
    // Zemljevid je odvisen samo od krajev in ostane na voljo.
    expect(res.body.legs[0].mapEmbedUrl).not.toBeNull();
  });

  it('naslov zemljevida uporabi uradni Maps Embed API, kadar je ključ za vdelavo nastavljen', async () => {
    setTestEnv({ GOOGLE_MAPS_SERVER_KEY: 'test-server-key', GOOGLE_MAPS_EMBED_KEY: 'embed-key' });
    stubFetch();
    const { app } = await createApp();
    const token = await login(app);
    await setPlaces(app, token);

    const res = await request(app).get('/api/v1/dashboard/commute').set('Authorization', `Bearer ${token}`);
    expect(res.body.legs[0].mapEmbedUrl).toContain('/maps/embed/v1/directions');
    expect(res.body.legs[0].mapEmbedUrl).toContain('key=embed-key');
    // Strežniški ključ NE sme nikoli priti v naslov, ki ga vidi brskalnik.
    expect(res.body.legs[0].mapEmbedUrl).not.toContain('test-server-key');
  });

  it('kraja sta osebna — drug uporabnik dobi svoje stanje, ne mojega', async () => {
    const { app } = await createApp();
    const { accessToken: tokenA } = await loginAsTestUser(app, fakeKeycloak, {
      sub: 'kc-sub-commute-a',
      email: 'commute-a@example.com',
      roles: ['cleverdash-user'],
    });
    const { accessToken: tokenB } = await loginAsTestUser(app, fakeKeycloak, {
      sub: 'kc-sub-commute-b',
      email: 'commute-b@example.com',
      roles: ['cleverdash-user'],
    });
    await setPlaces(app, tokenA);

    const resB = await request(app).get('/api/v1/dashboard/commute').set('Authorization', `Bearer ${tokenB}`);
    expect(resB.body.configured).toBe(false);
    expect(resB.body.legs[0].travelUnavailable).toBe('not-configured');
  });
});

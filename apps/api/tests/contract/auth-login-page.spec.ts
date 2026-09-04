import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/main.js';
import { startTestDb, stopTestDb } from '../setup/mongo-memory.js';
import { setTestEnv } from '../setup/test-env.js';
import { resetKeycloakConfigForTests } from '../../src/platform/keycloak/client.js';

// `/auth/login` in `/auth/callback` sta edini poti, na kateri pride BRSKALNIK (navigacija,
// ne XHR). Ko je Keycloak nedosegljiv, je uporabnik prej dobil Chromovo stran
// "This page isn't working / HTTP ERROR 500" — brez informacije, ali je pokvarjena
// aplikacija, njegova seja ali ponudnik prijave. Ta test drži, da je odgovor berljiva stran
// s pravim statusom (člen VII).

beforeAll(async () => {
  await startTestDb();
});
afterAll(stopTestDb);

beforeEach(() => {
  // Vrata 1 so vedno zavrnjena — "discovery" pade takoj, brez čakanja na časovno omejitev.
  setTestEnv({ KEYCLOAK_ISSUER_URL: 'http://127.0.0.1:1/realms/nedosegljiv' });
  resetKeycloakConfigForTests();
});

describe('GET /auth/login, ko ponudnik prijave ni dosegljiv', () => {
  it('vrne 503 in ne 500 — aplikacija ni pokvarjena, Keycloak ni dosegljiv', async () => {
    const { app } = await createApp();
    const res = await request(app).get('/api/v1/auth/login?redirectTo=%2Fdashboard');
    expect(res.status).toBe(503);
  });

  it('odgovori s stranjo HTML, ne z dokumentom problem+json', async () => {
    const { app } = await createApp();
    const res = await request(app).get('/api/v1/auth/login');
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toContain('Prijava trenutno ni mogoča');
    expect(res.text).toContain('Poskusi znova');
  });

  it('stran pove ID dogodka za dnevnik, a ne razkrije sklada klicev', async () => {
    const { app } = await createApp();
    const res = await request(app).get('/api/v1/auth/login');
    expect(res.text).toContain('ID dogodka');
    // Sled klicev in notranje poti ne smejo uhajati v brskalnik (isti dogovor kot
    // platform/errors/problem.ts).
    expect(res.text).not.toContain('at Module');
    expect(res.text).not.toContain('apps/api/src');
    expect(res.text).not.toContain('127.0.0.1:1');
  });

  it('ponovni poskus ne obtiči na predpomnjeni napaki', async () => {
    // `getKeycloakConfig` neuspeha NE predpomni: če bi ga, bi bila prijava po enem samem
    // neuspelem poskusu mrtva do ponovnega zagona strežnika.
    const { app } = await createApp();
    const first = await request(app).get('/api/v1/auth/login');
    const second = await request(app).get('/api/v1/auth/login');
    expect(first.status).toBe(503);
    expect(second.status).toBe(503);
  });
});

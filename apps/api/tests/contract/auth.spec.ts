import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/main.js';
import { startTestDb, stopTestDb, clearTestDb } from '../setup/mongo-memory.js';
import { setTestEnv } from '../setup/test-env.js';
import { fakeKeycloakForTests as fakeKeycloak } from '../setup/keycloak-global.js';
import { loginAsTestUser } from '../setup/login-as-test-user.js';

// Pogodbeni test proti /auth/* iz contracts/openapi.yaml (004) — nadomesti prejšnji tok z
// e-pošto/geslom v celoti. Keycloak sam je ponarejen (research.md §3), tok skozi kodo je pravi.
// Ponarejen strežnik je že zagnan za to testno datoteko (setupFiles, keycloak-global.ts) —
// setTestEnv() ga privzeto uporabi, brez ročnega prepisovanja.

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(clearTestDb);

describe('GET /auth/login', () => {
  it('preusmeri (302) na avtorizacijski endpoint Keycloaka', async () => {
    const { app } = await createApp();
    const res = await request(app).get('/api/v1/auth/login').redirects(0);
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/protocol/openid-connect/auth');
  });
});

describe('GET /auth/callback', () => {
  it('uspešna prijava (uporabnik z osnovno vlogo) ustvari uporabnika in nastavi sejni piškotek (FR-003, FR-009)', async () => {
    const { app } = await createApp();
    const { accessToken, agent } = await loginAsTestUser(app, fakeKeycloak, {
      sub: 'kc-sub-user-1',
      email: 'user1@example.com',
      name: 'Prvi uporabnik',
      roles: ['cleverdash-user'],
    });
    expect(accessToken).toBeTruthy();

    const me = await agent.get('/api/v1/auth/me').set('Authorization', `Bearer ${accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.email).toBe('user1@example.com');
    // Popravek med implementacijo (research.md §6): navaden uporabnik dobi osnovne
    // aplikacijske scope-e (kamere, beleženje časa za LASTNE podatke), ne prazen seznam —
    // izolacija med uporabniki je z `userId`, ne s scope sistemom. `admin` NI med njimi.
    expect(me.body.scopes).not.toContain('admin');
    expect(me.body.scopes.length).toBeGreaterThan(0);
    expect(me.body.mustChangePassword).toBeUndefined();
  });

  it('oseba brez prepoznane vloge/skupine je zavrnjena z ločenim sporočilom (FR-007)', async () => {
    const { app } = await createApp();
    fakeKeycloak.setNextIdentity({
      sub: 'kc-sub-no-role',
      email: 'norole@example.com',
      name: 'Brez vloge',
      roles: ['neka-druga-aplikacija-vloga'],
    });
    const agent = request.agent(app);
    const loginRes = await agent.get('/api/v1/auth/login').redirects(0);
    const authorizeRes = await fetch(loginRes.headers.location as string, { redirect: 'manual' });
    const callbackUrl = authorizeRes.headers.get('location') as string;
    const relativeCallback = callbackUrl.replace(/^https?:\/\/[^/]+/, '');

    const callbackRes = await agent.get(relativeCallback);
    expect(callbackRes.status).toBe(401);
    // Na tej poti je klicatelj BRSKALNIK (vrnitev s Keycloaka), zato je odgovor berljiva
    // stran in ne dokument `problem+json`, ki bi se v naslovni vrstici izrisal kot surov
    // JSON (sendAuthErrorPage v modules/auth/router.ts, člen VII).
    expect(callbackRes.headers['content-type']).toMatch(/text\/html/);
    expect(callbackRes.text).toMatch(/dostopa/i);
  });

  it('administratorska vloga da scope "admin" (FR-011)', async () => {
    const { app } = await createApp();
    const { accessToken, agent } = await loginAsTestUser(app, fakeKeycloak, {
      sub: 'kc-sub-admin-1',
      email: 'admin1@example.com',
      name: 'Administrator',
      roles: ['cleverdash-admin'],
    });
    const me = await agent.get('/api/v1/auth/me').set('Authorization', `Bearer ${accessToken}`);
    expect(me.body.scopes).toEqual(['admin']);
  });
});

describe('POST /auth/refresh', () => {
  it('zavrti Keycloakov obnovitveni žeton in vrne nov dostopni žeton', async () => {
    const { app } = await createApp();
    const { agent } = await loginAsTestUser(app, fakeKeycloak, {
      sub: 'kc-sub-refresh',
      email: 'refresh@example.com',
      name: 'Test obnove',
      roles: ['cleverdash-user'],
    });
    const refreshed = await agent.post('/api/v1/auth/refresh').send();
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.accessToken).toBeTruthy();
    expect(refreshed.body.expiresIn).toBeGreaterThan(0);
  });

  it('brez veljavne seje (piškotka) vrne 401', async () => {
    const { app } = await createApp();
    const res = await request(app).post('/api/v1/auth/refresh').send();
    expect(res.status).toBe(401);
  });
});

describe('POST /auth/logout', () => {
  it('prekliče lokalno sejo in vrne endSessionUrl za enotno odjavo pri Keycloaku (FR-004)', async () => {
    const { app } = await createApp();
    const { accessToken, agent } = await loginAsTestUser(app, fakeKeycloak, {
      sub: 'kc-sub-logout',
      email: 'logout@example.com',
      name: 'Test odjave',
      roles: ['cleverdash-user'],
    });

    const res = await agent.post('/api/v1/auth/logout').set('Authorization', `Bearer ${accessToken}`).send();
    expect(res.status).toBe(200);
    expect(res.body.endSessionUrl).toContain('/protocol/openid-connect/logout');

    // Seja je preklicana — naslednja obnovitev z istim piškotkom mora spodleteti.
    const refreshAfterLogout = await agent.post('/api/v1/auth/refresh').send();
    expect(refreshAfterLogout.status).toBe(401);
  });

  it('brez avtentikacije vrne 401', async () => {
    const { app } = await createApp();
    const res = await request(app).post('/api/v1/auth/logout');
    expect(res.status).toBe(401);
  });
});

describe('GET /auth/me', () => {
  it('brez avtentikacije vrne 401', async () => {
    const { app } = await createApp();
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
  });
});

describe('GET /auth/sessions + DELETE /auth/sessions/:sessionId', () => {
  it('seznam sej vsebuje trenutno sejo, njen preklic pa jo odstrani s seznama', async () => {
    const { app } = await createApp();
    const { accessToken, agent } = await loginAsTestUser(app, fakeKeycloak, {
      sub: 'kc-sub-sessions',
      email: 'sessions@example.com',
      name: 'Test sej',
      roles: ['cleverdash-user'],
    });
    const authHeader = `Bearer ${accessToken}`;

    const list = await agent.get('/api/v1/auth/sessions').set('Authorization', authHeader);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].current).toBe(true);

    const del = await agent.delete(`/api/v1/auth/sessions/${list.body[0].id}`).set('Authorization', authHeader);
    expect(del.status).toBe(204);

    const refreshAfterRevoke = await agent.post('/api/v1/auth/refresh').send();
    expect(refreshAfterRevoke.status).toBe(401);
  });
});

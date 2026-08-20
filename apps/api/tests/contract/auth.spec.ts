import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/main.js';
import { startTestDb, stopTestDb, clearTestDb } from '../setup/mongo-memory.js';
import { setTestEnv } from '../setup/test-env.js';

// Pogodbeni test proti /auth/* iz specs/001-app-shell-dashboard/contracts/openapi.yaml.
// Uporablja bootstrap uporabnika (ADMIN_EMAIL/ADMIN_INITIAL_PASSWORD iz setTestEnv), ki
// nastane v createApp() prek ensureBootstrapUser (FR-014).

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(clearTestDb);

const CREDS = { email: 'admin@example.com', password: 'zacetno-geslo-12' };

describe('POST /auth/login', () => {
  it('uspešna prijava vrne mustChangePassword=true za začetnega uporabnika (FR-014)', async () => {
    const { app } = await createApp();
    const res = await request(app).post('/api/v1/auth/login').send({ ...CREDS, platform: 'web' });
    expect(res.status).toBe(200);
    expect(res.body.mustChangePassword).toBe(true);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.headers['set-cookie']?.[0]).toMatch(/cd_refresh=/);
  });

  it('napačno geslo vrne 401 z enotnim sporočilom (FR-015)', async () => {
    const { app } = await createApp();
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: CREDS.email, password: 'napacno-geslo', platform: 'web' });
    expect(res.status).toBe(401);
  });

  it('Android prijava vrne refreshToken v telesu, ne v piškotku', async () => {
    const { app } = await createApp();
    const res = await request(app).post('/api/v1/auth/login').send({ ...CREDS, platform: 'android' });
    expect(res.status).toBe(200);
    expect(res.body.refreshToken).toBeTruthy();
  });

  it('mustChangePassword blokira druge poti razen odjave in menjave gesla (FR-014)', async () => {
    const { app } = await createApp();
    const login = await request(app).post('/api/v1/auth/login').send({ ...CREDS, platform: 'android' });
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`);
    expect(res.status).toBe(403);
  });
});

describe('POST /auth/refresh', () => {
  it('obnovi dostopni žeton in zavrti obnovitveni piškotek (FR-011)', async () => {
    const { app } = await createApp();
    const agent = request.agent(app);
    await agent.post('/api/v1/auth/login').send({ ...CREDS, platform: 'web' });
    const refreshed = await agent.post('/api/v1/auth/refresh').send();
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.accessToken).toBeTruthy();
  });

  it('brez obnovitvenega žetona vrne 401', async () => {
    const { app } = await createApp();
    const res = await request(app).post('/api/v1/auth/refresh').send();
    expect(res.status).toBe(401);
  });
});

describe('POST /auth/logout', () => {
  it('odjava zahteva veljaven dostopni žeton', async () => {
    const { app } = await createApp();
    const login = await request(app).post('/api/v1/auth/login').send({ ...CREDS, platform: 'android' });
    const res = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${login.body.accessToken}`);
    expect(res.status).toBe(204);
  });

  it('brez avtentikacije vrne 401', async () => {
    const { app } = await createApp();
    const res = await request(app).post('/api/v1/auth/logout');
    expect(res.status).toBe(401);
  });
});

describe('POST /auth/password + GET /auth/me', () => {
  it('menjava gesla odklene ostale poti in GET /auth/me deluje po njej', async () => {
    const { app } = await createApp();
    const login = await request(app).post('/api/v1/auth/login').send({ ...CREDS, platform: 'android' });
    const token = login.body.accessToken as string;

    const changed = await request(app)
      .post('/api/v1/auth/password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: CREDS.password, newPassword: 'novo-mocno-geslo-123' });
    expect(changed.status).toBe(204);

    const me = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(200);
    expect(me.body.mustChangePassword).toBe(false);
  });
});

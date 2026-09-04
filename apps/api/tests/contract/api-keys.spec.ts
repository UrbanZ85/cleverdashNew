import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createHash } from 'node:crypto';
import { createApp } from '../../src/main.js';
import { ApiKeyModel } from '../../src/platform/apikeys/model.js';
import { startTestDb, stopTestDb, clearTestDb } from '../setup/mongo-memory.js';
import { setTestEnv } from '../setup/test-env.js';
import { fakeKeycloakForTests as fakeKeycloak } from '../setup/keycloak-global.js';
import { loginAsTestUser } from '../setup/login-as-test-user.js';

// Pogodbeni test proti specs/001-app-shell-dashboard/contracts/openapi.yaml: /api-keys.
// Avtentikacija poteka prek X-API-Key z obsegom "admin" (člen III) — sistem je
// enouporabniški, zato je "admin" edini smiselni obseg za upravljanje ključev.

let seedSecret: string;

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(clearTestDb);

async function seedAdminKey() {
  seedSecret = 'seed-admin-key-for-test';
  await ApiKeyModel.create({
    label: 'seed',
    keyHash: createHash('sha256').update(seedSecret).digest('hex'),
    keyPrefix: seedSecret.slice(0, 8),
    scopes: ['admin'],
  });
}

describe('/api-keys pogodba', () => {
  it('ustvarjanje z admin ključem vrne čistopis samo v tem odgovoru', async () => {
    await seedAdminKey();
    const { app } = await createApp();

    const res = await request(app)
      .post('/api/v1/api-keys')
      .set('X-API-Key', seedSecret)
      .send({ label: 'n8n', scopes: ['dashboard:read'] });

    expect(res.status).toBe(201);
    expect(res.body.secret).toMatch(/^cd_/);
    expect(res.body).not.toHaveProperty('keyHash');
  });

  it('seznam nikoli ne vrne keyHash', async () => {
    await seedAdminKey();
    const { app } = await createApp();
    const res = await request(app).get('/api/v1/api-keys').set('X-API-Key', seedSecret);
    expect(res.status).toBe(200);
    for (const key of res.body) expect(key).not.toHaveProperty('keyHash');
  });

  it('brez X-API-Key je zahteva zavrnjena', async () => {
    const { app } = await createApp();
    const res = await request(app).get('/api/v1/api-keys');
    expect(res.status).toBe(401);
  });

  it('preklic je revokedAt, ne brisanje zapisa', async () => {
    await seedAdminKey();
    const { app } = await createApp();
    const created = await ApiKeyModel.create({
      label: 'za-preklic',
      keyHash: 'irrelevant-hash',
      keyPrefix: 'cd_abcde',
      scopes: ['x'],
    });

    const res = await request(app)
      .delete(`/api/v1/api-keys/${created._id}`)
      .set('X-API-Key', seedSecret);
    expect(res.status).toBe(204);

    const stillThere = await ApiKeyModel.findById(created._id).lean();
    expect(stillThere).not.toBeNull();
    expect(stillThere?.revokedAt).not.toBeNull();
  });

  it('ključ brez obsegov je zavrnjen s strani modela (validacija)', async () => {
    await expect(
      ApiKeyModel.create({ label: 'brez-obsegov', keyHash: 'x', keyPrefix: 'cd_xxxxx', scopes: [] }),
    ).rejects.toThrow(/obsegov/);
  });
});

// T057, FR-013: `admin` obseg mora enako varovati /api-keys, ko izhaja iz Keycloakove
// preslikave vlog (role-mapping.ts), ne iz stare bootstrap logike (ki je odstranjena).
describe('/api-keys pogodba — admin obseg iz Keycloaka (US3, FR-013)', () => {
  it('uporabnik z administratorsko Keycloak vlogo lahko upravlja API ključe', async () => {
    const { app } = await createApp();
    const { accessToken } = await loginAsTestUser(app, fakeKeycloak, {
      sub: 'kc-sub-apikeys-admin',
      email: 'apikeys-admin@example.com',
      roles: ['cleverdash-admin'],
    });

    const res = await request(app)
      .post('/api/v1/api-keys')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ label: 'n8n', scopes: ['dashboard:read'] });
    expect(res.status).toBe(201);
    expect(res.body.secret).toMatch(/^cd_/);
  });

  it('navaden uporabnik (brez administratorske Keycloak vloge) NIMA dostopa do API ključev', async () => {
    const { app } = await createApp();
    const { accessToken } = await loginAsTestUser(app, fakeKeycloak, {
      sub: 'kc-sub-apikeys-plain',
      email: 'apikeys-plain@example.com',
      roles: ['cleverdash-user'],
    });

    const res = await request(app).get('/api/v1/api-keys').set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(403);
  });
});

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/main.js';
import { startTestDb, stopTestDb, clearTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { fakeKeycloakForTests } from '../../setup/keycloak-global.js';
import { loginAsTestUser } from '../../setup/login-as-test-user.js';

// Isti dogovor kot pri kamerah (tests/contract/cameras/isolation.spec.ts): tuj zapis vrne
// 404 in NE 403 — obstoj tujega vtičnika ni podatek, ki bi ga smel izvedeti kdorkoli.

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(clearTestDb);

async function twoUsers(app: import('express').Express) {
  const a = await loginAsTestUser(app, fakeKeycloakForTests, {
    sub: 'kc-sub-plugin-a',
    email: 'plugin-a@example.com',
    roles: ['cleverdash-user'],
  });
  const b = await loginAsTestUser(app, fakeKeycloakForTests, {
    sub: 'kc-sub-plugin-b',
    email: 'plugin-b@example.com',
    roles: ['cleverdash-user'],
  });
  return { a, b };
}

const PLUGIN = { name: 'Moj vir', kind: 'link', url: 'https://example.com/a' };

describe('Izolacija vtičnikov med uporabniki', () => {
  it('seznam vsebuje samo lastne vtičnike', async () => {
    const { app } = await createApp();
    const { a, b } = await twoUsers(app);

    await request(app)
      .post('/api/v1/dashboard/plugins')
      .set('Authorization', `Bearer ${a.accessToken}`)
      .send(PLUGIN);

    const listA = await request(app)
      .get('/api/v1/dashboard/plugins')
      .set('Authorization', `Bearer ${a.accessToken}`);
    expect(listA.body.plugins).toHaveLength(1);

    const listB = await request(app)
      .get('/api/v1/dashboard/plugins')
      .set('Authorization', `Bearer ${b.accessToken}`);
    expect(listB.body.plugins).toEqual([]);
  });

  it('branje, urejanje in brisanje tujega vtičnika vrne 404', async () => {
    const { app } = await createApp();
    const { a, b } = await twoUsers(app);

    const created = await request(app)
      .post('/api/v1/dashboard/plugins')
      .set('Authorization', `Bearer ${a.accessToken}`)
      .send(PLUGIN);
    const foreignId = created.body.id;

    const auth = { Authorization: `Bearer ${b.accessToken}` };
    expect((await request(app).get(`/api/v1/dashboard/plugins/${foreignId}`).set(auth)).status).toBe(404);
    expect((await request(app).put(`/api/v1/dashboard/plugins/${foreignId}`).set(auth).send(PLUGIN)).status).toBe(404);
    expect((await request(app).get(`/api/v1/dashboard/plugins/${foreignId}/data`).set(auth)).status).toBe(404);
    expect((await request(app).delete(`/api/v1/dashboard/plugins/${foreignId}`).set(auth)).status).toBe(404);

    // Tuji poskusi niso pustili sledi — vtičnik lastnika je nedotaknjen.
    const stillThere = await request(app)
      .get(`/api/v1/dashboard/plugins/${foreignId}`)
      .set('Authorization', `Bearer ${a.accessToken}`);
    expect(stillThere.status).toBe(200);
  });

  it('dva uporabnika smeta imeti vtičnik z istim imenom', async () => {
    const { app } = await createApp();
    const { a, b } = await twoUsers(app);

    const first = await request(app)
      .post('/api/v1/dashboard/plugins')
      .set('Authorization', `Bearer ${a.accessToken}`)
      .send(PLUGIN);
    const second = await request(app)
      .post('/api/v1/dashboard/plugins')
      .set('Authorization', `Bearer ${b.accessToken}`)
      .send(PLUGIN);

    // Edinstvenost je v obsegu uporabnika: indeks je (userId, name), ne samo name.
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
  });
});

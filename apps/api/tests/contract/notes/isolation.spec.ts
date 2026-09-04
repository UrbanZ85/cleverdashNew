import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/main.js';
import { startTestDb, stopTestDb, clearTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { fakeKeycloakForTests as fakeKeycloak } from '../../setup/keycloak-global.js';
import { loginAsTestUser } from '../../setup/login-as-test-user.js';
import { seedNoteFixture } from './_helpers.js';

// 004 velja tudi za beležke: izolacija med uporabniki je zagotovljena z `userId` na VSAKI
// poizvedbi, ne s sistemom obsegov (glej platform/keycloak/role-mapping.ts) — vsak prijavljen
// uporabnik ima `notes:read`/`notes:write`, a samo za svoje beležke.

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(clearTestDb);

async function twoUsers(app: import('express').Express) {
  const first = await loginAsTestUser(app, fakeKeycloak, {
    sub: 'kc-notes-a',
    email: 'a@example.com',
    roles: ['cleverdash-admin'],
  });
  const second = await loginAsTestUser(app, fakeKeycloak, {
    sub: 'kc-notes-b',
    email: 'b@example.com',
    roles: ['cleverdash-admin'],
  });
  return { first, second };
}

describe('izolacija beležk med uporabniki', () => {
  it('seznam vsebuje samo svoje beležke', async () => {
    const { app } = await createApp();
    const { first, second } = await twoUsers(app);
    await seedNoteFixture({ userId: first.userId, title: 'Moja' });
    await seedNoteFixture({ userId: second.userId, title: 'Tuja' });

    const res = await request(app).get('/api/v1/notes').set('Authorization', `Bearer ${first.accessToken}`);

    expect(res.body.notes).toHaveLength(1);
    expect(res.body.notes[0].title).toBe('Moja');
    expect(res.body.total).toBe(1);
  });

  it('branje tuje beležke vrne 404, ne 403 — obstoj tujega zapisa ni podatek', async () => {
    const { app } = await createApp();
    const { first, second } = await twoUsers(app);
    const theirs = await seedNoteFixture({ userId: second.userId });

    const res = await request(app)
      .get(`/api/v1/notes/${theirs._id}`)
      .set('Authorization', `Bearer ${first.accessToken}`);
    expect(res.status).toBe(404);
  });

  it('brisanje tuje beležke je nemogoče in je ne odstrani', async () => {
    const { app } = await createApp();
    const { first, second } = await twoUsers(app);
    const theirs = await seedNoteFixture({ userId: second.userId });

    const res = await request(app)
      .delete(`/api/v1/notes/${theirs._id}`)
      .set('Authorization', `Bearer ${first.accessToken}`);
    expect(res.status).toBe(404);

    const stillThere = await request(app)
      .get(`/api/v1/notes/${theirs._id}`)
      .set('Authorization', `Bearer ${second.accessToken}`);
    expect(stillThere.status).toBe(200);
  });

  it('oznake v seznamu so samo lastne', async () => {
    const { app } = await createApp();
    const { first, second } = await twoUsers(app);
    await seedNoteFixture({ userId: first.userId, tags: ['moje'] });
    await seedNoteFixture({ userId: second.userId, tags: ['tuje'] });

    const res = await request(app).get('/api/v1/notes').set('Authorization', `Bearer ${first.accessToken}`);
    expect(res.body.tags).toEqual(['moje']);
  });
});

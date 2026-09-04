import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/main.js';
import { clearTestDb, startTestDb, stopTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { AUTH, loginAs, loginTwo, seedList } from './_helpers.js';

// US2, FR-080 do FR-087: branje za ploščico na nadzorni plošči.

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(clearTestDb);

describe('GET /todos/current — ploščica (US2)', () => {
  it('brez avtentikacije vrne 401', async () => {
    const { app } = await createApp();
    expect((await request(app).get('/api/v1/todos/current')).status).toBe(401);
  });

  it('brez seznamov vrne 200 z list: null — prazno stanje ni napaka (FR-086)', async () => {
    const { app } = await createApp();
    const a = await loginAs(app, 'a');

    const res = await request(app).get('/api/v1/todos/current').set(AUTH(a.token));

    expect(res.status).toBe(200);
    expect(res.body.list).toBeNull();
    expect(res.body.fallback).toBe(false);
    expect(res.body.nextPollSeconds).toBeGreaterThan(0);
  });

  it('brez pripetega vrne NAZADNJE SPREMENJEN seznam, z opravili (FR-080)', async () => {
    const { app } = await createApp();
    const a = await loginAs(app, 'a');

    await seedList({ ownerId: a.userId, title: 'Star' });
    await new Promise((r) => setTimeout(r, 10));
    await seedList({ ownerId: a.userId, title: 'Nov', tasks: [{ title: 'Mleko' }] });

    const res = await request(app).get('/api/v1/todos/current').set(AUTH(a.token));

    expect(res.body.list.title).toBe('Nov');
    // Ploščica potrebuje opravila v ISTEM branju — brez njih bi bila potrebna druga poizvedba.
    expect(res.body.list.tasks).toHaveLength(1);
    expect(res.body.fallback).toBe(false);
  });

  it('s pripetim vrne PRIPETEGA, tudi kadar je bil spremenjen drug seznam (FR-081)', async () => {
    const { app } = await createApp();
    const a = await loginAs(app, 'a');

    const pripet = await seedList({ ownerId: a.userId, title: 'Pripet' });
    await new Promise((r) => setTimeout(r, 10));
    await seedList({ ownerId: a.userId, title: 'Spremenjen pozneje' });

    const res = await request(app)
      .get(`/api/v1/todos/current?listId=${pripet._id}`)
      .set(AUTH(a.token));

    expect(res.body.list.title).toBe('Pripet');
    expect(res.body.fallback).toBe(false);
  });

  it('IZBRISAN pripeti seznam pade nazaj na nazadnje spremenjenega — NE 404 (FR-085, SC-010)', async () => {
    const { app } = await createApp();
    const a = await loginAs(app, 'a');
    await seedList({ ownerId: a.userId, title: 'Preostali' });

    const res = await request(app)
      .get('/api/v1/todos/current?listId=507f1f77bcf86cd799439099')
      .set(AUTH(a.token));

    // Ploščica NE SME podreti nadzorne plošče, zato je to 200 in ne napaka.
    expect(res.status).toBe(200);
    expect(res.body.list.title).toBe('Preostali');
    expect(res.body.fallback).toBe(true);
  });

  it('NEVELJAVEN pripeti ID prav tako pade nazaj, ne v 404', async () => {
    const { app } = await createApp();
    const a = await loginAs(app, 'a');
    await seedList({ ownerId: a.userId, title: 'Preostali' });

    const res = await request(app).get('/api/v1/todos/current?listId=ni-id').set(AUTH(a.token));

    expect(res.status).toBe(200);
    expect(res.body.list.title).toBe('Preostali');
    expect(res.body.fallback).toBe(true);
  });

  it('pripeti seznam, ki mu je bil odvzet dostop, pade nazaj z fallback: true', async () => {
    const { app } = await createApp();
    const { a, b } = await loginTwo(app);
    const tuj = await seedList({ ownerId: a.userId, title: 'Ni več moj' });
    await seedList({ ownerId: b.userId, title: 'Moj' });

    const res = await request(app).get(`/api/v1/todos/current?listId=${tuj._id}`).set(AUTH(b.token));

    expect(res.body.list.title).toBe('Moj');
    expect(res.body.fallback).toBe(true);
  });

  it('interval osveževanja pove STREŽNIK: deljen seznam pogosteje kot osebni (FR-087)', async () => {
    const { app } = await createApp();
    const { a, b } = await loginTwo(app);

    const osebni = await seedList({ ownerId: a.userId, title: 'Osebni' });
    const resOsebni = await request(app)
      .get(`/api/v1/todos/current?listId=${osebni._id}`)
      .set(AUTH(a.token));
    expect(resOsebni.body.nextPollSeconds).toBe(60);

    const deljen = await seedList({
      ownerId: a.userId,
      title: 'Deljen',
      members: [{ userId: b.userId, role: 'check' }],
    });
    const resDeljen = await request(app)
      .get(`/api/v1/todos/current?listId=${deljen._id}`)
      .set(AUTH(a.token));
    expect(resDeljen.body.nextPollSeconds).toBe(30);
  });

  it('odkljukanje na ploščici je ista pot kot na zavihku — isto stanje (FR-083)', async () => {
    const { app } = await createApp();
    const a = await loginAs(app, 'a');
    const list = await seedList({ ownerId: a.userId, tasks: [{ title: 'Mleko' }] });
    const taskId = String(list.tasks[0]?._id);

    await request(app)
      .patch(`/api/v1/todos/lists/${list._id}/tasks/${taskId}`)
      .set(AUTH(a.token))
      .send({ done: true });

    const res = await request(app).get('/api/v1/todos/current').set(AUTH(a.token));
    expect(res.body.list.tasks[0].done).toBe(true);
    expect(res.body.list.openCount).toBe(0);
  });
});

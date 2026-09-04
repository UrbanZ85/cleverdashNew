import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../../src/main.js';
import { clearTestDb, startTestDb, stopTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { AUTH, loginAs, loginTwo, seedList } from './_helpers.js';

// US4, FR-060 do FR-064, SC-006.
//
// Osrednja trditev te datoteke: zaklenjen seznam da soudeležencu **409**, ne 403 in ne 404.
// To ni estetika statusnih kod. 403 pomeni "za tega uporabnika kontrolo skrij", 409 pomeni
// "pokaži ključavnico in kontrolo pusti" — lastnik jo odklene z enim klikom in ista zahteva bo
// uspela. Dva različna odziva vmesnika potrebujeta dva različna statusa.

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(clearTestDb);

async function zaklenjenSeznam(app: Express, role: 'view' | 'check' | 'edit' = 'edit') {
  const { a, b } = await loginTwo(app);
  const list = await seedList({
    ownerId: a.userId,
    locked: true,
    members: [{ userId: b.userId, role }],
    tasks: [{ title: 'Mleko' }, { title: 'Opravljeno', done: true, doneAt: new Date() }],
  });
  return { a, b, listId: String(list._id), taskId: String(list.tasks[0]?._id) };
}

describe('Zaklenjen seznam — soudeleženec (FR-061, SC-006)', () => {
  it('vsaka sprememba da 409, tudi pri stopnji "urejanje"', async () => {
    const { app } = await createApp();
    const { b, listId, taskId } = await zaklenjenSeznam(app, 'edit');

    const zahteve = {
      odkljukaj: () =>
        request(app).patch(`/api/v1/todos/lists/${listId}/tasks/${taskId}`).send({ done: true }),
      uredi: () =>
        request(app).patch(`/api/v1/todos/lists/${listId}/tasks/${taskId}`).send({ title: 'X' }),
      dodaj: () => request(app).post(`/api/v1/todos/lists/${listId}/tasks`).send({ titles: ['X'] }),
      izbrisi: () => request(app).delete(`/api/v1/todos/lists/${listId}/tasks/${taskId}`),
      preuredi: () =>
        request(app).put(`/api/v1/todos/lists/${listId}/order`).send({ taskIds: [taskId] }),
      pocisti: () =>
        request(app).post(`/api/v1/todos/lists/${listId}/tasks/clear-completed`).send({}),
    };

    for (const [ime, izvedi] of Object.entries(zahteve)) {
      const res = await izvedi().set(AUTH(b.token));
      expect(res.status, `${ime} bi moral vrniti 409`).toBe(409);
      expect(res.body.title, `${ime}`).toContain('zaklenjen');
    }
  });

  it('sporočilo pove, da je seznam zaklenil LASTNIK — ne "nimaš pravice" (FR-063)', async () => {
    const { app } = await createApp();
    const { b, listId, taskId } = await zaklenjenSeznam(app, 'check');

    const res = await request(app)
      .patch(`/api/v1/todos/lists/${listId}/tasks/${taskId}`)
      .set(AUTH(b.token))
      .send({ done: true });

    expect(res.status).toBe(409);
    expect(res.body.detail).toContain('zaklenil');
    expect(res.body.detail).not.toContain('pravic');
  });

  it('branje ostane dovoljeno — zaklep ni odvzem dostopa', async () => {
    const { app } = await createApp();
    const { b, listId } = await zaklenjenSeznam(app, 'view');

    const res = await request(app).get(`/api/v1/todos/lists/${listId}`).set(AUTH(b.token));
    expect(res.status).toBe(200);
    expect(res.body.locked).toBe(true);
    expect(res.body.capabilities.readList).toBe(true);
    expect(res.body.capabilities.toggleTask).toBe(false);
  });

  it('stopnja "ogled" na zaklenjenem dobi 403, NE 409 — odklep ji ne bi nič pomagal', async () => {
    const { app } = await createApp();
    const { b, listId, taskId } = await zaklenjenSeznam(app, 'view');

    const res = await request(app)
      .patch(`/api/v1/todos/lists/${listId}/tasks/${taskId}`)
      .set(AUTH(b.token))
      .send({ done: true });

    // Vloga se preveri PRED ključavnico: sporočilo o ključavnici bi tega človeka poslalo
    // prosit za napačno stvar.
    expect(res.status).toBe(403);
  });

  it('soudeleženec sme seznam ZAPUSTITI tudi ob zaklepu (FR-047)', async () => {
    const { app } = await createApp();
    const { b, listId } = await zaklenjenSeznam(app, 'edit');

    const res = await request(app)
      .delete(`/api/v1/todos/lists/${listId}/members/${b.userId}`)
      .set(AUTH(b.token));

    expect(res.status).toBe(200);
    expect(res.body.removed).toBe(true);
  });

  it('oznako "novo" sme počistiti tudi ob zaklepu — ogled ni sprememba', async () => {
    const { app } = await createApp();
    const { b, listId } = await zaklenjenSeznam(app, 'view');

    const res = await request(app).post(`/api/v1/todos/lists/${listId}/seen`).set(AUTH(b.token)).send({});
    expect(res.status).toBe(200);
  });

  it('tujcu zaklenjen seznam še vedno vrne 404 — zaklep ne razkrije obstoja', async () => {
    const { app } = await createApp();
    const { listId, taskId } = await zaklenjenSeznam(app, 'edit');
    const c = await loginAs(app, 'c');

    const res = await request(app)
      .patch(`/api/v1/todos/lists/${listId}/tasks/${taskId}`)
      .set(AUTH(c.token))
      .send({ done: true });

    expect(res.status).toBe(404);
  });
});

describe('Zaklenjen seznam — lastnik (FR-062)', () => {
  it('sme vse, kar sme sicer', async () => {
    const { app } = await createApp();
    const { a, listId, taskId } = await zaklenjenSeznam(app, 'edit');

    expect(
      (await request(app).patch(`/api/v1/todos/lists/${listId}/tasks/${taskId}`).set(AUTH(a.token)).send({ done: true })).status,
    ).toBe(200);
    expect(
      (await request(app).post(`/api/v1/todos/lists/${listId}/tasks`).set(AUTH(a.token)).send({ titles: ['Novo'] })).status,
    ).toBe(201);
    expect(
      (await request(app).post(`/api/v1/todos/lists/${listId}/tasks/clear-completed`).set(AUTH(a.token)).send({})).status,
    ).toBe(200);
    expect(
      (await request(app).patch(`/api/v1/todos/lists/${listId}`).set(AUTH(a.token)).send({ title: 'Preimenovan' })).status,
    ).toBe(200);
  });

  it('sme zaklenjen seznam tudi izbrisati in spremeniti deljenje', async () => {
    const { app } = await createApp();
    const { a, b, listId } = await zaklenjenSeznam(app, 'edit');

    const odvzem = await request(app)
      .delete(`/api/v1/todos/lists/${listId}/members/${b.userId}`)
      .set(AUTH(a.token));
    expect(odvzem.status).toBe(200);

    expect((await request(app).delete(`/api/v1/todos/lists/${listId}`).set(AUTH(a.token))).status).toBe(200);
  });
});

describe('Zaklep in odklep', () => {
  it('samo lastnik zaklene; odklep povrne NATANKO prejšnje pravice (FR-064)', async () => {
    const { app } = await createApp();
    const { a, b } = await loginTwo(app);
    const list = await seedList({
      ownerId: a.userId,
      members: [{ userId: b.userId, role: 'edit' }],
      tasks: [{ title: 'Mleko' }],
    });
    const taskId = String(list.tasks[0]?._id);
    const url = `/api/v1/todos/lists/${list._id}/tasks/${taskId}`;

    // Pred zaklepom sme.
    expect((await request(app).patch(url).set(AUTH(b.token)).send({ done: true })).status).toBe(200);

    await request(app).patch(`/api/v1/todos/lists/${list._id}`).set(AUTH(a.token)).send({ locked: true });
    expect((await request(app).patch(url).set(AUTH(b.token)).send({ done: false })).status).toBe(409);

    await request(app).patch(`/api/v1/todos/lists/${list._id}`).set(AUTH(a.token)).send({ locked: false });
    expect((await request(app).patch(url).set(AUTH(b.token)).send({ done: false })).status).toBe(200);
  });

  it('zaklep je viden vsem, ki seznam vidijo', async () => {
    const { app } = await createApp();
    const { a, b } = await loginTwo(app);
    const list = await seedList({ ownerId: a.userId, members: [{ userId: b.userId, role: 'view' }] });

    await request(app).patch(`/api/v1/todos/lists/${list._id}`).set(AUTH(a.token)).send({ locked: true });

    const zaB = await request(app).get('/api/v1/todos/lists').set(AUTH(b.token));
    expect(zaB.body.lists[0].locked).toBe(true);
  });
});

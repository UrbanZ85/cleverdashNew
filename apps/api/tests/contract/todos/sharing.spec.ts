import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../../src/main.js';
import { clearTestDb, startTestDb, stopTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { AUTH, loginAs, loginTwo, seedList } from './_helpers.js';
import type { MemberRole } from '../../../src/modules/todos/domain/capabilities.js';

// US3, FR-041 do FR-044, FR-050, FR-051, SC-005.
//
// Matrika pravic je izčrpno pokrita že kot čista funkcija (tests/unit/todos-capabilities.spec.ts).
// Ta datoteka preverja nekaj drugega: da usmerjevalnik to matriko RES uporabi na vsakem
// endpointu in da se statusi navzven ujemajo — 403 članu, 404 tujcu. Enotski test tega ne
// dokaže, ker ne gre skozi HTTP.

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(clearTestDb);

/** Vsa dejanja nad seznamom, s pričakovanim statusom po stopnjah. */
function actions(app: Express, listId: string, taskId: string) {
  return {
    beri: () => request(app).get(`/api/v1/todos/lists/${listId}`),
    odkljukaj: () =>
      request(app).patch(`/api/v1/todos/lists/${listId}/tasks/${taskId}`).send({ done: true }),
    preimenujOpravilo: () =>
      request(app).patch(`/api/v1/todos/lists/${listId}/tasks/${taskId}`).send({ title: 'Novo' }),
    dodaj: () => request(app).post(`/api/v1/todos/lists/${listId}/tasks`).send({ titles: ['X'] }),
    izbrisiOpravilo: () => request(app).delete(`/api/v1/todos/lists/${listId}/tasks/${taskId}`),
    preuredi: () =>
      request(app).put(`/api/v1/todos/lists/${listId}/order`).send({ taskIds: [taskId] }),
    pocisti: () =>
      request(app).post(`/api/v1/todos/lists/${listId}/tasks/clear-completed`).send({}),
    preimenujSeznam: () =>
      request(app).patch(`/api/v1/todos/lists/${listId}`).send({ title: 'Ugrabljeno' }),
    zakleni: () => request(app).patch(`/api/v1/todos/lists/${listId}`).send({ locked: true }),
    izbrisiSeznam: () => request(app).delete(`/api/v1/todos/lists/${listId}`),
  };
}

/** Pripravi seznam z enim opravilom, deljen z B v dani stopnji. */
async function setup(app: Express, role: MemberRole) {
  const { a, b } = await loginTwo(app);
  const list = await seedList({
    ownerId: a.userId,
    members: [{ userId: b.userId, role }],
    tasks: [{ title: 'Mleko' }],
  });
  return {
    a,
    b,
    listId: String(list._id),
    taskId: String(list.tasks[0]?._id),
    akcije: actions(app, String(list._id), String(list.tasks[0]?._id)),
  };
}

describe('Stopnja "ogled" — sme brati in nič drugega (FR-042)', () => {
  it('sme brati', async () => {
    const { app } = await createApp();
    const { b, akcije } = await setup(app, 'view');
    expect((await akcije.beri().set(AUTH(b.token))).status).toBe(200);
  });

  it('vsako pisanje dobi 403 — in NIKOLI 404, ker seznam ima v svojem izpisu (FR-051)', async () => {
    const { app } = await createApp();
    const { b, akcije } = await setup(app, 'view');

    for (const [ime, izvedi] of Object.entries({
      odkljukaj: akcije.odkljukaj,
      dodaj: akcije.dodaj,
      preimenujOpravilo: akcije.preimenujOpravilo,
      izbrisiOpravilo: akcije.izbrisiOpravilo,
      preuredi: akcije.preuredi,
      pocisti: akcije.pocisti,
      preimenujSeznam: akcije.preimenujSeznam,
      zakleni: akcije.zakleni,
      izbrisiSeznam: akcije.izbrisiSeznam,
    })) {
      const res = await izvedi().set(AUTH(b.token));
      expect(res.status, `${ime} bi moral vrniti 403`).toBe(403);
    }
  });

  it('vidi seznam med svojimi, a z zmožnostmi, ki ne dovolijo ničesar', async () => {
    const { app } = await createApp();
    const { b } = await setup(app, 'view');
    const res = await request(app).get('/api/v1/todos/lists').set(AUTH(b.token));
    const list = res.body.lists[0];
    expect(list.role).toBe('view');
    expect(list.capabilities.readList).toBe(true);
    expect(list.capabilities.toggleTask).toBe(false);
    expect(list.capabilities.writeTasks).toBe(false);
    // Zapustiti ga sme — zaklep in stopnja tega ne odvzameta (FR-047).
    expect(list.capabilities.leaveList).toBe(true);
  });
});

describe('Stopnja "odkljukavanje" — sme preklopiti, ne pa urejati (FR-043)', () => {
  it('sme odkljukati in odkljukanje vrniti', async () => {
    const { app } = await createApp();
    const { b, akcije } = await setup(app, 'check');
    const res = await akcije.odkljukaj().set(AUTH(b.token));
    expect(res.status).toBe(200);
    expect(res.body.tasks[0].done).toBe(true);
    // Vidno je tudi, KDO je odkljukal (FR-024).
    expect(res.body.tasks[0].doneBy.id).toBe(b.userId);
  });

  it('NE sme dodati, preimenovati, izbrisati, preurediti ne počistiti', async () => {
    const { app } = await createApp();
    const { b, akcije } = await setup(app, 'check');

    for (const [ime, izvedi] of Object.entries({
      dodaj: akcije.dodaj,
      preimenujOpravilo: akcije.preimenujOpravilo,
      izbrisiOpravilo: akcije.izbrisiOpravilo,
      preuredi: akcije.preuredi,
      pocisti: akcije.pocisti,
    })) {
      const res = await izvedi().set(AUTH(b.token));
      expect(res.status, `${ime} bi moral vrniti 403`).toBe(403);
    }
  });

  it('sporočilo pove, česa natanko ne sme — ne samo, da ne sme', async () => {
    const { app } = await createApp();
    const { b, akcije } = await setup(app, 'check');
    const res = await akcije.dodaj().set(AUTH(b.token));
    expect(res.body.detail).toContain('odkljuka');
  });
});

describe('Stopnja "urejanje" — sme vse z opravili, nič s seznamom (FR-044, FR-045)', () => {
  it('sme dodati, urediti, izbrisati, preurediti in počistiti', async () => {
    const { app } = await createApp();
    const { b, akcije } = await setup(app, 'edit');

    expect((await akcije.dodaj().set(AUTH(b.token))).status).toBe(201);
    expect((await akcije.preimenujOpravilo().set(AUTH(b.token))).status).toBe(200);
    expect((await akcije.preuredi().set(AUTH(b.token))).status).toBe(200);
    expect((await akcije.pocisti().set(AUTH(b.token))).status).toBe(200);
    expect((await akcije.izbrisiOpravilo().set(AUTH(b.token))).status).toBe(200);
  });

  it('NE sme preimenovati, zakleniti ne izbrisati seznama — to ostane lastniku', async () => {
    const { app } = await createApp();
    const { b, akcije } = await setup(app, 'edit');

    expect((await akcije.preimenujSeznam().set(AUTH(b.token))).status).toBe(403);
    expect((await akcije.zakleni().set(AUTH(b.token))).status).toBe(403);
    expect((await akcije.izbrisiSeznam().set(AUTH(b.token))).status).toBe(403);
  });

  it('NE sme spremeniti, komu je seznam deljen', async () => {
    const { app } = await createApp();
    const { a, b, listId } = await setup(app, 'edit');
    const c = await loginAs(app, 'c');

    const res = await request(app)
      .put(`/api/v1/todos/lists/${listId}/members/${c.userId}`)
      .set(AUTH(b.token))
      .send({ role: 'edit' });

    expect(res.status).toBe(403);
    expect(a.userId).not.toBe(b.userId);
  });
});

describe('403 proti 404 — dva različna odgovora na dve različni vprašanji', () => {
  it('ČLAN s premajhno vlogo dobi 403, TUJEC na istem endpointu 404 (FR-050, FR-051)', async () => {
    const { app } = await createApp();
    const { b, listId, taskId } = await setup(app, 'view');
    const c = await loginAs(app, 'c');

    const url = `/api/v1/todos/lists/${listId}/tasks/${taskId}`;

    // Član seznam VIDI v svojem izpisu — 404 mu ne bi ničesar skril, samo zlagal bi se mu.
    const clan = await request(app).patch(url).set(AUTH(b.token)).send({ done: true });
    expect(clan.status).toBe(403);

    // Tujcu obstoja zapisa ne razkrijemo.
    const tujec = await request(app).patch(url).set(AUTH(c.token)).send({ done: true });
    expect(tujec.status).toBe(404);
  });
});

describe('Lastnik', () => {
  it('sme vse razen zapustiti svoj seznam (FR-047)', async () => {
    const { app } = await createApp();
    const { a, listId } = await setup(app, 'edit');

    const res = await request(app)
      .delete(`/api/v1/todos/lists/${listId}/members/${a.userId}`)
      .set(AUTH(a.token));

    expect(res.status).toBe(403);
    expect(res.body.detail).toContain('izbriše');
  });
});

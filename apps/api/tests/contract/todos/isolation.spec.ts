import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/main.js';
import { clearTestDb, startTestDb, stopTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { AUTH, loginTwo, seedList } from './_helpers.js';

// FR-050, SC-004: "uporabnik, ki ni ne lastnik ne soudeleženec, iz nobenega odgovora ne more
// ugotoviti, ali seznam obstaja".
//
// Test je napisan kot ZANKA čez vse endpointe, ki sprejmejo `listId`, in ne kot nekaj izbranih
// primerov. Razlog: dovolj je EN endpoint, ki pozabi pogoj članstva, da luknja obstaja — in
// prav ta en endpoint je tisti, ki ga ročno izbran nabor primerov spregleda. Nov endpoint, ki
// se doda v seznam spodaj, je zato del naloge, ne naknadna misel.

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(clearTestDb);

describe('Izolacija: tuj seznam ne obstaja (FR-050, SC-004)', () => {
  it('vsak endpoint s tujim seznamom vrne 404 — nikoli 403 in nikoli 200', async () => {
    const { app } = await createApp();
    const { a, b } = await loginTwo(app);

    // A ima seznam z opravilom. B ni ne lastnik ne soudeleženec.
    const list = await seedList({ ownerId: a.userId, title: 'Skrivni', tasks: [{ title: 'Mleko' }] });
    const listId = String(list._id);
    const taskId = String(list.tasks[0]?._id);

    const zahteve: { opis: string; izvedi: () => request.Test }[] = [
      { opis: 'GET seznam', izvedi: () => request(app).get(`/api/v1/todos/lists/${listId}`) },
      {
        opis: 'PATCH seznam',
        izvedi: () => request(app).patch(`/api/v1/todos/lists/${listId}`).send({ title: 'Ugrabljeno' }),
      },
      { opis: 'DELETE seznam', izvedi: () => request(app).delete(`/api/v1/todos/lists/${listId}`) },
      {
        opis: 'POST opravilo',
        izvedi: () => request(app).post(`/api/v1/todos/lists/${listId}/tasks`).send({ titles: ['Vsiljeno'] }),
      },
      {
        opis: 'PATCH opravilo',
        izvedi: () =>
          request(app).patch(`/api/v1/todos/lists/${listId}/tasks/${taskId}`).send({ done: true }),
      },
      {
        opis: 'DELETE opravilo',
        izvedi: () => request(app).delete(`/api/v1/todos/lists/${listId}/tasks/${taskId}`),
      },
      {
        opis: 'POST clear-completed',
        izvedi: () => request(app).post(`/api/v1/todos/lists/${listId}/tasks/clear-completed`).send({}),
      },
    ];

    for (const { opis, izvedi } of zahteve) {
      const res = await izvedi().set(AUTH(b.token));
      expect(res.status, `${opis} bi moral vrniti 404`).toBe(404);
      // Obstoja tujega zapisa ne razkrijemo niti posredno: 403 bi povedal, da seznam obstaja.
      expect(res.status, `${opis} ne sme vrniti 403`).not.toBe(403);
    }
  });

  it('odgovor za tuj seznam ne razkrije njegovega imena ne vsebine', async () => {
    const { app } = await createApp();
    const { a, b } = await loginTwo(app);
    const list = await seedList({
      ownerId: a.userId,
      title: 'Zelo skrivno ime',
      tasks: [{ title: 'Zelo skrivno opravilo' }],
    });

    const res = await request(app).get(`/api/v1/todos/lists/${list._id}`).set(AUTH(b.token));

    const telo = JSON.stringify(res.body);
    expect(telo).not.toContain('Zelo skrivno ime');
    expect(telo).not.toContain('Zelo skrivno opravilo');
  });

  it('izpis seznamov vsebuje IZKLJUČNO lastne in deljene', async () => {
    const { app } = await createApp();
    const { a, b } = await loginTwo(app);

    await seedList({ ownerId: a.userId, title: 'Samo A' });
    await seedList({ ownerId: b.userId, title: 'Samo B' });
    await seedList({ ownerId: a.userId, title: 'Deljen z B', members: [{ userId: b.userId, role: 'view' }] });

    const resA = await request(app).get('/api/v1/todos/lists').set(AUTH(a.token));
    const resB = await request(app).get('/api/v1/todos/lists').set(AUTH(b.token));

    expect(resA.body.lists.map((l: { title: string }) => l.title).sort()).toEqual(['Deljen z B', 'Samo A']);
    expect(resB.body.lists.map((l: { title: string }) => l.title).sort()).toEqual(['Deljen z B', 'Samo B']);
  });

  it('ploščica tujega seznama ne pokaže niti kot nazadnje spremenjenega', async () => {
    const { app } = await createApp();
    const { a, b } = await loginTwo(app);
    await seedList({ ownerId: a.userId, title: 'Tuj in svež' });

    const res = await request(app).get('/api/v1/todos/current').set(AUTH(b.token));

    expect(res.status).toBe(200);
    expect(res.body.list).toBeNull();
  });

  it('pripenjanje TUJEGA seznama v ploščico ga ne razkrije — pade na svojega', async () => {
    const { app } = await createApp();
    const { a, b } = await loginTwo(app);
    const tuj = await seedList({ ownerId: a.userId, title: 'Tuj' });
    await seedList({ ownerId: b.userId, title: 'Moj' });

    // `config.listId` v nastavitvah ploščice ni preverjen ob shranjevanju (člen I), zato je
    // TA pot edina, ki tujemu ID-ju prepreči, da bi karkoli razkril.
    const res = await request(app).get(`/api/v1/todos/current?listId=${tuj._id}`).set(AUTH(b.token));

    expect(res.status).toBe(200);
    expect(res.body.list.title).toBe('Moj');
    expect(res.body.fallback).toBe(true);
  });

  it('ustvarjanje seznama ga pripiše KLICATELJU, tudi če telo poskusi drugače', async () => {
    const { app } = await createApp();
    const { a, b } = await loginTwo(app);

    const res = await request(app)
      .post('/api/v1/todos/lists')
      .set(AUTH(b.token))
      // Podtaknjena polja iz telesa se ne smejo upoštevati — shema jih ne pozna.
      .send({ title: 'Moj', ownerId: a.userId, members: [{ userId: a.userId, role: 'edit' }] });

    expect(res.status).toBe(201);
    expect(res.body.owner.id).toBe(b.userId);
    expect(res.body.members).toEqual([]);
  });
});

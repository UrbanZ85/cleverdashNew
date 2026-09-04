import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/main.js';
import { clearTestDb, startTestDb, stopTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { AUTH, loginAs, seedList } from './_helpers.js';

// FR-025, FR-026, FR-095, SC-011.
//
// Endpoint sprejme CEL vrstni red in ne relativnega premika. Najpomembnejša testa sta zato
// idempotentnost (ponovljen klic je no-op) in to, da opravilo, ki ga v `taskIds` NI, obdrži
// svoj položaj — sicer bi sočasno dodajanje med uporabnikovim preurejanjem opravilo izgubilo.

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(clearTestDb);

const titles = (body: { tasks: { title: string }[] }) => body.tasks.map((t) => t.title);

describe('PUT /todos/lists/{listId}/order (US6)', () => {
  it('postavi podani vrstni red', async () => {
    const { app } = await createApp();
    const a = await loginAs(app, 'a');
    const list = await seedList({
      ownerId: a.userId,
      tasks: [{ title: 'A' }, { title: 'B' }, { title: 'C' }],
    });
    const ids = list.tasks.map((t) => String(t._id));

    const res = await request(app)
      .put(`/api/v1/todos/lists/${list._id}/order`)
      .set(AUTH(a.token))
      .send({ taskIds: [ids[2], ids[0], ids[1]] });

    expect(res.status).toBe(200);
    expect(titles(res.body)).toEqual(['C', 'A', 'B']);
  });

  it('PONOVLJEN isti klic je no-op — pogoj za Idempotency-Key (FR-095)', async () => {
    const { app } = await createApp();
    const a = await loginAs(app, 'a');
    const list = await seedList({ ownerId: a.userId, tasks: [{ title: 'A' }, { title: 'B' }] });
    const ids = list.tasks.map((t) => String(t._id));
    const url = `/api/v1/todos/lists/${list._id}/order`;

    const prvi = await request(app).put(url).set(AUTH(a.token)).send({ taskIds: [ids[1], ids[0]] });
    const drugi = await request(app).put(url).set(AUTH(a.token)).send({ taskIds: [ids[1], ids[0]] });

    // Relativni premik bi opravilo ob ponovitvi premaknil DRUGIČ.
    expect(titles(prvi.body)).toEqual(['B', 'A']);
    expect(titles(drugi.body)).toEqual(['B', 'A']);
  });

  it('opravilo, ki ga v taskIds NI, obdrži svoj položaj in se ne izgubi (SC-011)', async () => {
    const { app } = await createApp();
    const a = await loginAs(app, 'a');
    const list = await seedList({
      ownerId: a.userId,
      tasks: [{ title: 'A', position: 1000 }, { title: 'B', position: 2000 }, { title: 'C', position: 3000 }],
    });
    const ids = list.tasks.map((t) => String(t._id));

    // Uporabnik je preurejal A in B; C je nekdo dodal medtem in ga odjemalec ne pošlje.
    const res = await request(app)
      .put(`/api/v1/todos/lists/${list._id}/order`)
      .set(AUTH(a.token))
      .send({ taskIds: [ids[1], ids[0]] });

    expect(res.status).toBe(200);
    expect(titles(res.body)).toHaveLength(3);
    expect(titles(res.body)).toContain('C');
  });

  it('neznan ali odkljukan taskId se preskoči, brez napake', async () => {
    const { app } = await createApp();
    const a = await loginAs(app, 'a');
    const list = await seedList({
      ownerId: a.userId,
      tasks: [
        { title: 'Odprto' },
        { title: 'Opravljeno', done: true, doneAt: new Date() },
      ],
    });
    const ids = list.tasks.map((t) => String(t._id));

    const res = await request(app)
      .put(`/api/v1/todos/lists/${list._id}/order`)
      .set(AUTH(a.token))
      .send({ taskIds: ['507f1f77bcf86cd799439099', ids[1], ids[0]] });

    expect(res.status).toBe(200);
    // Odkljukano ostane pod črto ne glede na to, kam ga je odjemalec postavil.
    expect(titles(res.body)).toEqual(['Odprto', 'Opravljeno']);
  });

  it('prazen taskIds ničesar ne spremeni', async () => {
    const { app } = await createApp();
    const a = await loginAs(app, 'a');
    const list = await seedList({ ownerId: a.userId, tasks: [{ title: 'A' }, { title: 'B' }] });

    const res = await request(app)
      .put(`/api/v1/todos/lists/${list._id}/order`)
      .set(AUTH(a.token))
      .send({ taskIds: [] });

    expect(res.status).toBe(200);
    expect(titles(res.body)).toEqual(['A', 'B']);
  });

  it('tuj seznam vrne 404', async () => {
    const { app } = await createApp();
    const a = await loginAs(app, 'a');
    const b = await loginAs(app, 'b');
    const list = await seedList({ ownerId: a.userId, tasks: [{ title: 'A' }] });

    const res = await request(app)
      .put(`/api/v1/todos/lists/${list._id}/order`)
      .set(AUTH(b.token))
      .send({ taskIds: [String(list.tasks[0]?._id)] });

    expect(res.status).toBe(404);
  });
});

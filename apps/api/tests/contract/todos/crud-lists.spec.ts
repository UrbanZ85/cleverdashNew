import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/main.js';
import { clearTestDb, startTestDb, stopTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { AUTH, loginAs, seedList } from './_helpers.js';
import { MAX_LISTS_PER_USER } from '../../../src/modules/todos/domain/todo-input.js';
import { TodoListModel } from '../../../src/modules/todos/models/todo-list.model.js';

// US1, FR-001 do FR-008. Pogodba: specs/010-todos/contracts/openapi.yaml.

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(clearTestDb);

describe('Seznami opravil — CRUD (US1)', () => {
  it('brez avtentikacije vrne 401', async () => {
    const { app } = await createApp();
    expect((await request(app).get('/api/v1/todos/lists')).status).toBe(401);
    expect((await request(app).post('/api/v1/todos/lists').send({ title: 'X' })).status).toBe(401);
  });

  it('nov uporabnik nima nobenega seznama in dobi veljavne meje', async () => {
    const { app } = await createApp();
    const a = await loginAs(app, 'a');

    const res = await request(app).get('/api/v1/todos/lists').set(AUTH(a.token));

    expect(res.status).toBe(200);
    expect(res.body.lists).toEqual([]);
    expect(res.body.limits.maxTasksPerList).toBeGreaterThan(0);
    expect(res.body.limits.maxListsPerUser).toBe(MAX_LISTS_PER_USER);
  });

  it('ustvari seznam in ga vrne s klicateljem kot lastnikom', async () => {
    const { app } = await createApp();
    const a = await loginAs(app, 'a');

    const res = await request(app)
      .post('/api/v1/todos/lists')
      .set(AUTH(a.token))
      .send({ title: 'Nakup' });

    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Nakup');
    expect(res.body.owner.id).toBe(a.userId);
    expect(res.body.role).toBe('owner');
    expect(res.body.locked).toBe(false);
    expect(res.body.members).toEqual([]);
    expect(res.body.taskCount).toBe(0);
    expect(res.body.isNew).toBe(false);
    // Lastnik sme vse razen zapustiti svoj seznam.
    expect(res.body.capabilities.deleteList).toBe(true);
    expect(res.body.capabilities.manageSharing).toBe(true);
    expect(res.body.capabilities.leaveList).toBe(false);
  });

  it('ime seznama se očisti; ime iz samih presledkov je 400', async () => {
    const { app } = await createApp();
    const a = await loginAs(app, 'a');

    const ok = await request(app)
      .post('/api/v1/todos/lists')
      .set(AUTH(a.token))
      .send({ title: '   Nakupovalni    seznam   ' });
    expect(ok.status).toBe(201);
    expect(ok.body.title).toBe('Nakupovalni seznam');

    const prazno = await request(app)
      .post('/api/v1/todos/lists')
      .set(AUTH(a.token))
      .send({ title: '    ' });
    expect(prazno.status).toBe(400);
  });

  it('izpis je urejen po zadnji spremembi, najnovejši prvi (FR-006)', async () => {
    const { app } = await createApp();
    const a = await loginAs(app, 'a');

    await seedList({ ownerId: a.userId, title: 'Star' });
    await new Promise((r) => setTimeout(r, 10));
    await seedList({ ownerId: a.userId, title: 'Nov' });

    const res = await request(app).get('/api/v1/todos/lists').set(AUTH(a.token));
    expect(res.body.lists.map((l: { title: string }) => l.title)).toEqual(['Nov', 'Star']);
  });

  it('izpis privzeto NE vsebuje opravil; z includeTasks jih vsebuje (FR-005)', async () => {
    const { app } = await createApp();
    const a = await loginAs(app, 'a');
    await seedList({ ownerId: a.userId, tasks: [{ title: 'Mleko' }, { title: 'Kruh', done: true }] });

    const brez = await request(app).get('/api/v1/todos/lists').set(AUTH(a.token));
    expect(brez.body.lists[0].tasks).toBeUndefined();
    // Napredek je viden tudi brez opravil — vrstica čipov ga potrebuje.
    expect(brez.body.lists[0].taskCount).toBe(2);
    expect(brez.body.lists[0].openCount).toBe(1);

    const z = await request(app)
      .get('/api/v1/todos/lists?includeTasks=true')
      .set(AUTH(a.token));
    expect(z.body.lists[0].tasks).toHaveLength(2);
  });

  it('branje enega seznama vrne opravila, že razvrščena za prikaz', async () => {
    const { app } = await createApp();
    const a = await loginAs(app, 'a');
    const list = await seedList({
      ownerId: a.userId,
      tasks: [
        { title: 'Opravljeno', done: true, doneAt: new Date('2026-06-15T10:00:00Z'), position: 1000 },
        { title: 'Odprto', position: 2000 },
      ],
    });

    const res = await request(app).get(`/api/v1/todos/lists/${list._id}`).set(AUTH(a.token));

    expect(res.status).toBe(200);
    expect(res.body.tasks.map((t: { title: string }) => t.title)).toEqual(['Odprto', 'Opravljeno']);
  });

  it('preimenovanje spremeni ime; izpuščeno polje ničesar ne spremeni', async () => {
    const { app } = await createApp();
    const a = await loginAs(app, 'a');
    const list = await seedList({ ownerId: a.userId, title: 'Staro ime' });

    const res = await request(app)
      .patch(`/api/v1/todos/lists/${list._id}`)
      .set(AUTH(a.token))
      .send({ title: 'Novo ime' });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Novo ime');
    expect(res.body.locked).toBe(false);
  });

  it('prazno telo pri PATCH je 400 — "nič ne spremeni" ni veljavna zahteva', async () => {
    const { app } = await createApp();
    const a = await loginAs(app, 'a');
    const list = await seedList({ ownerId: a.userId });

    const res = await request(app)
      .patch(`/api/v1/todos/lists/${list._id}`)
      .set(AUTH(a.token))
      .send({});
    expect(res.status).toBe(400);
  });

  it('brisanje vrne 200 S TELESOM, ne 204 (plan.md U2)', async () => {
    const { app } = await createApp();
    const a = await loginAs(app, 'a');
    const list = await seedList({ ownerId: a.userId });

    const res = await request(app).delete(`/api/v1/todos/lists/${list._id}`).set(AUTH(a.token));

    // 204 se v hrambo idempotence ne zabeleži (ovije se `res.json`), zato bi ponovljen DELETE
    // z istim ključem vrnil 404 namesto prvotnega uspeha.
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deleted: true });
    expect(await TodoListModel.countDocuments({})).toBe(0);
  });

  it('brisanje odstrani tudi opravila in članstva — vse je v istem dokumentu (FR-003)', async () => {
    const { app } = await createApp();
    const a = await loginAs(app, 'a');
    const b = await loginAs(app, 'b');
    const list = await seedList({
      ownerId: a.userId,
      members: [{ userId: b.userId, role: 'edit' }],
      tasks: [{ title: 'Mleko' }],
    });

    await request(app).delete(`/api/v1/todos/lists/${list._id}`).set(AUTH(a.token));

    // B seznama ne vidi več nikjer.
    const res = await request(app).get('/api/v1/todos/lists').set(AUTH(b.token));
    expect(res.body.lists).toEqual([]);
  });

  it('neveljaven ID seznama je 404, ne 500 (CastError ne sme uiti)', async () => {
    const { app } = await createApp();
    const a = await loginAs(app, 'a');

    const res = await request(app).get('/api/v1/todos/lists/ni-veljaven-id').set(AUTH(a.token));
    expect(res.status).toBe(404);
  });

  it('ob doseženi meji seznamov vrne 409 s pojasnilom, kaj storiti', async () => {
    const { app } = await createApp();
    const a = await loginAs(app, 'a');

    await TodoListModel.insertMany(
      Array.from({ length: MAX_LISTS_PER_USER }, (_, i) => ({
        ownerId: a.userId,
        title: `Seznam ${i}`,
        locked: false,
        members: [],
        tasks: [],
        lastModifiedBy: a.userId,
      })),
    );

    const res = await request(app)
      .post('/api/v1/todos/lists')
      .set(AUTH(a.token))
      .send({ title: 'Še eden' });

    expect(res.status).toBe(409);
    expect(res.body.detail).toContain(String(MAX_LISTS_PER_USER));
  });
});

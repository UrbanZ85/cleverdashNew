import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/main.js';
import { clearTestDb, startTestDb, stopTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { AUTH, loginAs, seedList } from './_helpers.js';
import { MAX_TASKS_PER_LIST } from '../../../src/modules/todos/domain/todo-input.js';
import { TodoListModel } from '../../../src/modules/todos/models/todo-list.model.js';

// US1, FR-010 do FR-024.

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(clearTestDb);

const tasksUrl = (listId: unknown) => `/api/v1/todos/lists/${String(listId)}/tasks`;

describe('Opravila — dodajanje (US1)', () => {
  it('doda eno opravilo in vrne novo stanje CELEGA seznama', async () => {
    const { app } = await createApp();
    const a = await loginAs(app, 'a');
    const list = await seedList({ ownerId: a.userId });

    const res = await request(app).post(tasksUrl(list._id)).set(AUTH(a.token)).send({ titles: ['Mleko'] });

    expect(res.status).toBe(201);
    expect(res.body.tasks).toHaveLength(1);
    expect(res.body.tasks[0].title).toBe('Mleko');
    expect(res.body.tasks[0].done).toBe(false);
    expect(res.body.tasks[0].doneBy).toBeNull();
    expect(res.body.openCount).toBe(1);
  });

  it('doda več opravil naenkrat — prilepljeno besedilo da po eno na vrstico (FR-013)', async () => {
    const { app } = await createApp();
    const a = await loginAs(app, 'a');
    const list = await seedList({ ownerId: a.userId });

    const res = await request(app)
      .post(tasksUrl(list._id))
      .set(AUTH(a.token))
      .send({ titles: ['Mleko', 'Kruh', 'Kava'] });

    expect(res.status).toBe(201);
    expect(res.body.tasks.map((t: { title: string }) => t.title)).toEqual(['Mleko', 'Kruh', 'Kava']);
  });

  it('nova opravila gredo NA KONEC neodkljukanih, ne na začetek', async () => {
    const { app } = await createApp();
    const a = await loginAs(app, 'a');
    const list = await seedList({ ownerId: a.userId, tasks: [{ title: 'Prvo' }] });

    const res = await request(app).post(tasksUrl(list._id)).set(AUTH(a.token)).send({ titles: ['Drugo'] });
    expect(res.body.tasks.map((t: { title: string }) => t.title)).toEqual(['Prvo', 'Drugo']);
  });

  it('besedilo se očisti; opravilo brez besedila je 400 in NE tiho preskočeno (FR-014)', async () => {
    const { app } = await createApp();
    const a = await loginAs(app, 'a');
    const list = await seedList({ ownerId: a.userId });

    const ok = await request(app)
      .post(tasksUrl(list._id))
      .set(AUTH(a.token))
      .send({ titles: ['  Kupi   mleko  '] });
    expect(ok.body.tasks[0].title).toBe('Kupi mleko');

    // Tiho preskočena vrstica je opravilo, za katero uporabnik misli, da ga je dodal.
    const slabo = await request(app)
      .post(tasksUrl(list._id))
      .set(AUTH(a.token))
      .send({ titles: ['Mleko', '   '] });
    expect(slabo.status).toBe(400);

    const po = await request(app).get(`/api/v1/todos/lists/${list._id}`).set(AUTH(a.token));
    expect(po.body.tasks).toHaveLength(1);
  });

  it('prazen seznam naslovov je 400', async () => {
    const { app } = await createApp();
    const a = await loginAs(app, 'a');
    const list = await seedList({ ownerId: a.userId });

    expect((await request(app).post(tasksUrl(list._id)).set(AUTH(a.token)).send({ titles: [] })).status).toBe(400);
  });

  it('ob polnem seznamu vrne 409 in NE 400 — polnost je stanje, ne napaka zahteve', async () => {
    const { app } = await createApp();
    const a = await loginAs(app, 'a');
    const list = await seedList({
      ownerId: a.userId,
      tasks: Array.from({ length: MAX_TASKS_PER_LIST }, (_, i) => ({ title: `Opravilo ${i}` })),
    });

    const res = await request(app).post(tasksUrl(list._id)).set(AUTH(a.token)).send({ titles: ['Še eno'] });

    expect(res.status).toBe(409);
    expect(res.body.detail).toContain(String(MAX_TASKS_PER_LIST));
  });
});

describe('Opravila — odkljukavanje in razvrstitev (US1)', () => {
  it('odkljukanje prečrta opravilo, zabeleži čas IN avtorja, ter ga potisne pod črto', async () => {
    const { app } = await createApp();
    const a = await loginAs(app, 'a');
    const list = await seedList({ ownerId: a.userId, tasks: [{ title: 'Mleko' }, { title: 'Kruh' }] });
    const taskId = String(list.tasks[0]?._id);

    const res = await request(app)
      .patch(`${tasksUrl(list._id)}/${taskId}`)
      .set(AUTH(a.token))
      .send({ done: true });

    expect(res.status).toBe(200);
    const done = res.body.tasks.find((t: { id: string }) => t.id === taskId);
    expect(done.done).toBe(true);
    expect(done.doneAt).not.toBeNull();
    expect(done.doneBy.id).toBe(a.userId);
    // Odkljukano pade na dno (FR-021).
    expect(res.body.tasks.map((t: { title: string }) => t.title)).toEqual(['Kruh', 'Mleko']);
    expect(res.body.openCount).toBe(1);
  });

  it('vrnitev odkljukanja počisti čas in avtorja ter vrne opravilo na svoje mesto (FR-023)', async () => {
    const { app } = await createApp();
    const a = await loginAs(app, 'a');
    const list = await seedList({
      ownerId: a.userId,
      tasks: [
        { title: 'Mleko', done: true, doneAt: new Date(), doneBy: a.userId, position: 1000 },
        { title: 'Kruh', position: 2000 },
      ],
    });
    const taskId = String(list.tasks[0]?._id);

    const res = await request(app)
      .patch(`${tasksUrl(list._id)}/${taskId}`)
      .set(AUTH(a.token))
      .send({ done: false });

    const back = res.body.tasks.find((t: { id: string }) => t.id === taskId);
    expect(back.done).toBe(false);
    expect(back.doneAt).toBeNull();
    expect(back.doneBy).toBeNull();
    // Ročni položaj 1000 < 2000, zato se vrne PRED Kruh.
    expect(res.body.tasks.map((t: { title: string }) => t.title)).toEqual(['Mleko', 'Kruh']);
  });

  it('nazadnje odkljukano je na vrhu prečrtane skupine (FR-022)', async () => {
    const { app } = await createApp();
    const a = await loginAs(app, 'a');
    const list = await seedList({
      ownerId: a.userId,
      tasks: [
        { title: 'Prej', done: true, doneAt: new Date('2026-06-15T08:00:00Z') },
        { title: 'Pozneje', done: true, doneAt: new Date('2026-06-15T12:00:00Z') },
      ],
    });

    const res = await request(app).get(`/api/v1/todos/lists/${list._id}`).set(AUTH(a.token));
    expect(res.body.tasks.map((t: { title: string }) => t.title)).toEqual(['Pozneje', 'Prej']);
  });

  it('preimenovanje opravila; prazno besedilo je 400', async () => {
    const { app } = await createApp();
    const a = await loginAs(app, 'a');
    const list = await seedList({ ownerId: a.userId, tasks: [{ title: 'Mleko' }] });
    const taskId = String(list.tasks[0]?._id);

    const ok = await request(app)
      .patch(`${tasksUrl(list._id)}/${taskId}`)
      .set(AUTH(a.token))
      .send({ title: 'Polnomastno mleko' });
    expect(ok.body.tasks[0].title).toBe('Polnomastno mleko');

    const slabo = await request(app)
      .patch(`${tasksUrl(list._id)}/${taskId}`)
      .set(AUTH(a.token))
      .send({ title: '   ' });
    expect(slabo.status).toBe(400);
  });

  it('neobstoječe opravilo je 404, tudi kadar seznam obstaja', async () => {
    const { app } = await createApp();
    const a = await loginAs(app, 'a');
    const list = await seedList({ ownerId: a.userId, tasks: [{ title: 'Mleko' }] });

    const res = await request(app)
      .patch(`${tasksUrl(list._id)}/507f1f77bcf86cd799439099`)
      .set(AUTH(a.token))
      .send({ done: true });
    expect(res.status).toBe(404);
  });
});

describe('Opravila — brisanje in čiščenje (US1)', () => {
  it('brisanje opravila vrne 200 s telesom in novim stanjem seznama', async () => {
    const { app } = await createApp();
    const a = await loginAs(app, 'a');
    const list = await seedList({ ownerId: a.userId, tasks: [{ title: 'Mleko' }, { title: 'Kruh' }] });
    const taskId = String(list.tasks[0]?._id);

    const res = await request(app).delete(`${tasksUrl(list._id)}/${taskId}`).set(AUTH(a.token));

    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(true);
    expect(res.body.list.tasks.map((t: { title: string }) => t.title)).toEqual(['Kruh']);
  });

  it('čiščenje odstrani samo odkljukana in pove, koliko jih je bilo (FR-018)', async () => {
    const { app } = await createApp();
    const a = await loginAs(app, 'a');
    const list = await seedList({
      ownerId: a.userId,
      tasks: [
        { title: 'Mleko', done: true, doneAt: new Date() },
        { title: 'Kruh' },
        { title: 'Kava', done: true, doneAt: new Date() },
      ],
    });

    const res = await request(app)
      .post(`${tasksUrl(list._id)}/clear-completed`)
      .set(AUTH(a.token))
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.removed).toBe(2);
    expect(res.body.list.tasks.map((t: { title: string }) => t.title)).toEqual(['Kruh']);

    // Trajno stanje, ne samo odgovor.
    const po = await TodoListModel.findById(list._id).lean();
    expect(po?.tasks).toHaveLength(1);
  });

  it('čiščenje na seznamu brez odkljukanih je no-op z removed: 0', async () => {
    const { app } = await createApp();
    const a = await loginAs(app, 'a');
    const list = await seedList({ ownerId: a.userId, tasks: [{ title: 'Mleko' }] });

    const res = await request(app)
      .post(`${tasksUrl(list._id)}/clear-completed`)
      .set(AUTH(a.token))
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.removed).toBe(0);
    expect(res.body.list.tasks).toHaveLength(1);
  });

  it('pot clear-completed se NE ujame kot opravilo z id "clear-completed"', async () => {
    // Vrstni red poti: statična pot mora biti deklarirana pred `/tasks/:taskId`.
    const { app } = await createApp();
    const a = await loginAs(app, 'a');
    const list = await seedList({ ownerId: a.userId, tasks: [{ title: 'Mleko', done: true, doneAt: new Date() }] });

    const res = await request(app)
      .post(`${tasksUrl(list._id)}/clear-completed`)
      .set(AUTH(a.token))
      .send({});
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('removed');
  });
});

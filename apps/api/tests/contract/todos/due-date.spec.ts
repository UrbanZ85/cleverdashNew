import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/main.js';
import { clearTestDb, startTestDb, stopTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { AUTH, loginAs, loginTwo, seedList } from './_helpers.js';
import { ljubljanaCalendarDay } from '../../../src/domain/timezone.js';

// US5, FR-030 do FR-035.
//
// Izračun stanja roka je izčrpno pokrit kot čista funkcija, vključno z obema prehodoma časa
// (tests/unit/todos-due-date.spec.ts). Tu se preverja nekaj drugega: da rok res pripotuje skozi
// endpoint, da se `null` loči od izpuščenega polja, in da za rok velja `writeTasks` in ne
// `toggleTask` — kar je razlika med stopnjama "urejanje" in "odkljukavanje".

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(clearTestDb);

const taskUrl = (listId: unknown, taskId: unknown) =>
  `/api/v1/todos/lists/${String(listId)}/tasks/${String(taskId)}`;

describe('Rok opravila (US5)', () => {
  it('PATCH { dueDate } postavi rok na PRAVI koledarski dan', async () => {
    const { app } = await createApp();
    const a = await loginAs(app, 'a');
    const list = await seedList({ ownerId: a.userId, tasks: [{ title: 'Pokliči serviserja' }] });

    const res = await request(app)
      .patch(taskUrl(list._id, list.tasks[0]?._id))
      .set(AUTH(a.token))
      .send({ dueDate: '2026-06-20' });

    expect(res.status).toBe(200);
    const task = res.body.tasks[0];
    expect(task.dueDate).not.toBeNull();
    // Shranjeno je kot UTC instant KONCA dneva v ljubljanski coni — dan mora ostati isti.
    expect(ljubljanaCalendarDay(new Date(task.dueDate))).toBe('2026-06-20');
    expect(task.dueState).toBeTruthy();
  });

  it('{ dueDate: null } rok ODSTRANI in se razlikuje od izpuščenega polja', async () => {
    const { app } = await createApp();
    const a = await loginAs(app, 'a');
    const list = await seedList({
      ownerId: a.userId,
      tasks: [{ title: 'Z rokom', dueDate: new Date('2026-06-20T21:59:59.999Z') }],
    });
    const url = taskUrl(list._id, list.tasks[0]?._id);

    // Izpuščeno polje pomeni "ne spreminjaj" — rok ostane.
    const brezPolja = await request(app).patch(url).set(AUTH(a.token)).send({ title: 'Preimenovano' });
    expect(brezPolja.body.tasks[0].dueDate).not.toBeNull();

    // `null` je pomenska vrednost: odstrani.
    const zNull = await request(app).patch(url).set(AUTH(a.token)).send({ dueDate: null });
    expect(zNull.body.tasks[0].dueDate).toBeNull();
    expect(zNull.body.tasks[0].dueState).toBeNull();
  });

  it('POST …/tasks sprejme skupen rok za vsa opravila iz zahteve', async () => {
    const { app } = await createApp();
    const a = await loginAs(app, 'a');
    const list = await seedList({ ownerId: a.userId });

    const res = await request(app)
      .post(`/api/v1/todos/lists/${list._id}/tasks`)
      .set(AUTH(a.token))
      .send({ titles: ['Mleko', 'Kruh'], dueDate: '2026-06-20' });

    expect(res.status).toBe(201);
    for (const task of res.body.tasks) {
      expect(ljubljanaCalendarDay(new Date(task.dueDate))).toBe('2026-06-20');
    }
  });

  it('rok v preteklosti je zapadel; odkljukan pa NE šteje več (FR-034)', async () => {
    const { app } = await createApp();
    const a = await loginAs(app, 'a');
    const list = await seedList({
      ownerId: a.userId,
      tasks: [{ title: 'Zamuja', dueDate: new Date('2020-01-01T22:59:59Z') }],
    });
    const url = taskUrl(list._id, list.tasks[0]?._id);

    const pred = await request(app).get(`/api/v1/todos/lists/${list._id}`).set(AUTH(a.token));
    expect(pred.body.tasks[0].dueState).toBe('overdue');
    expect(pred.body.nextDueDate).not.toBeNull();

    const po = await request(app).patch(url).set(AUTH(a.token)).send({ done: true });
    // Opravljeno opravilo z včerajšnjim rokom ni zamuda.
    expect(po.body.nextDueDate).toBeNull();
  });

  it('nextDueDate seznama je NAJZGODNEJŠI rok med nedokončanimi', async () => {
    const { app } = await createApp();
    const a = await loginAs(app, 'a');
    const list = await seedList({
      ownerId: a.userId,
      tasks: [
        { title: 'Pozneje', dueDate: new Date('2026-08-20T21:59:59.999Z') },
        { title: 'Prej', dueDate: new Date('2026-06-20T21:59:59.999Z') },
        { title: 'Brez roka' },
      ],
    });

    const res = await request(app).get(`/api/v1/todos/lists/${list._id}`).set(AUTH(a.token));
    expect(ljubljanaCalendarDay(new Date(res.body.nextDueDate))).toBe('2026-06-20');
  });

  it('neveljavna oblika roka je 400 — ne tiho prezrta', async () => {
    const { app } = await createApp();
    const a = await loginAs(app, 'a');
    const list = await seedList({ ownerId: a.userId, tasks: [{ title: 'X' }] });

    const res = await request(app)
      .patch(taskUrl(list._id, list.tasks[0]?._id))
      .set(AUTH(a.token))
      .send({ dueDate: '20. junij 2026' });

    expect(res.status).toBe(400);
  });

  it('rok zahteva "urejanje", ne "odkljukavanje" — to je razlika med stopnjama', async () => {
    const { app } = await createApp();
    const { a, b } = await loginTwo(app);
    const list = await seedList({
      ownerId: a.userId,
      members: [{ userId: b.userId, role: 'check' }],
      tasks: [{ title: 'Mleko' }],
    });
    const url = taskUrl(list._id, list.tasks[0]?._id);

    // Sme odkljukati …
    expect((await request(app).patch(url).set(AUTH(b.token)).send({ done: true })).status).toBe(200);
    // … ne sme pa postaviti roka.
    expect((await request(app).patch(url).set(AUTH(b.token)).send({ dueDate: '2026-06-20' })).status).toBe(403);
  });

  it('telo z done IN dueDate zahteva višjo od obeh zmožnosti', async () => {
    const { app } = await createApp();
    const { a, b } = await loginTwo(app);
    const list = await seedList({
      ownerId: a.userId,
      members: [{ userId: b.userId, role: 'check' }],
      tasks: [{ title: 'Mleko' }],
    });

    const res = await request(app)
      .patch(taskUrl(list._id, list.tasks[0]?._id))
      .set(AUTH(b.token))
      .send({ done: true, dueDate: '2026-06-20' });

    // Privzetek, ki bi v dvomu dovolil, bi bil varnostna napaka.
    expect(res.status).toBe(403);
  });
});

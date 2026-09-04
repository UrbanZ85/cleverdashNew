import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/main.js';
import { clearTestDb, startTestDb, stopTestDb } from '../setup/mongo-memory.js';
import { setTestEnv } from '../setup/test-env.js';
import { AUTH, loginAs, loginTwo, seedList } from '../contract/todos/_helpers.js';

// FR-103. Podnaslov in značka ob zavihku sta NADOMESTILO ZA POTISNO OBVESTILO, ki v tej
// namestitvi ne more delovati (plan.md, Complexity Tracking U3). Zato ni okras: če to ne
// deluje, uporabnik za nov deljen seznam sploh ne izve.

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(clearTestDb);

async function todosTab(app: Parameters<typeof loginAs>[0], token: string) {
  const res = await request(app).get('/api/v1/tabs').set(AUTH(token));
  expect(res.status).toBe(200);
  return res.body.find((t: { id: string }) => t.id === 'todos');
}

describe('Zavihek Opravila v meniju (FR-103)', () => {
  it('brez seznamov nima podnaslova — prazna značka je šum, ne informacija', async () => {
    const { app } = await createApp();
    const a = await loginAs(app, 'a');

    const tab = await todosTab(app, a.token);
    expect(tab).toBeDefined();
    expect(tab.detail).toBeUndefined();
  });

  it('šteje nedokončana opravila čez VSE vidne sezname, s pravilno sklanjatvijo', async () => {
    const { app } = await createApp();
    const a = await loginAs(app, 'a');
    await seedList({ ownerId: a.userId, tasks: [{ title: 'A' }, { title: 'B' }] });
    await seedList({ ownerId: a.userId, tasks: [{ title: 'C' }, { title: 'D', done: true, doneAt: new Date() }] });

    const tab = await todosTab(app, a.token);
    expect(tab.detail.subtitle).toBe('3 nedokončana opravila');
    expect(tab.detail.status).toBe('ok');
  });

  it('sklanjatev drži tudi pri ena in dva', async () => {
    const { app } = await createApp();
    const a = await loginAs(app, 'a');
    await seedList({ ownerId: a.userId, tasks: [{ title: 'A' }] });
    expect((await todosTab(app, a.token)).detail.subtitle).toBe('1 nedokončano opravilo');
  });

  it('zapadel rok da rdečo značko', async () => {
    const { app } = await createApp();
    const a = await loginAs(app, 'a');
    await seedList({
      ownerId: a.userId,
      tasks: [{ title: 'Zamuja', dueDate: new Date('2020-01-01T22:59:59Z') }, { title: 'Odprto' }],
    });

    const tab = await todosTab(app, a.token);
    expect(tab.detail.status).toBe('danger');
    expect(tab.detail.statusLabel).toContain('zapadlo');
  });

  it('ODKLJUKANO opravilo z zapadlim rokom NE šteje med zamude (FR-034)', async () => {
    const { app } = await createApp();
    const a = await loginAs(app, 'a');
    await seedList({
      ownerId: a.userId,
      tasks: [
        { title: 'Zamujalo je', done: true, doneAt: new Date(), dueDate: new Date('2020-01-01T22:59:59Z') },
        { title: 'Odprto' },
      ],
    });

    const tab = await todosTab(app, a.token);
    expect(tab.detail.status).toBe('ok');
  });

  it('nov deljen seznam ima PREDNOST pred zapadlim rokom', async () => {
    const { app } = await createApp();
    const { a, b } = await loginTwo(app);
    // B ima svoj zapadel rok IN nov seznam, ki mu ga je pravkar delil A.
    await seedList({ ownerId: b.userId, tasks: [{ title: 'Moje', dueDate: new Date('2020-01-01T22:59:59Z') }] });
    await seedList({ ownerId: a.userId, title: 'Deljen', members: [{ userId: b.userId, role: 'view' }] });

    const tab = await todosTab(app, b.token);
    // Zapadel rok uporabnik že pozna; za nov seznam sploh še ne ve, da obstaja.
    expect(tab.detail.statusLabel).toContain('nov seznam');
  });

  it('lastniku njegov lastni seznam nikoli ni "nov"', async () => {
    const { app } = await createApp();
    const { a, b } = await loginTwo(app);
    await seedList({ ownerId: a.userId, members: [{ userId: b.userId, role: 'view' }], tasks: [{ title: 'X' }] });

    const tab = await todosTab(app, a.token);
    expect(tab.detail.statusLabel).toBeUndefined();
    expect(tab.detail.status).toBe('ok');
  });

  it('šteje tudi opravila na seznamih, ki so deljeni Z MANO', async () => {
    const { app } = await createApp();
    const { a, b } = await loginTwo(app);
    await seedList({
      ownerId: a.userId,
      members: [{ userId: b.userId, role: 'check', seenAt: new Date() }],
      tasks: [{ title: 'Tuje, a moje opravilo' }],
    });

    const tab = await todosTab(app, b.token);
    expect(tab.detail.subtitle).toBe('1 nedokončano opravilo');
  });

  it('tujih seznamov NE šteje', async () => {
    const { app } = await createApp();
    const { a, b } = await loginTwo(app);
    await seedList({ ownerId: a.userId, tasks: [{ title: 'A-jevo' }] });

    const tab = await todosTab(app, b.token);
    expect(tab.detail).toBeUndefined();
  });
});

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/main.js';
import { clearTestDb, startTestDb, stopTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { AUTH, loginAs, loginTwo, seedList } from './_helpers.js';
import { MAX_MEMBERS_PER_LIST } from '../../../src/modules/todos/domain/todo-input.js';
import { TodoListModel } from '../../../src/modules/todos/models/todo-list.model.js';
import { UserModel } from '../../../src/modules/auth/models/user.model.js';

// US3, FR-040, FR-046 do FR-049, FR-070.

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(clearTestDb);

const members = (listId: unknown, userId: string) =>
  `/api/v1/todos/lists/${String(listId)}/members/${userId}`;

describe('Dodajanje soudeleženca', () => {
  it('nov soudeleženec da 201 in seznam se mu pojavi med njegovimi', async () => {
    const { app } = await createApp();
    const { a, b } = await loginTwo(app);
    const list = await seedList({ ownerId: a.userId, title: 'Nakup' });

    const res = await request(app)
      .put(members(list._id, b.userId))
      .set(AUTH(a.token))
      .send({ role: 'check' });

    expect(res.status).toBe(201);
    expect(res.body.members).toHaveLength(1);
    expect(res.body.members[0].user.id).toBe(b.userId);
    expect(res.body.members[0].role).toBe('check');

    const zaB = await request(app).get('/api/v1/todos/lists').set(AUTH(b.token));
    expect(zaB.body.lists.map((l: { title: string }) => l.title)).toEqual(['Nakup']);
  });

  it('e-pošte pri ŽE DODANIH soudeležencih ni (FR-074)', async () => {
    const { app } = await createApp();
    const { a, b } = await loginTwo(app);
    const list = await seedList({ ownerId: a.userId, members: [{ userId: b.userId, role: 'view' }] });

    const res = await request(app).get(`/api/v1/todos/lists/${list._id}`).set(AUTH(a.token));
    expect(res.body.members[0].user.emailHint).toBe('');
    expect(res.body.members[0].user.displayName).toBeTruthy();
    expect(res.body.members[0].user.initials).toBeTruthy();
  });

  it('ponovni klic za ISTEGA človeka spremeni stopnjo in da 200, ne 201 in ne dvojnika', async () => {
    const { app } = await createApp();
    const { a, b } = await loginTwo(app);
    const list = await seedList({ ownerId: a.userId });

    const prvi = await request(app).put(members(list._id, b.userId)).set(AUTH(a.token)).send({ role: 'view' });
    const drugi = await request(app).put(members(list._id, b.userId)).set(AUTH(a.token)).send({ role: 'edit' });

    expect(prvi.status).toBe(201);
    expect(drugi.status).toBe(200);
    expect(drugi.body.members).toHaveLength(1);
    expect(drugi.body.members[0].role).toBe('edit');

    // Trajno stanje, ne samo odgovor.
    const doc = await TodoListModel.findById(list._id).lean();
    expect(doc?.members).toHaveLength(1);
  });

  it('lastnika ni mogoče dodati med soudeležence — 400, ne 403 (FR-048)', async () => {
    const { app } = await createApp();
    const a = await loginAs(app, 'a');
    const list = await seedList({ ownerId: a.userId });

    const res = await request(app).put(members(list._id, a.userId)).set(AUTH(a.token)).send({ role: 'edit' });

    // Ni pomanjkanje pravice, ampak zahteva brez pomena.
    expect(res.status).toBe(400);
    expect(res.body.detail).toContain('Lastnika');
  });

  it('uporabnik, ki se še ni prijavil, ni mogoča tarča deljenja (FR-070)', async () => {
    const { app } = await createApp();
    const a = await loginAs(app, 'a');
    const list = await seedList({ ownerId: a.userId });

    const nikoli = await UserModel.create({
      keycloakSubject: 'kc-sub-nikoli',
      email: 'nikoli@agenda.si',
      displayName: 'Nikoli Prijavljen',
      scopes: [],
      lastLoginAt: null,
    });

    const res = await request(app)
      .put(members(list._id, String(nikoli._id)))
      .set(AUTH(a.token))
      .send({ role: 'view' });

    expect(res.status).toBe(400);
    expect(res.body.detail).toContain('prijavil');
  });

  it('neveljavna stopnja je 400', async () => {
    const { app } = await createApp();
    const { a, b } = await loginTwo(app);
    const list = await seedList({ ownerId: a.userId });

    const res = await request(app)
      .put(members(list._id, b.userId))
      .set(AUTH(a.token))
      .send({ role: 'lastnik' });

    expect(res.status).toBe(400);
  });

  it('ob doseženi meji soudeležencev vrne 409 s pojasnilom', async () => {
    const { app } = await createApp();
    const { a, b } = await loginTwo(app);

    // Napolni do meje z izmišljenimi identifikatorji — meja se uveljavi v filtru zapisa.
    const polni = Array.from({ length: MAX_MEMBERS_PER_LIST }, () => ({
      userId: new (TodoListModel.base.Types.ObjectId)(),
      role: 'view',
      addedAt: new Date(),
      seenAt: null,
    }));
    const list = await TodoListModel.create({
      ownerId: a.userId,
      title: 'Poln',
      locked: false,
      members: polni,
      tasks: [],
      lastModifiedBy: a.userId,
    });

    const res = await request(app)
      .put(members(list._id, b.userId))
      .set(AUTH(a.token))
      .send({ role: 'view' });

    expect(res.status).toBe(409);
    expect(res.body.detail).toContain(String(MAX_MEMBERS_PER_LIST));
  });
});

describe('Odvzem dostopa', () => {
  it('lastnik odvzame dostop in seznam soudeležencu izgine (FR-046)', async () => {
    const { app } = await createApp();
    const { a, b } = await loginTwo(app);
    const list = await seedList({ ownerId: a.userId, members: [{ userId: b.userId, role: 'edit' }] });

    const res = await request(app).delete(members(list._id, b.userId)).set(AUTH(a.token));

    expect(res.status).toBe(200);
    expect(res.body.removed).toBe(true);
    expect(res.body.list.members).toEqual([]);

    const zaB = await request(app).get('/api/v1/todos/lists').set(AUTH(b.token));
    expect(zaB.body.lists).toEqual([]);
    // Naslednja zahteva zanj se obravnava, kot da seznam ne obstaja.
    expect((await request(app).get(`/api/v1/todos/lists/${list._id}`).set(AUTH(b.token))).status).toBe(404);
  });

  it('soudeleženec zapusti seznam sam; odgovor zanj nima več seznama', async () => {
    const { app } = await createApp();
    const { a, b } = await loginTwo(app);
    const list = await seedList({ ownerId: a.userId, members: [{ userId: b.userId, role: 'view' }] });

    const res = await request(app).delete(members(list._id, b.userId)).set(AUTH(b.token));

    expect(res.status).toBe(200);
    expect(res.body.removed).toBe(true);
    // Po odhodu ga ne vidi več, zato ni česa vrniti.
    expect(res.body.list).toBeNull();
    expect(a.userId).not.toBe(b.userId);
  });

  it('odvzem nekomu, ki dostopa nima, je 200 z removed:false — ponovljen klic ne sme pasti (FR-094)', async () => {
    const { app } = await createApp();
    const { a, b } = await loginTwo(app);
    const list = await seedList({ ownerId: a.userId, members: [{ userId: b.userId, role: 'view' }] });

    const prvi = await request(app).delete(members(list._id, b.userId)).set(AUTH(a.token));
    const drugi = await request(app).delete(members(list._id, b.userId)).set(AUTH(a.token));

    expect(prvi.body.removed).toBe(true);
    expect(drugi.status).toBe(200);
    expect(drugi.body.removed).toBe(false);
  });

  it('soudeleženec ne more odvzeti dostopa NEKOMU DRUGEMU', async () => {
    const { app } = await createApp();
    const { a, b } = await loginTwo(app);
    const c = await loginAs(app, 'c');
    const list = await seedList({
      ownerId: a.userId,
      members: [
        { userId: b.userId, role: 'edit' },
        { userId: c.userId, role: 'edit' },
      ],
    });

    const res = await request(app).delete(members(list._id, c.userId)).set(AUTH(b.token));
    expect(res.status).toBe(403);
  });
});

describe('Oznaka "novo" (FR-007)', () => {
  it('nov deljen seznam je za prejemnika označen kot nov, za lastnika nikoli', async () => {
    const { app } = await createApp();
    const { a, b } = await loginTwo(app);
    const list = await seedList({ ownerId: a.userId, members: [{ userId: b.userId, role: 'view' }] });

    const zaB = await request(app).get(`/api/v1/todos/lists/${list._id}`).set(AUTH(b.token));
    const zaA = await request(app).get(`/api/v1/todos/lists/${list._id}`).set(AUTH(a.token));

    expect(zaB.body.isNew).toBe(true);
    expect(zaA.body.isNew).toBe(false);
  });

  it('po klicu /seen oznaka izgine — in seznam se NE premakne na vrh izpisa', async () => {
    const { app } = await createApp();
    const { a, b } = await loginTwo(app);
    const stari = await seedList({ ownerId: a.userId, title: 'Deljen', members: [{ userId: b.userId, role: 'view' }] });
    await new Promise((r) => setTimeout(r, 10));
    await seedList({ ownerId: b.userId, title: 'Novejsi lastni' });

    const res = await request(app).post(`/api/v1/todos/lists/${stari._id}/seen`).set(AUTH(b.token)).send({});
    expect(res.status).toBe(200);
    expect(res.body.isNew).toBe(false);

    // Ključno: ogled ni sprememba. Brez `timestamps: false` bi odprtje seznama poskočilo na
    // vrh vsem soudeležencem in preklopilo ploščico.
    const izpis = await request(app).get('/api/v1/todos/lists').set(AUTH(b.token));
    expect(izpis.body.lists.map((l: { title: string }) => l.title)).toEqual(['Novejsi lastni', 'Deljen']);
  });

  it('/seen za lastnika je no-op in ne vrne napake', async () => {
    const { app } = await createApp();
    const a = await loginAs(app, 'a');
    const list = await seedList({ ownerId: a.userId });

    const res = await request(app).post(`/api/v1/todos/lists/${list._id}/seen`).set(AUTH(a.token)).send({});
    expect(res.status).toBe(200);
    expect(res.body.isNew).toBe(false);
  });
});

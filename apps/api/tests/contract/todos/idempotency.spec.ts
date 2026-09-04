import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createHash } from 'node:crypto';
import { createApp } from '../../../src/main.js';
import { clearTestDb, startTestDb, stopTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { AUTH, loginAs, loginTwo, seedList } from './_helpers.js';
import { ApiKeyModel } from '../../../src/platform/apikeys/model.js';
import { TodoListModel } from '../../../src/modules/todos/models/todo-list.model.js';
import { UserModel } from '../../../src/modules/auth/models/user.model.js';

// US7, FR-090 do FR-097. Člen III: avtomatizacija je prvorazreden odjemalec, ne posledica.
//
// Test za ponovljen DELETE bi pri odgovoru 204 PADEL — in prav zato obstaja: hramba
// idempotence zajame odgovor tako, da ovije `res.json`, odgovor brez telesa pa skoznjo ne gre
// in se nikoli ne zabeleži (plan.md, Complexity Tracking U2).

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(clearTestDb);

const KEY = 'test-todos-api-key';

async function seedApiKey(scopes: string[]) {
  await ApiKeyModel.create({
    label: 'n8n',
    keyHash: createHash('sha256').update(KEY).digest('hex'),
    keyPrefix: KEY.slice(0, 8),
    scopes,
  });
}

describe('Idempotency-Key (FR-093, FR-094)', () => {
  it('ponovljen POST …/tasks z istim ključem NE ustvari dvojnika', async () => {
    const { app } = await createApp();
    const a = await loginAs(app, 'a');
    const list = await seedList({ ownerId: a.userId });
    const url = `/api/v1/todos/lists/${list._id}/tasks`;

    const prvi = await request(app)
      .post(url)
      .set(AUTH(a.token))
      .set('Idempotency-Key', 'kljuc-1')
      .send({ titles: ['Mleko'] });

    const drugi = await request(app)
      .post(url)
      .set(AUTH(a.token))
      .set('Idempotency-Key', 'kljuc-1')
      .send({ titles: ['Mleko'] });

    expect(prvi.status).toBe(201);
    expect(drugi.status).toBe(201);
    expect(drugi.body.tasks).toHaveLength(1);

    // Trajno stanje, ne samo odgovor.
    const doc = await TodoListModel.findById(list._id).lean();
    expect(doc?.tasks).toHaveLength(1);
  });

  it('BREZ ključa je ponovljen klic navadna druga zahteva in doda drugo opravilo', async () => {
    // Brez tega bi bil zgornji test lahko zelen tudi, če bi endpoint podvajanje preprečeval
    // iz kakega drugega razloga.
    const { app } = await createApp();
    const a = await loginAs(app, 'a');
    const list = await seedList({ ownerId: a.userId });
    const url = `/api/v1/todos/lists/${list._id}/tasks`;

    await request(app).post(url).set(AUTH(a.token)).send({ titles: ['Mleko'] });
    const drugi = await request(app).post(url).set(AUTH(a.token)).send({ titles: ['Mleko'] });

    expect(drugi.body.tasks).toHaveLength(2);
  });

  it('isti ključ z DRUGAČNIM telesom je 422 — ključ je obljuba, da gre za isto zahtevo', async () => {
    const { app } = await createApp();
    const a = await loginAs(app, 'a');
    const list = await seedList({ ownerId: a.userId });
    const url = `/api/v1/todos/lists/${list._id}/tasks`;

    await request(app).post(url).set(AUTH(a.token)).set('Idempotency-Key', 'k').send({ titles: ['Mleko'] });
    const drugi = await request(app)
      .post(url)
      .set(AUTH(a.token))
      .set('Idempotency-Key', 'k')
      .send({ titles: ['Kruh'] });

    expect(drugi.status).toBe(422);
  });

  it('ponovljen DELETE …/tasks/:taskId z istim ključem vrne PRVOTNI 200, ne 404', async () => {
    const { app } = await createApp();
    const a = await loginAs(app, 'a');
    const list = await seedList({ ownerId: a.userId, tasks: [{ title: 'Mleko' }] });
    const url = `/api/v1/todos/lists/${list._id}/tasks/${String(list.tasks[0]?._id)}`;

    const prvi = await request(app).delete(url).set(AUTH(a.token)).set('Idempotency-Key', 'del-1');
    const drugi = await request(app).delete(url).set(AUTH(a.token)).set('Idempotency-Key', 'del-1');

    expect(prvi.status).toBe(200);
    // Pri 204 bi bil ta izid 404: odgovor brez telesa se v hrambo idempotence ne zabeleži.
    expect(drugi.status).toBe(200);
    expect(drugi.body.deleted).toBe(true);
  });

  it('ponovljen DELETE seznama z istim ključem prav tako vrne prvotni 200', async () => {
    const { app } = await createApp();
    const a = await loginAs(app, 'a');
    const list = await seedList({ ownerId: a.userId });
    const url = `/api/v1/todos/lists/${list._id}`;

    const prvi = await request(app).delete(url).set(AUTH(a.token)).set('Idempotency-Key', 'del-2');
    const drugi = await request(app).delete(url).set(AUTH(a.token)).set('Idempotency-Key', 'del-2');

    expect(prvi.status).toBe(200);
    expect(drugi.status).toBe(200);
    expect(drugi.body).toEqual({ deleted: true });
  });

  it('ponovljen PUT …/order z istim ključem ne premakne opravila drugič (FR-095)', async () => {
    const { app } = await createApp();
    const a = await loginAs(app, 'a');
    const list = await seedList({ ownerId: a.userId, tasks: [{ title: 'A' }, { title: 'B' }] });
    const ids = list.tasks.map((t) => String(t._id));
    const url = `/api/v1/todos/lists/${list._id}/order`;

    const prvi = await request(app)
      .put(url)
      .set(AUTH(a.token))
      .set('Idempotency-Key', 'ord-1')
      .send({ taskIds: [ids[1], ids[0]] });
    const drugi = await request(app)
      .put(url)
      .set(AUTH(a.token))
      .set('Idempotency-Key', 'ord-1')
      .send({ taskIds: [ids[1], ids[0]] });

    expect(prvi.body.tasks.map((t: { title: string }) => t.title)).toEqual(['B', 'A']);
    expect(drugi.body.tasks.map((t: { title: string }) => t.title)).toEqual(['B', 'A']);
  });
});

describe('Avtomatizacija z API ključem (FR-091, FR-096)', () => {
  it('ključ s todos:write doda opravilo, ki se pojavi v vmesniku', async () => {
    const { app } = await createApp();
    const a = await loginAs(app, 'a');
    await seedApiKey(['todos:read', 'todos:write']);
    const list = await seedList({ ownerId: a.userId });

    const res = await request(app)
      .post(`/api/v1/todos/lists/${list._id}/tasks`)
      .set('X-API-Key', KEY)
      .send({ titles: ['Iz n8n'] });

    expect(res.status).toBe(201);

    // Isto opravilo vidi tudi prijavljen uporabnik — avtomatizacija ni ločen svet.
    const vUmesniku = await request(app).get(`/api/v1/todos/lists/${list._id}`).set(AUTH(a.token));
    expect(vUmesniku.body.tasks.map((t: { title: string }) => t.title)).toContain('Iz n8n');
  });

  it('ključ BREZ todos:share ne more seznama podariti, čeprav sme dodajati (FR-091)', async () => {
    const { app } = await createApp();
    const { a, b } = await loginTwo(app);
    // Z DVEMA uporabnikoma in brez prevzetih podedovanih podatkov API ključ ne more
    // ugotoviti, v čigavem imenu deluje (platform/auth/automation-owner.ts) — vsaka zahteva
    // bi bila 404. To je obstoječe vedenje platforme, ne posebnost tega modula.
    await UserModel.updateOne({ _id: a.userId }, { $set: { migratedLegacyDataAt: new Date() } });
    await seedApiKey(['todos:read', 'todos:write']);
    const list = await seedList({ ownerId: a.userId });

    // Sme pisati …
    expect(
      (await request(app).post(`/api/v1/todos/lists/${list._id}/tasks`).set('X-API-Key', KEY).send({ titles: ['X'] }))
        .status,
    ).toBe(201);

    // … a ne deliti. To je edini razlog, da je `todos:share` ločen obseg.
    const deljenje = await request(app)
      .put(`/api/v1/todos/lists/${list._id}/members/${b.userId}`)
      .set('X-API-Key', KEY)
      .send({ role: 'edit' });

    expect(deljenje.status).toBe(403);
  });

  it('ključ s todos:share sme deliti', async () => {
    const { app } = await createApp();
    const { a, b } = await loginTwo(app);
    // Z DVEMA uporabnikoma in brez prevzetih podedovanih podatkov API ključ ne more
    // ugotoviti, v čigavem imenu deluje (platform/auth/automation-owner.ts) — vsaka zahteva
    // bi bila 404. To je obstoječe vedenje platforme, ne posebnost tega modula.
    await UserModel.updateOne({ _id: a.userId }, { $set: { migratedLegacyDataAt: new Date() } });
    await seedApiKey(['todos:read', 'todos:write', 'todos:share']);
    const list = await seedList({ ownerId: a.userId });

    const res = await request(app)
      .put(`/api/v1/todos/lists/${list._id}/members/${b.userId}`)
      .set('X-API-Key', KEY)
      .send({ role: 'edit' });

    expect(res.status).toBe(201);
  });

  it('ključ ne obide lastništva: tuj seznam je zanj 404', async () => {
    const { app } = await createApp();
    const { a, b } = await loginTwo(app);
    // Z DVEMA uporabnikoma in brez prevzetih podedovanih podatkov API ključ ne more
    // ugotoviti, v čigavem imenu deluje (platform/auth/automation-owner.ts) — vsaka zahteva
    // bi bila 404. To je obstoječe vedenje platforme, ne posebnost tega modula.
    await UserModel.updateOne({ _id: a.userId }, { $set: { migratedLegacyDataAt: new Date() } });
    await seedApiKey(['todos:read', 'todos:write']);

    // Ključ deluje v imenu ENEGA uporabnika (resolveAutomationOwnerUserId). Z dvema
    // uporabnikoma in brez prevzema podedovanih podatkov ta ne more biti nedvoumen.
    await UserModel.updateOne({ _id: a.userId }, { $set: { migratedLegacyDataAt: new Date() } });
    const tuj = await seedList({ ownerId: b.userId, title: 'B-jev' });

    const res = await request(app).get(`/api/v1/todos/lists/${tuj._id}`).set('X-API-Key', KEY);
    expect(res.status).toBe(404);
  });

  it('ključ brez obsegov modula dobi 403', async () => {
    const { app } = await createApp();
    const a = await loginAs(app, 'a');
    await seedApiKey(['dashboard:read']);
    const list = await seedList({ ownerId: a.userId });

    const res = await request(app).get(`/api/v1/todos/lists/${list._id}`).set('X-API-Key', KEY);
    expect(res.status).toBe(403);
  });
});

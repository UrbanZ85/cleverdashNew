import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/main.js';
import { startTestDb, stopTestDb, clearTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { SavedLinkModel } from '../../../src/modules/saved-links/models/saved-link.model.js';
import { loginAndUnlock, loginTwo, seedGroupFixture, seedLinkFixture } from './_helpers.js';

// Pogodbeni testi map (008, US3) proti specs/008-saved-links/contracts/openapi.yaml.
//
// Najpomembnejši test v tej datoteki je zadnji: brisanje NEPRAZNE mape. SC-006 pravi, da se
// ob tem ne izgubi noben zapis, in to je edino mesto, kjer se to res preveri.

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(clearTestDb);

describe('POST /saved-link-groups', () => {
  it('ustvari mapo in vrne 201', async () => {
    const { app } = await createApp();
    const { token } = await loginAndUnlock(app);

    const res = await request(app)
      .post('/api/v1/saved-link-groups')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Delo' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Delo', order: 0, collapsed: false, linkCount: 0 });
    expect(res.body.id).toBeTruthy();
  });

  it('podvojeno ime vrne 400 s povedanim razlogom', async () => {
    const { app } = await createApp();
    const { token } = await loginAndUnlock(app);
    await request(app)
      .post('/api/v1/saved-link-groups')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Delo' });

    const res = await request(app)
      .post('/api/v1/saved-link-groups')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Delo' });

    expect(res.status).toBe(400);
    expect(res.body.detail).toContain('že obstaja');
  });

  it('dva različna uporabnika smeta imeti mapo z istim imenom (vzorec 004)', async () => {
    const { app } = await createApp();
    const { a, b } = await loginTwo(app);

    const first = await request(app)
      .post('/api/v1/saved-link-groups')
      .set('Authorization', `Bearer ${a.token}`)
      .send({ name: 'Delo' });
    const second = await request(app)
      .post('/api/v1/saved-link-groups')
      .set('Authorization', `Bearer ${b.token}`)
      .send({ name: 'Delo' });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
  });

  it('prazno ime vrne 400', async () => {
    const { app } = await createApp();
    const { token } = await loginAndUnlock(app);

    const res = await request(app)
      .post('/api/v1/saved-link-groups')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '   ' });

    expect(res.status).toBe(400);
  });
});

describe('GET /saved-link-groups', () => {
  it('vrne mape po vrstnem redu, s številom zapisov v vsaki', async () => {
    const { app } = await createApp();
    const { token, userId } = await loginAndUnlock(app);
    const delo = await seedGroupFixture(userId, { name: 'Delo', order: 1 });
    await seedGroupFixture(userId, { name: 'Recepti', order: 0 });
    await seedLinkFixture(userId, { groupId: delo._id });
    await seedLinkFixture(userId, { groupId: delo._id, url: 'https://primer.si/2' });
    await seedLinkFixture(userId);

    const res = await request(app)
      .get('/api/v1/saved-link-groups')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.groups.map((g: { name: string }) => g.name)).toEqual(['Recepti', 'Delo']);
    // Nerazvrščeni zapis se ne šteje v nobeno mapo.
    expect(res.body.groups.find((g: { name: string }) => g.name === 'Delo').linkCount).toBe(2);
    expect(res.body.groups.find((g: { name: string }) => g.name === 'Recepti').linkCount).toBe(0);
  });

  it('tuje mape ne vrne', async () => {
    const { app } = await createApp();
    const { a, b } = await loginTwo(app);
    await seedGroupFixture(b.userId, { name: 'Tuja' });

    const res = await request(app)
      .get('/api/v1/saved-link-groups')
      .set('Authorization', `Bearer ${a.token}`);

    expect(res.body.groups).toEqual([]);
  });
});

describe('PATCH /saved-link-groups/{groupId}', () => {
  it('preimenuje mapo', async () => {
    const { app } = await createApp();
    const { token, userId } = await loginAndUnlock(app);
    const group = await seedGroupFixture(userId, { name: 'Delo' });

    const res = await request(app)
      .patch(`/api/v1/saved-link-groups/${group._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Služba' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Služba');
  });

  it('zloži in razpre mapo — zloženo stanje se shrani (US3, scenarij 2)', async () => {
    const { app } = await createApp();
    const { token, userId } = await loginAndUnlock(app);
    const group = await seedGroupFixture(userId);

    const collapsed = await request(app)
      .patch(`/api/v1/saved-link-groups/${group._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ collapsed: true });
    expect(collapsed.body.collapsed).toBe(true);

    // Stanje res preživi — preberemo ga nazaj s seznama, ne iz odgovora na PATCH.
    const list = await request(app)
      .get('/api/v1/saved-link-groups')
      .set('Authorization', `Bearer ${token}`);
    expect(list.body.groups[0].collapsed).toBe(true);

    // `collapsed: false` je pomenska vrednost in ne "ne spreminjaj".
    const expanded = await request(app)
      .patch(`/api/v1/saved-link-groups/${group._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ collapsed: false });
    expect(expanded.body.collapsed).toBe(false);
  });

  it('preimenovanje na zasedeno ime vrne 400', async () => {
    const { app } = await createApp();
    const { token, userId } = await loginAndUnlock(app);
    await seedGroupFixture(userId, { name: 'Delo', order: 0 });
    const other = await seedGroupFixture(userId, { name: 'Recepti', order: 1 });

    const res = await request(app)
      .patch(`/api/v1/saved-link-groups/${other._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Delo' });

    expect(res.status).toBe(400);
  });

  it('tuja mapa vrne 404, ne 403 (FR-006)', async () => {
    const { app } = await createApp();
    const { a, b } = await loginTwo(app);
    const foreign = await seedGroupFixture(b.userId, { name: 'Tuja' });

    const res = await request(app)
      .patch(`/api/v1/saved-link-groups/${foreign._id}`)
      .set('Authorization', `Bearer ${a.token}`)
      .send({ name: 'Moja' });

    expect(res.status).toBe(404);
  });
});

describe('DELETE /saved-link-groups/{groupId}', () => {
  it('brisanje NEPRAZNE mape vrne movedLinks in ohrani vse zapise (FR-022, SC-006)', async () => {
    const { app } = await createApp();
    const { token, userId } = await loginAndUnlock(app);
    const group = await seedGroupFixture(userId, { name: 'Delo' });
    for (const n of [1, 2, 3]) {
      await seedLinkFixture(userId, { groupId: group._id, url: `https://primer.si/${n}`, title: `z${n}` });
    }

    const res = await request(app)
      .delete(`/api/v1/saved-link-groups/${group._id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ movedLinks: 3 });

    // Vsi trije zapisi še obstajajo in so zdaj NERAZVRŠČENI, ne izbrisani.
    const list = await request(app).get('/api/v1/saved-links').set('Authorization', `Bearer ${token}`);
    expect(list.body.links).toHaveLength(3);
    expect(list.body.links.every((l: { groupId: string | null }) => l.groupId === null)).toBe(true);

    // In v bazi ni nobenega zapisa, ki bi kazal na izbrisano mapo.
    expect(await SavedLinkModel.countDocuments({ groupId: group._id })).toBe(0);
  });

  it('brisanje prazne mape vrne movedLinks: 0', async () => {
    const { app } = await createApp();
    const { token, userId } = await loginAndUnlock(app);
    const group = await seedGroupFixture(userId);

    const res = await request(app)
      .delete(`/api/v1/saved-link-groups/${group._id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.movedLinks).toBe(0);
  });

  it('brisanje mape NE premakne zapisov drugih map', async () => {
    const { app } = await createApp();
    const { token, userId } = await loginAndUnlock(app);
    const deleted = await seedGroupFixture(userId, { name: 'Za brisanje', order: 0 });
    const kept = await seedGroupFixture(userId, { name: 'Ostane', order: 1 });
    await seedLinkFixture(userId, { groupId: deleted._id, url: 'https://primer.si/1' });
    await seedLinkFixture(userId, { groupId: kept._id, url: 'https://primer.si/2' });

    await request(app)
      .delete(`/api/v1/saved-link-groups/${deleted._id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(await SavedLinkModel.countDocuments({ groupId: kept._id })).toBe(1);
  });

  it('tuja mapa vrne 404 in se ne izbriše', async () => {
    const { app } = await createApp();
    const { a, b } = await loginTwo(app);
    const foreign = await seedGroupFixture(b.userId, { name: 'Tuja' });

    const res = await request(app)
      .delete(`/api/v1/saved-link-groups/${foreign._id}`)
      .set('Authorization', `Bearer ${a.token}`);

    expect(res.status).toBe(404);
    const list = await request(app)
      .get('/api/v1/saved-link-groups')
      .set('Authorization', `Bearer ${b.token}`);
    expect(list.body.groups).toHaveLength(1);
  });
});

describe('PUT /saved-link-groups/order', () => {
  it('postavi vrstni red map', async () => {
    const { app } = await createApp();
    const { token, userId } = await loginAndUnlock(app);
    const a = await seedGroupFixture(userId, { name: 'A', order: 0 });
    const b = await seedGroupFixture(userId, { name: 'B', order: 1 });
    const c = await seedGroupFixture(userId, { name: 'C', order: 2 });

    const res = await request(app)
      .put('/api/v1/saved-link-groups/order')
      .set('Authorization', `Bearer ${token}`)
      .send({ groupIds: [String(c._id), String(a._id), String(b._id)] });

    expect(res.status).toBe(204);
    const list = await request(app)
      .get('/api/v1/saved-link-groups')
      .set('Authorization', `Bearer ${token}`);
    expect(list.body.groups.map((g: { name: string }) => g.name)).toEqual(['C', 'A', 'B']);
  });

  it('tuja mapa v seznamu vrne 400 in ničesar ne premakne', async () => {
    const { app } = await createApp();
    const { a, b } = await loginTwo(app);
    const mine = await seedGroupFixture(a.userId, { name: 'Moja' });
    const foreign = await seedGroupFixture(b.userId, { name: 'Tuja' });

    const res = await request(app)
      .put('/api/v1/saved-link-groups/order')
      .set('Authorization', `Bearer ${a.token}`)
      .send({ groupIds: [String(foreign._id), String(mine._id)] });

    expect(res.status).toBe(400);
  });
});

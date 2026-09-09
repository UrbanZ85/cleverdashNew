import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/main.js';
import { startTestDb, stopTestDb, clearTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { loginAndUnlock, loginTwo, seedGroupFixture, seedLinkFixture } from './_helpers.js';

// Pogodbeni testi `PUT /saved-links/order` (008, US3, FR-032).
//
// Bistvo endpointa je, da je prerazporeditev ENA operacija s celotnim seznamom in da zapisi
// ZUNAJ seznama ostanejo nedotaknjeni — sicer bi prerazporeditev ene mape premešala druge.

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(clearTestDb);

function titlesOf(body: { links: { title: string }[] }): string[] {
  return body.links.map((l) => l.title);
}

describe('PUT /saved-links/order', () => {
  it('postavi vrstni red nerazvrščenih zapisov', async () => {
    const { app } = await createApp();
    const { token, userId } = await loginAndUnlock(app);
    const a = await seedLinkFixture(userId, { title: 'A', url: 'https://primer.si/a', order: 0 });
    const b = await seedLinkFixture(userId, { title: 'B', url: 'https://primer.si/b', order: 1 });
    const c = await seedLinkFixture(userId, { title: 'C', url: 'https://primer.si/c', order: 2 });

    const res = await request(app)
      .put('/api/v1/saved-links/order')
      .set('Authorization', `Bearer ${token}`)
      .send({ groupId: null, linkIds: [String(c._id), String(a._id), String(b._id)] });

    expect(res.status).toBe(204);
    const list = await request(app).get('/api/v1/saved-links').set('Authorization', `Bearer ${token}`);
    expect(titlesOf(list.body)).toEqual(['C', 'A', 'B']);
  });

  it('vrstni red preživi ponovno branje (US3, scenarij 4)', async () => {
    const { app } = await createApp();
    const { token, userId } = await loginAndUnlock(app);
    const a = await seedLinkFixture(userId, { title: 'A', url: 'https://primer.si/a', order: 0 });
    const b = await seedLinkFixture(userId, { title: 'B', url: 'https://primer.si/b', order: 1 });

    await request(app)
      .put('/api/v1/saved-links/order')
      .set('Authorization', `Bearer ${token}`)
      .send({ groupId: null, linkIds: [String(b._id), String(a._id)] });

    const first = await request(app).get('/api/v1/saved-links').set('Authorization', `Bearer ${token}`);
    const second = await request(app).get('/api/v1/saved-links').set('Authorization', `Bearer ${token}`);
    expect(titlesOf(first.body)).toEqual(['B', 'A']);
    expect(titlesOf(second.body)).toEqual(['B', 'A']);
  });

  it('zapisi ZUNAJ seznama ostanejo nedotaknjeni — druga mapa se ne premeša', async () => {
    const { app } = await createApp();
    const { token, userId } = await loginAndUnlock(app);
    const group = await seedGroupFixture(userId, { name: 'Delo' });
    const g1 = await seedLinkFixture(userId, {
      title: 'G1',
      url: 'https://primer.si/g1',
      groupId: group._id,
      order: 0,
    });
    const g2 = await seedLinkFixture(userId, {
      title: 'G2',
      url: 'https://primer.si/g2',
      groupId: group._id,
      order: 1,
    });
    await seedLinkFixture(userId, { title: 'N1', url: 'https://primer.si/n1', order: 0 });
    await seedLinkFixture(userId, { title: 'N2', url: 'https://primer.si/n2', order: 1 });

    await request(app)
      .put('/api/v1/saved-links/order')
      .set('Authorization', `Bearer ${token}`)
      .send({ groupId: String(group._id), linkIds: [String(g2._id), String(g1._id)] });

    const inGroup = await request(app)
      .get(`/api/v1/saved-links?groupId=${group._id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(titlesOf(inGroup.body)).toEqual(['G2', 'G1']);

    // Nerazvrščeni so ostali v svojem vrstnem redu.
    const ungrouped = await request(app)
      .get('/api/v1/saved-links?groupId=none')
      .set('Authorization', `Bearer ${token}`);
    expect(titlesOf(ungrouped.body)).toEqual(['N1', 'N2']);
  });

  it('ID iz DRUGE mape v telesu vrne 400', async () => {
    const { app } = await createApp();
    const { token, userId } = await loginAndUnlock(app);
    const group = await seedGroupFixture(userId, { name: 'Delo' });
    const inGroup = await seedLinkFixture(userId, {
      title: 'G',
      url: 'https://primer.si/g',
      groupId: group._id,
    });
    const ungrouped = await seedLinkFixture(userId, { title: 'N', url: 'https://primer.si/n' });

    const res = await request(app)
      .put('/api/v1/saved-links/order')
      .set('Authorization', `Bearer ${token}`)
      .send({ groupId: String(group._id), linkIds: [String(inGroup._id), String(ungrouped._id)] });

    expect(res.status).toBe(400);
    expect(res.body.detail).toContain('mapi');
  });

  it('tuj zapis v telesu vrne 400 in ga ne premakne', async () => {
    const { app } = await createApp();
    const { a, b } = await loginTwo(app);
    const mine = await seedLinkFixture(a.userId, { title: 'Moj', url: 'https://primer.si/moj' });
    const foreign = await seedLinkFixture(b.userId, { title: 'Tuj', url: 'https://primer.si/tuj' });

    const res = await request(app)
      .put('/api/v1/saved-links/order')
      .set('Authorization', `Bearer ${a.token}`)
      .send({ groupId: null, linkIds: [String(foreign._id), String(mine._id)] });

    expect(res.status).toBe(400);
  });

  it('neveljaven ID vrne 400, ne 500', async () => {
    const { app } = await createApp();
    const { token } = await loginAndUnlock(app);

    const res = await request(app)
      .put('/api/v1/saved-links/order')
      .set('Authorization', `Bearer ${token}`)
      .send({ groupId: null, linkIds: ['ni-objectid'] });

    expect(res.status).toBe(400);
  });

  it('"order" se ne razume kot ID zapisa — pot je registrirana pred parametrično', async () => {
    const { app } = await createApp();
    const { token } = await loginAndUnlock(app);

    const res = await request(app)
      .put('/api/v1/saved-links/order')
      .set('Authorization', `Bearer ${token}`)
      .send({ groupId: null, linkIds: [] });

    // Prazen seznam je veljavna (če tudi ničesar ne spremeni) operacija, ne 404.
    expect(res.status).toBe(204);
  });
});

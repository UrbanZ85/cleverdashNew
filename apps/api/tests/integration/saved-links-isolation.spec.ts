import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/main.js';
import { startTestDb, stopTestDb, clearTestDb } from '../setup/mongo-memory.js';
import { setTestEnv } from '../setup/test-env.js';
import { SavedLinkModel } from '../../src/modules/saved-links/models/saved-link.model.js';
import { loginTwo, seedGroupFixture, seedLinkFixture } from '../contract/saved-links/_helpers.js';

// FR-006, po vzorcu izolacijskih testov iz 004: zapisi in mape so OSEBNI. Poizvedba tujega
// zapisa vrne 404 in NE 403 — obstoj tujega zapisa ni podatek, ki bi ga API smel razkriti.
//
// Ta datoteka je namenoma integracijska in ne pogodbena: preverja mejo med uporabniki na več
// poteh hkrati, kar je lastnost MODULA in ne posamezne poti.

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(clearTestDb);

describe('izolacija med uporabniki (FR-006)', () => {
  it('seznam drugega uporabnika je prazen, čeprav zapisi obstajajo', async () => {
    const { app } = await createApp();
    const { a, b } = await loginTwo(app);
    await seedLinkFixture(b.userId, { title: 'Tujčev zapis' });

    const res = await request(app).get('/api/v1/saved-links').set('Authorization', `Bearer ${a.token}`);

    expect(res.status).toBe(200);
    expect(res.body.links).toEqual([]);
  });

  it('tuj zapis vrne 404 na VSEH poteh, ki ga naslavljajo — nikoli 403', async () => {
    const { app } = await createApp();
    const { a, b } = await loginTwo(app);
    const foreign = await seedLinkFixture(b.userId, { faviconUrl: 'https://github.com/favicon.ico' });
    const id = String(foreign._id);
    const auth = { Authorization: `Bearer ${a.token}` };

    const responses = await Promise.all([
      request(app).get(`/api/v1/saved-links/${id}`).set(auth),
      request(app).patch(`/api/v1/saved-links/${id}`).set(auth).send({ title: 'Prevzeto' }),
      request(app).delete(`/api/v1/saved-links/${id}`).set(auth),
      request(app).post(`/api/v1/saved-links/${id}/refresh-metadata`).set(auth).send({}),
      request(app).get(`/api/v1/saved-links/${id}/favicon`).set(auth),
    ]);

    for (const res of responses) {
      expect(res.status).toBe(404);
    }
    // In zapis je nedotaknjen.
    expect(await SavedLinkModel.countDocuments({ userId: b.userId })).toBe(1);
  });

  it('tuja mapa vrne 404 na branju, urejanju in brisanju', async () => {
    const { app } = await createApp();
    const { a, b } = await loginTwo(app);
    const foreign = await seedGroupFixture(b.userId, { name: 'Tuja mapa' });
    const id = String(foreign._id);
    const auth = { Authorization: `Bearer ${a.token}` };

    const patched = await request(app)
      .patch(`/api/v1/saved-link-groups/${id}`)
      .set(auth)
      .send({ name: 'Moja' });
    const deleted = await request(app).delete(`/api/v1/saved-link-groups/${id}`).set(auth);
    // Zapis v tujo mapo ni mogoče niti ustvariti.
    const created = await request(app)
      .post('/api/v1/saved-links')
      .set(auth)
      .send({ url: 'https://primer.si/x', groupId: id });

    expect(patched.status).toBe(404);
    expect(deleted.status).toBe(404);
    expect(created.status).toBe(404);
  });

  it('iskanje ne prečka meje uporabnika', async () => {
    const { app } = await createApp();
    const { a, b } = await loginTwo(app);
    await seedLinkFixture(a.userId, { title: 'Moje vreme', url: 'https://arso.gov.si/a' });
    await seedLinkFixture(b.userId, { title: 'Tuje vreme', url: 'https://arso.gov.si/b' });

    const res = await request(app)
      .get('/api/v1/saved-links?q=vreme')
      .set('Authorization', `Bearer ${a.token}`);

    expect(res.body.links.map((l: { title: string }) => l.title)).toEqual(['Moje vreme']);
  });

  it('dva uporabnika smeta imeti mapo z ISTIM imenom (unikatnost je na uporabnika)', async () => {
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

    expect([first.status, second.status]).toEqual([201, 201]);
  });

  it('vrstni red se ne da postaviti čez mejo uporabnika', async () => {
    const { app } = await createApp();
    const { a, b } = await loginTwo(app);
    const foreign = await seedLinkFixture(b.userId, { order: 5 });

    const res = await request(app)
      .put('/api/v1/saved-links/order')
      .set('Authorization', `Bearer ${a.token}`)
      .send({ groupId: null, linkIds: [String(foreign._id)] });

    expect(res.status).toBe(400);
    // `order` tujega zapisa je nespremenjen.
    const after = await SavedLinkModel.findById(foreign._id).lean();
    expect(after?.order).toBe(5);
  });

  it('zapisi preživijo brisanje mape SVOJEGA lastnika in se ne pomešajo s tujimi', async () => {
    const { app } = await createApp();
    const { a, b } = await loginTwo(app);
    const groupA = await seedGroupFixture(a.userId, { name: 'Delo' });
    const groupB = await seedGroupFixture(b.userId, { name: 'Delo' });
    await seedLinkFixture(a.userId, { groupId: groupA._id, url: 'https://primer.si/a' });
    await seedLinkFixture(b.userId, { groupId: groupB._id, url: 'https://primer.si/b' });

    const res = await request(app)
      .delete(`/api/v1/saved-link-groups/${groupA._id}`)
      .set('Authorization', `Bearer ${a.token}`);

    expect(res.body.movedLinks).toBe(1);
    // Tujčev zapis je še vedno v SVOJI mapi — `updateMany` se ni razlezel čez `userId`.
    expect(await SavedLinkModel.countDocuments({ userId: b.userId, groupId: groupB._id })).toBe(1);
  });
});

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Types } from 'mongoose';
import { createApp } from '../../../src/main.js';
import { DashboardPluginModel } from '../../../src/modules/dashboard/models/dashboard-plugin.model.js';
import { startTestDb, stopTestDb, clearTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { fakeKeycloakForTests } from '../../setup/keycloak-global.js';
import { loginAsTestUser } from '../../setup/login-as-test-user.js';

// 005: uporabniško definirane ploščice ("vtičniki") — CRUD in varovala.

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(clearTestDb);

async function login(app: import('express').Express) {
  const { accessToken } = await loginAsTestUser(app, fakeKeycloakForTests, { roles: ['cleverdash-user'] });
  return accessToken;
}

const LINK_PLUGIN = {
  name: 'Intranet',
  kind: 'link',
  url: 'https://intranet.example.com/portal',
  icon: 'link-outline',
  description: 'Notranji portal',
};

describe('GET/POST /dashboard/plugins', () => {
  it('brez avtentikacije vrne 401', async () => {
    const { app } = await createApp();
    expect((await request(app).get('/api/v1/dashboard/plugins')).status).toBe(401);
  });

  it('nov uporabnik nima vtičnikov', async () => {
    const { app } = await createApp();
    const token = await login(app);
    const res = await request(app).get('/api/v1/dashboard/plugins').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.plugins).toEqual([]);
  });

  it('ustvari vtičnik vrste link in ga vrne v seznamu', async () => {
    const { app } = await createApp();
    const token = await login(app);

    const created = await request(app)
      .post('/api/v1/dashboard/plugins')
      .set('Authorization', `Bearer ${token}`)
      .send(LINK_PLUGIN);

    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: 'Intranet', kind: 'link', icon: 'link-outline' });
    expect(created.body.id).toBeTruthy();
    // Privzetki iz sheme so del pogodbe, ne skrita podrobnost.
    expect(created.body.openInNewTab).toBe(true);
    expect(created.body.refreshSeconds).toBe(300);
    expect(created.body.widthPx).toBe(320);

    const list = await request(app).get('/api/v1/dashboard/plugins').set('Authorization', `Bearer ${token}`);
    expect(list.body.plugins).toHaveLength(1);
    expect(list.body.plugins[0].id).toBe(created.body.id);
  });

  it('dvakrat isto ime vrne 400', async () => {
    const { app } = await createApp();
    const token = await login(app);
    await request(app).post('/api/v1/dashboard/plugins').set('Authorization', `Bearer ${token}`).send(LINK_PLUGIN);
    const second = await request(app)
      .post('/api/v1/dashboard/plugins')
      .set('Authorization', `Bearer ${token}`)
      .send(LINK_PLUGIN);
    expect(second.status).toBe(400);
  });

  it('neznana vrsta vrne 400', async () => {
    const { app } = await createApp();
    const token = await login(app);
    const res = await request(app)
      .post('/api/v1/dashboard/plugins')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...LINK_PLUGIN, kind: 'karkoli' });
    expect(res.status).toBe(400);
  });
});

describe('POST /dashboard/plugins — varovalo pred SSRF', () => {
  it.each([
    ['http://example.com/a', 'nešifrirano'],
    ['https://127.0.0.1/a', 'zanka'],
    ['https://192.168.1.10/status', 'zasebno omrežje'],
    ['https://169.254.169.254/latest/meta-data/', 'metapodatki v oblaku'],
    ['file:///etc/passwd', 'lokalna datoteka'],
  ])('zavrne %s (%s)', async (url) => {
    const { app } = await createApp();
    const token = await login(app);
    const res = await request(app)
      .post('/api/v1/dashboard/plugins')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...LINK_PLUGIN, url });
    expect(res.status).toBe(400);
  });
});

describe('POST /dashboard/plugins — vrsta json', () => {
  it('brez polj vrne 400 — ploščica ne bi imela česa prikazati', async () => {
    const { app } = await createApp();
    const token = await login(app);
    const res = await request(app)
      .post('/api/v1/dashboard/plugins')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Vir', kind: 'json', url: 'https://api.example.com/v1', fields: [] });
    expect(res.status).toBe(400);
  });

  it('neveljavna pot polja vrne 400', async () => {
    const { app } = await createApp();
    const token = await login(app);
    const res = await request(app)
      .post('/api/v1/dashboard/plugins')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Vir',
        kind: 'json',
        url: 'https://api.example.com/v1',
        fields: [{ label: 'X', path: '__proto__.x' }],
      });
    expect(res.status).toBe(400);
  });

  it('veljavna definicija se shrani s polji vred', async () => {
    const { app } = await createApp();
    const token = await login(app);
    const res = await request(app)
      .post('/api/v1/dashboard/plugins')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Vir',
        kind: 'json',
        url: 'https://api.example.com/v1',
        refreshSeconds: 600,
        fields: [{ label: 'Temperatura', path: 'observation.t', unit: '°C' }],
      });
    expect(res.status).toBe(201);
    expect(res.body.fields).toEqual([{ label: 'Temperatura', path: 'observation.t', unit: '°C' }]);
    expect(res.body.refreshSeconds).toBe(600);
  });

  it('prepogosto osveževanje (pod 30 s) vrne 400 — člen VIII', async () => {
    const { app } = await createApp();
    const token = await login(app);
    const res = await request(app)
      .post('/api/v1/dashboard/plugins')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Vir',
        kind: 'json',
        url: 'https://api.example.com/v1',
        refreshSeconds: 5,
        fields: [{ label: 'T', path: 'a' }],
      });
    expect(res.status).toBe(400);
  });
});

describe('POST /dashboard/plugins — širina ploščice (widthPx)', () => {
  it.each([200, 320, 480, 1600])('sprejme širino %i px', async (widthPx) => {
    const { app } = await createApp();
    const token = await login(app);
    const res = await request(app)
      .post('/api/v1/dashboard/plugins')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...LINK_PLUGIN, widthPx });
    expect(res.status).toBe(201);
    expect(res.body.widthPx).toBe(widthPx);
  });

  it.each([0, 199, 1601, -1])('zavrne širino %i px', async (widthPx) => {
    const { app } = await createApp();
    const token = await login(app);
    const res = await request(app)
      .post('/api/v1/dashboard/plugins')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...LINK_PLUGIN, widthPx });
    expect(res.status).toBe(400);
  });

  it('vrsta ploščice ne omejuje širine — velja za vse vrste', async () => {
    // Širina je lastnost PLOŠČICE, ne vrste vsebine: tudi kartica s povezavo je lahko
    // široka, če je uporabniku tako prav.
    const { app } = await createApp();
    const token = await login(app);
    const res = await request(app)
      .post('/api/v1/dashboard/plugins')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Širok JSON',
        kind: 'json',
        url: 'https://api.example.com/v1',
        widthPx: 960,
        fields: [{ label: 'T', path: 'a.b' }],
      });
    expect(res.status).toBe(201);
    expect(res.body.widthPx).toBe(960);
  });

  it('vtičnik izpred prehoda na slikovne točke dobi približek iz starih stolpcev', async () => {
    // Dokumenti, ustvarjeni prej, imajo `columnSpan` in nimajo `widthPx`. Pogodba mora
    // vseeno vrniti število v px, sicer bi taka ploščica ostala brez širine (glej
    // legacySpanToWidthPx v plugins.router.ts).
    const { app } = await createApp();
    const token = await login(app);
    const created = await request(app)
      .post('/api/v1/dashboard/plugins')
      .set('Authorization', `Bearer ${token}`)
      .send(LINK_PLUGIN);

    await DashboardPluginModel.collection.updateOne(
      { _id: new Types.ObjectId(String(created.body.id)) },
      { $unset: { widthPx: '' }, $set: { columnSpan: 2 } },
    );

    const list = await request(app).get('/api/v1/dashboard/plugins').set('Authorization', `Bearer ${token}`);
    expect(list.body.plugins[0].widthPx).toBe(656); // 2 × 320 px + 16 px razmika
  });
});

describe('PUT/DELETE /dashboard/plugins/:id', () => {
  it('posodobi vtičnik', async () => {
    const { app } = await createApp();
    const token = await login(app);
    const created = await request(app)
      .post('/api/v1/dashboard/plugins')
      .set('Authorization', `Bearer ${token}`)
      .send(LINK_PLUGIN);

    const updated = await request(app)
      .put(`/api/v1/dashboard/plugins/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ...LINK_PLUGIN, name: 'Intranet 2', openInNewTab: false });

    expect(updated.status).toBe(200);
    expect(updated.body.name).toBe('Intranet 2');
    expect(updated.body.openInNewTab).toBe(false);
  });

  it('izbriše vtičnik', async () => {
    const { app } = await createApp();
    const token = await login(app);
    const created = await request(app)
      .post('/api/v1/dashboard/plugins')
      .set('Authorization', `Bearer ${token}`)
      .send(LINK_PLUGIN);

    expect(
      (await request(app).delete(`/api/v1/dashboard/plugins/${created.body.id}`).set('Authorization', `Bearer ${token}`))
        .status,
    ).toBe(204);

    const list = await request(app).get('/api/v1/dashboard/plugins').set('Authorization', `Bearer ${token}`);
    expect(list.body.plugins).toEqual([]);
  });

  it('neobstoječ in neveljaven ID vrneta 404, ne 500', async () => {
    const { app } = await createApp();
    const token = await login(app);
    expect(
      (await request(app).get('/api/v1/dashboard/plugins/6a8e0000000000000000abcd').set('Authorization', `Bearer ${token}`))
        .status,
    ).toBe(404);
    expect(
      (await request(app).get('/api/v1/dashboard/plugins/ni-objectid').set('Authorization', `Bearer ${token}`)).status,
    ).toBe(404);
  });
});

describe('GET /dashboard/plugins/:id/data', () => {
  it('za vrsto link vrne 400 — te ploščice strežnik ne prenaša', async () => {
    const { app } = await createApp();
    const token = await login(app);
    const created = await request(app)
      .post('/api/v1/dashboard/plugins')
      .set('Authorization', `Bearer ${token}`)
      .send(LINK_PLUGIN);

    const res = await request(app)
      .get(`/api/v1/dashboard/plugins/${created.body.id}/data`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });
});

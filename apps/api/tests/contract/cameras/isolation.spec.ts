import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/main.js';
import { startTestDb, stopTestDb, clearTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { fakeKeycloakForTests } from '../../setup/keycloak-global.js';
import { loginAsTestUser } from '../../setup/login-as-test-user.js';
import { seedCameraFixture, seedCameraGroupFixture } from './_helpers.js';

// US2, SC-002: "popolnoma ločeni podatki na uporabnika" — seznama kamer/skupin dveh
// uporabnikov sta popolnoma izolirana, tudi za CRUD operacije na tujem zapisu (404, ne 200/403
// — glej router.ts `findCameraOr404`, ki NE razkrije obstoja tuje kamere).

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(clearTestDb);

describe('Izolacija kamer/skupin med uporabniki (SC-002)', () => {
  it('GET /cameras vrne samo kamere trenutnega uporabnika', async () => {
    const { app } = await createApp();
    const { accessToken: tokenA, userId: userIdA } = await loginAsTestUser(app, fakeKeycloakForTests, {
      sub: 'kc-sub-cam-user-a',
      email: 'cam-a@example.com',
      roles: ['cleverdash-user'],
    });
    const { accessToken: tokenB, userId: userIdB } = await loginAsTestUser(app, fakeKeycloakForTests, {
      sub: 'kc-sub-cam-user-b',
      email: 'cam-b@example.com',
      roles: ['cleverdash-user'],
    });

    await seedCameraFixture({ userId: userIdA, name: 'Kamera A1' });
    await seedCameraFixture({ userId: userIdA, name: 'Kamera A2', order: 1 });
    await seedCameraFixture({ userId: userIdB, name: 'Kamera B1' });

    const resA = await request(app).get('/api/v1/cameras').set('Authorization', `Bearer ${tokenA}`);
    expect(resA.body.cameras).toHaveLength(2);
    expect(resA.body.cameras.map((c: { name: string }) => c.name).sort()).toEqual(['Kamera A1', 'Kamera A2']);

    const resB = await request(app).get('/api/v1/cameras').set('Authorization', `Bearer ${tokenB}`);
    expect(resB.body.cameras).toHaveLength(1);
    expect(resB.body.cameras[0].name).toBe('Kamera B1');
  });

  it('PUT/DELETE na tujo kamero vrne 404, ne razkrije njenega obstoja', async () => {
    const { app } = await createApp();
    const { userId: userIdA } = await loginAsTestUser(app, fakeKeycloakForTests, {
      sub: 'kc-sub-cam-owner',
      email: 'cam-owner@example.com',
      roles: ['cleverdash-user'],
    });
    const { accessToken: tokenB } = await loginAsTestUser(app, fakeKeycloakForTests, {
      sub: 'kc-sub-cam-intruder',
      email: 'cam-intruder@example.com',
      roles: ['cleverdash-user'],
    });
    const camera = await seedCameraFixture({ userId: userIdA, name: 'Tuja kamera' });

    const putRes = await request(app)
      .put(`/api/v1/cameras/${camera._id}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ name: 'Prevzeto ime', type: 'iframe', previewUrl: 'https://www.youtube.com/embed/other' });
    expect(putRes.status).toBe(404);

    const deleteRes = await request(app)
      .delete(`/api/v1/cameras/${camera._id}`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(deleteRes.status).toBe(404);

    const stillThere = await request(app)
      .get('/api/v1/cameras')
      .set('Authorization', `Bearer ${tokenB}`);
    expect(stillThere.body.cameras).toHaveLength(0);
  });

  it('GET /camera-groups vrne samo skupine trenutnega uporabnika', async () => {
    const { app } = await createApp();
    const { accessToken: tokenA, userId: userIdA } = await loginAsTestUser(app, fakeKeycloakForTests, {
      sub: 'kc-sub-camgroup-user-a',
      email: 'camgroup-a@example.com',
      roles: ['cleverdash-user'],
    });
    const { accessToken: tokenB } = await loginAsTestUser(app, fakeKeycloakForTests, {
      sub: 'kc-sub-camgroup-user-b',
      email: 'camgroup-b@example.com',
      roles: ['cleverdash-user'],
    });

    await seedCameraGroupFixture({ userId: userIdA, name: 'Skupina A' });

    const resA = await request(app).get('/api/v1/camera-groups').set('Authorization', `Bearer ${tokenA}`);
    expect(resA.body.groups).toHaveLength(1);

    const resB = await request(app).get('/api/v1/camera-groups').set('Authorization', `Bearer ${tokenB}`);
    expect(resB.body.groups).toHaveLength(0);
  });
});

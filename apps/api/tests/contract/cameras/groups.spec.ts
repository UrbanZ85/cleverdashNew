import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/main.js';
import { startTestDb, stopTestDb, clearTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { loginAndUnlock, seedCameraFixture, seedCameraGroupFixture } from './_helpers.js';

// Pogodbeni test: PUT /cameras/order, POST /camera-groups, PUT /camera-groups/order
// (FR-035, FR-015).

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(clearTestDb);

describe('PUT /cameras/order pogodba', () => {
  it('preslika podan vrstni red v order: 0..n-1', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const a = await seedCameraFixture({ name: 'A', order: 0 });
    const b = await seedCameraFixture({ name: 'B', order: 1 });
    const c = await seedCameraFixture({ name: 'C', order: 2 });

    const res = await request(app)
      .put('/api/v1/cameras/order')
      .set('Authorization', `Bearer ${token}`)
      .send({ groupId: null, cameraIds: [String(c._id), String(a._id), String(b._id)] });

    expect(res.status).toBe(200);
    const byName = (n: string) => res.body.cameras.find((cam: { name: string }) => cam.name === n);
    expect(byName('C').order).toBe(0);
    expect(byName('A').order).toBe(1);
    expect(byName('B').order).toBe(2);
  });
});

describe('/camera-groups pogodba', () => {
  it('POST doda skupino z naraščajočim order', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const first = await request(app)
      .post('/api/v1/camera-groups')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Pot' });
    const second = await request(app)
      .post('/api/v1/camera-groups')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Morje' });

    expect(first.body.order).toBe(0);
    expect(second.body.order).toBe(1);
  });

  it('PUT /camera-groups/order preslika vrstni red skupin', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const pot = await seedCameraGroupFixture({ name: 'Pot', order: 0 });
    const morje = await seedCameraGroupFixture({ name: 'Morje', order: 1 });

    const res = await request(app)
      .put('/api/v1/camera-groups/order')
      .set('Authorization', `Bearer ${token}`)
      .send({ groupIds: [String(morje._id), String(pot._id)] });

    expect(res.status).toBe(200);
    expect(res.body.groups[0].name).toBe('Morje');
    expect(res.body.groups[0].order).toBe(0);
    expect(res.body.groups[1].name).toBe('Pot');
    expect(res.body.groups[1].order).toBe(1);
  });
});

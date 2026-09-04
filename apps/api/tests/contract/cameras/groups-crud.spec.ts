import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/main.js';
import { startTestDb, stopTestDb, clearTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { loginAndUnlock, seedCameraFixture, seedCameraGroupFixture } from './_helpers.js';

// Pogodbeni test: PUT/DELETE /camera-groups/{id} (FR-015, Story 4).

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(clearTestDb);

describe('PUT /camera-groups/{id} pogodba', () => {
  it('preimenuje skupino in spremeni collapsed', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const group = await seedCameraGroupFixture({ name: 'Pot' });

    const res = await request(app)
      .put(`/api/v1/camera-groups/${group._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Pot v službo', collapsed: true });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Pot v službo');
    expect(res.body.collapsed).toBe(true);
  });

  it('neobstoječa skupina vrne 404', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const res = await request(app)
      .put('/api/v1/camera-groups/000000000000000000000000')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'X' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /camera-groups/{id} pogodba', () => {
  it('brisanje skupine kamer NE izbriše, samo postavi groupId na null', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const group = await seedCameraGroupFixture({ name: 'Pot' });
    const camera = await seedCameraFixture({ groupId: group._id });

    const del = await request(app)
      .delete(`/api/v1/camera-groups/${group._id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(204);

    const cameraRes = await request(app).get(`/api/v1/cameras/${camera._id}`).set('Authorization', `Bearer ${token}`);
    expect(cameraRes.status).toBe(200);
    expect(cameraRes.body.groupId).toBeNull();
  });

  it('brisanje neobstoječe skupine vrne 404', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const res = await request(app)
      .delete('/api/v1/camera-groups/000000000000000000000000')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

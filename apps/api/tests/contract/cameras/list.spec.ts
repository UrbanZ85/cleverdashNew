import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/main.js';
import { startTestDb, stopTestDb, clearTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { loginAndUnlock, seedCameraFixture } from './_helpers.js';

// Pogodbeni test: GET /cameras (FR-030, FR-011).

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(clearTestDb);

describe('GET /cameras pogodba', () => {
  it('vrne vse kamere z izpeljanim zdravjem', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    await seedCameraFixture({ name: 'Kamera A' });
    await seedCameraFixture({ name: 'Kamera B', order: 1 });

    const res = await request(app).get('/api/v1/cameras').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.cameras).toHaveLength(2);
    expect(res.body.cameras[0]).toHaveProperty('health');
    expect(res.body.cameras[0]).toHaveProperty('hasCredentials', false);
    // Samostojen iframe (glej _helpers.ts) — zdravje ni preverljivo (research.md §3).
    expect(res.body.cameras[0].health.state).toBe('not-applicable');
  });

  it('vključi neaktivne kamere privzeto (FR-030 — zaslon za urejanje jih mora videti)', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    await seedCameraFixture({ name: 'Neaktivna', active: false });

    const res = await request(app).get('/api/v1/cameras').set('Authorization', `Bearer ${token}`);
    expect(res.body.cameras).toHaveLength(1);
  });

  it('includeInactive=false izloči neaktivne kamere (mreža, FR-010)', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    await seedCameraFixture({ name: 'Aktivna', active: true });
    await seedCameraFixture({ name: 'Neaktivna', active: false, order: 1 });

    const res = await request(app)
      .get('/api/v1/cameras?includeInactive=false')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.cameras).toHaveLength(1);
    expect(res.body.cameras[0].name).toBe('Aktivna');
  });

  it('brez avtentikacije vrne 401', async () => {
    const { app } = await createApp();
    const res = await request(app).get('/api/v1/cameras');
    expect(res.status).toBe(401);
  });

  it('nikoli ne vrne poverilnic, samo hasCredentials (FR-005)', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    await seedCameraFixture({
      type: 'snapshot',
      previewUrl: 'http://kamera.lan/a.jpg',
      credentialsEncrypted: 'x:y:z',
    });

    const res = await request(app).get('/api/v1/cameras').set('Authorization', `Bearer ${token}`);
    expect(res.body.cameras[0].hasCredentials).toBe(true);
    expect(res.body.cameras[0].credentials).toBeUndefined();
    expect(res.body.cameras[0].credentialsEncrypted).toBeUndefined();
  });
});

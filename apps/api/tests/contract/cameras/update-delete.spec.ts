import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/main.js';
import { startTestDb, stopTestDb, clearTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { loginAndUnlock, seedCameraFixture } from './_helpers.js';

// Pogodbeni test: GET/PUT/DELETE /cameras/{id} (FR-032, FR-033, Story 4).

beforeAll(async () => {
  setTestEnv({ CAMERA_ALLOWED_EMBED_HOSTS: 'youtube.com' });
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(clearTestDb);

describe('GET /cameras/{id} pogodba', () => {
  it('vrne eno kamero za predpolnjenje obrazca za urejanje', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const camera = await seedCameraFixture({ name: 'Ena' });

    const res = await request(app).get(`/api/v1/cameras/${camera._id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Ena');
  });

  it('neobstoječa kamera vrne 404', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const res = await request(app)
      .get('/api/v1/cameras/000000000000000000000000')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

describe('PUT /cameras/{id} pogodba', () => {
  it('posodobi ime in interval, sprememba je vidna pri naslednjem branju', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const camera = await seedCameraFixture({ name: 'Staro ime', refreshIntervalSeconds: 30 });

    const res = await request(app)
      .put(`/api/v1/cameras/${camera._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Novo ime', type: 'iframe', previewUrl: camera.previewUrl, refreshIntervalSeconds: 60 });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Novo ime');
    expect(res.body.refreshIntervalSeconds).toBe(60);
  });

  it('neveljaven naslov (422) NE spremeni obstoječih vrednosti (Story 4, scenarij 4)', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const camera = await seedCameraFixture({ name: 'Ohrani me' });

    const res = await request(app)
      .put(`/api/v1/cameras/${camera._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Poskus spremembe', type: 'iframe', previewUrl: 'https://evil.example.com/embed' });
    expect(res.status).toBe(422);

    const after = await request(app).get(`/api/v1/cameras/${camera._id}`).set('Authorization', `Bearer ${token}`);
    expect(after.body.name).toBe('Ohrani me');
  });

  it('odsotno polje credentials v telesu ohrani obstoječe poverilnice', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const camera = await seedCameraFixture({
      type: 'snapshot',
      previewUrl: 'http://kamera.lan/a.jpg',
      credentialsEncrypted: 'iv:tag:cipher',
    });

    const res = await request(app)
      .put(`/api/v1/cameras/${camera._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Preimenovana', type: 'snapshot', previewUrl: camera.previewUrl });
    expect(res.body.hasCredentials).toBe(true);
  });

  it('credentials: null v telesu izbriše poverilnice', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const camera = await seedCameraFixture({
      type: 'snapshot',
      previewUrl: 'http://kamera.lan/a.jpg',
      credentialsEncrypted: 'iv:tag:cipher',
    });

    const res = await request(app)
      .put(`/api/v1/cameras/${camera._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Brez gesla', type: 'snapshot', previewUrl: camera.previewUrl, credentials: null });
    expect(res.body.hasCredentials).toBe(false);
  });
});

describe('DELETE /cameras/{id} pogodba', () => {
  it('izbriše kamero, ki nato ni več v seznamu', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const camera = await seedCameraFixture();

    const del = await request(app).delete(`/api/v1/cameras/${camera._id}`).set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(204);

    const list = await request(app).get('/api/v1/cameras').set('Authorization', `Bearer ${token}`);
    expect(list.body.cameras).toHaveLength(0);
  });

  it('brisanje neobstoječe kamere vrne 404', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const res = await request(app)
      .delete('/api/v1/cameras/000000000000000000000000')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

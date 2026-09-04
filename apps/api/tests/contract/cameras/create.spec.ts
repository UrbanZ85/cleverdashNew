import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/main.js';
import { startTestDb, stopTestDb, clearTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { loginAndUnlock } from './_helpers.js';

// Pogodbeni test: POST /cameras (FR-031, FR-034, Story 3).

beforeAll(async () => {
  setTestEnv({ CAMERA_ALLOWED_EMBED_HOSTS: 'youtube.com' });
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(clearTestDb);

describe('POST /cameras pogodba', () => {
  it('doda kamero vrste iframe z dovoljenim gostiteljem', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);

    const res = await request(app)
      .post('/api/v1/cameras')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'YouTube Goli', type: 'iframe', previewUrl: 'https://www.youtube.com/embed/abc' });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.order).toBe(0);
    expect(res.body.active).toBe(true);
    expect(res.body.timeOfDay).toBe('always');
  });

  it('zavrne kamero z nedovoljenim gostiteljem (422, FR-034)', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);

    const res = await request(app)
      .post('/api/v1/cameras')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Sumljivo', type: 'iframe', previewUrl: 'https://evil.example.com/embed' });

    expect(res.status).toBe(422);
    expect(res.body.detail).toContain('evil.example.com');
  });

  it('zavrne neveljaven previewUrl (422)', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);

    const res = await request(app)
      .post('/api/v1/cameras')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Napačna', type: 'snapshot', previewUrl: 'ni-url' });

    expect(res.status).toBe(422);
  });

  it('poverilnice v telesu se ne vrnejo v odgovoru, samo hasCredentials (FR-005)', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);

    const res = await request(app)
      .post('/api/v1/cameras')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Zasebna',
        type: 'snapshot',
        previewUrl: 'http://kamera.lan/snap.jpg',
        credentials: { username: 'admin', password: 'geslo123' },
      });

    expect(res.status).toBe(201);
    expect(res.body.hasCredentials).toBe(true);
    expect(res.body.credentials).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('geslo123');
  });

  it('drugi ponovljen klic z istim Idempotency-Key ne ustvari druge kamere', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const payload = { name: 'Ipcamlive Planina', type: 'snapshot', previewUrl: 'https://g0.ipcamlive.com/player/snapshot.php?alias=x' };

    const first = await request(app)
      .post('/api/v1/cameras')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'test-key-1')
      .send(payload);
    const second = await request(app)
      .post('/api/v1/cameras')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', 'test-key-1')
      .send(payload);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.id).toBe(first.body.id);

    const list = await request(app).get('/api/v1/cameras').set('Authorization', `Bearer ${token}`);
    expect(list.body.cameras).toHaveLength(1);
  });

  it('brez obsega cameras:write (API ključ brez tega obsega) vrne 403', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const keyRes = await request(app)
      .post('/api/v1/api-keys')
      .set('Authorization', `Bearer ${token}`)
      .send({ label: 'Samo branje', scopes: ['cameras:read'] });

    const res = await request(app)
      .post('/api/v1/cameras')
      .set('X-API-Key', keyRes.body.secret)
      .send({ name: 'X', type: 'iframe', previewUrl: 'https://www.youtube.com/embed/x' });
    expect(res.status).toBe(403);
  });
});

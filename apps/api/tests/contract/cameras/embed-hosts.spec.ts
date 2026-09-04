import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/main.js';
import { startTestDb, stopTestDb, clearTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { loginAndUnlock } from './_helpers.js';

// Pogodbeni test: GET/POST /cameras/embed-hosts, DELETE /cameras/embed-hosts/{host}
// (research.md §6, analiza F2 edge case iz Story 3).

beforeAll(async () => {
  setTestEnv({ CAMERA_ALLOWED_EMBED_HOSTS: 'youtube.com,ipcamlive.com' });
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(clearTestDb);

describe('/cameras/embed-hosts pogodba', () => {
  it('GET vrne osnovni seznam brez uporabniških dodatkov', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const res = await request(app).get('/api/v1/cameras/embed-hosts').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.hosts).toEqual([
      { host: 'youtube.com', source: 'base' },
      { host: 'ipcamlive.com', source: 'base' },
    ]);
  });

  it('POST doda gostitelja, GET ga nato vključi z source: user', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const post = await request(app)
      .post('/api/v1/cameras/embed-hosts')
      .set('Authorization', `Bearer ${token}`)
      .send({ host: 'example.com', addedReason: 'Testna kamera' });
    expect(post.status).toBe(201);
    expect(post.body).toEqual({ host: 'example.com', source: 'user' });

    const list = await request(app).get('/api/v1/cameras/embed-hosts').set('Authorization', `Bearer ${token}`);
    expect(list.body.hosts).toContainEqual({ host: 'example.com', source: 'user', addedReason: 'Testna kamera' });
  });

  it('DELETE odstrani uporabniško dodanega gostitelja', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    await request(app)
      .post('/api/v1/cameras/embed-hosts')
      .set('Authorization', `Bearer ${token}`)
      .send({ host: 'example.com' });

    const del = await request(app)
      .delete('/api/v1/cameras/embed-hosts/example.com')
      .set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(204);

    const list = await request(app).get('/api/v1/cameras/embed-hosts').set('Authorization', `Bearer ${token}`);
    expect(list.body.hosts).not.toContainEqual(expect.objectContaining({ host: 'example.com' }));
  });

  it('DELETE osnovnega gostitelja zavrne (422) — sprememba okolja, ne podatka', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const res = await request(app)
      .delete('/api/v1/cameras/embed-hosts/youtube.com')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(422);
  });

  it('DELETE neobstoječega uporabniškega gostitelja vrne 404', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const res = await request(app)
      .delete('/api/v1/cameras/embed-hosts/ni-dodan.example.org')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

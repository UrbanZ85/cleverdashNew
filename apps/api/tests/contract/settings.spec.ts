import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/main.js';
import { startTestDb, stopTestDb, clearTestDb } from '../setup/mongo-memory.js';
import { setTestEnv } from '../setup/test-env.js';

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(clearTestDb);

async function loginAndUnlock(app: import('express').Express) {
  const login = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'admin@example.com', password: 'zacetno-geslo-12', platform: 'android' });
  await request(app)
    .post('/api/v1/auth/password')
    .set('Authorization', `Bearer ${login.body.accessToken}`)
    .send({ currentPassword: 'zacetno-geslo-12', newPassword: 'novo-mocno-geslo-123' });
  return login.body.accessToken as string;
}

describe('GET /settings', () => {
  it('vrne privzete nastavitve, ustvarjene ob prvem branju', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const res = await request(app).get('/api/v1/settings').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.weather.locationName).toBe('Ljubljana');
    expect(res.body.theme).toBe('system');
    expect(res.body.tiles).toEqual([]);
  });

  it('brez avtentikacije vrne 401', async () => {
    const { app } = await createApp();
    const res = await request(app).get('/api/v1/settings');
    expect(res.status).toBe(401);
  });
});

describe('PUT /settings', () => {
  it('delna posodobitev teme ne spremeni lokacije (FR-028)', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    await request(app).put('/api/v1/settings').set('Authorization', `Bearer ${token}`).send({ theme: 'dark' });

    const res = await request(app).get('/api/v1/settings').set('Authorization', `Bearer ${token}`);
    expect(res.body.theme).toBe('dark');
    expect(res.body.weather.locationName).toBe('Ljubljana'); // nedotaknjeno
  });

  it('posodobitev samo latitude ne pobriše že nastavljenega locationName', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    await request(app)
      .put('/api/v1/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ weather: { locationName: 'Maribor' } });
    await request(app)
      .put('/api/v1/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ weather: { latitude: 46.55 } });

    const res = await request(app).get('/api/v1/settings').set('Authorization', `Bearer ${token}`);
    expect(res.body.weather.locationName).toBe('Maribor');
    expect(res.body.weather.latitude).toBe(46.55);
  });

  it('razporeditev ploščic in vidnost se ohranita med "sejami" (novimi zahtevami)', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    await request(app)
      .put('/api/v1/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ tiles: [{ type: 'radar', position: 0, visible: true }, { type: 'weather', position: 1, visible: false }] });

    const res = await request(app).get('/api/v1/settings').set('Authorization', `Bearer ${token}`);
    expect(res.body.tiles).toEqual([
      { type: 'radar', position: 0, visible: true },
      { type: 'weather', position: 1, visible: false },
    ]);
  });

  it('prekritje samo enabled za en zavihek ohrani že nastavljen order drugega prekritja', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    await request(app)
      .put('/api/v1/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ tabs: { dashboard: { order: 5 } } });
    await request(app)
      .put('/api/v1/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ tabs: { dashboard: { enabled: false } } });

    const res = await request(app).get('/api/v1/settings').set('Authorization', `Bearer ${token}`);
    expect(res.body.tabs.dashboard).toEqual({ order: 5, enabled: false });
  });

  it('podvojen position v razporeditvi vrne 400', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const res = await request(app)
      .put('/api/v1/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ tiles: [{ type: 'weather', position: 0 }, { type: 'radar', position: 0 }] });
    expect(res.status).toBe(400);
  });
});

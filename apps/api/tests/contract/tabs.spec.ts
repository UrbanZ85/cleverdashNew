import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/main.js';
import { startTestDb, stopTestDb, clearTestDb } from '../setup/mongo-memory.js';
import { setTestEnv } from '../setup/test-env.js';
import { SettingsModel } from '../../src/modules/settings/model.js';

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

describe('GET /tabs', () => {
  it('vrne register, urejen po order', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const res = await request(app).get('/api/v1/tabs').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.find((t: { id: string }) => t.id === 'dashboard')).toBeTruthy();
    const orders = res.body.map((t: { order: number }) => t.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });

  it('izklopljen zavihek v nastavitvah se ne pojavi (FR-003)', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    await SettingsModel.findByIdAndUpdate(
      'singleton',
      { tabs: { dashboard: { enabled: false } } },
      { upsert: true },
    );
    const res = await request(app).get('/api/v1/tabs').set('Authorization', `Bearer ${token}`);
    expect(res.body.find((t: { id: string }) => t.id === 'dashboard')).toBeUndefined();
  });

  it('brez avtentikacije vrne 401', async () => {
    const { app } = await createApp();
    const res = await request(app).get('/api/v1/tabs');
    expect(res.status).toBe(401);
  });

  it('odgovor ne vsebuje internega polja "enabled"', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const res = await request(app).get('/api/v1/tabs').set('Authorization', `Bearer ${token}`);
    for (const tab of res.body) expect(tab).not.toHaveProperty('enabled');
  });
});

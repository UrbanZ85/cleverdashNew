import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/main.js';
import { startTestDb, stopTestDb, clearTestDb } from '../setup/mongo-memory.js';
import { setTestEnv } from '../setup/test-env.js';

// FR-017: vsaka naprava ima svojo družino sej; odjava na eni ne odjavi druge.
const CREDS = { email: 'admin@example.com', password: 'zacetno-geslo-12' };

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(clearTestDb);

describe('več naprav iste osebe', () => {
  it('odjava na telefonu ne odjavi brskalnika', async () => {
    const { app } = await createApp();

    const phone = await request(app)
      .post('/api/v1/auth/login')
      .send({ ...CREDS, platform: 'android', deviceLabel: 'Pixel 7' });
    const laptop = await request(app)
      .post('/api/v1/auth/login')
      .send({ ...CREDS, platform: 'android', deviceLabel: 'Chrome' });

    await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${phone.body.accessToken}`)
      .expect(204);

    // Laptop je izdan kot "android" platform samo zato, da dobimo refreshToken v telesu za
    // ta test brez ravnanja s piškotki — družina je ločena od telefona ne glede na to.
    const stillWorks = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: laptop.body.refreshToken });
    expect(stillWorks.status).toBe(200);
  });

  it('zloraba žetona ene naprave ne prekliče druge družine', async () => {
    const { app } = await createApp();
    const a = await request(app).post('/api/v1/auth/login').send({ ...CREDS, platform: 'android' });
    const b = await request(app).post('/api/v1/auth/login').send({ ...CREDS, platform: 'android' });

    const rotatedA = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: a.body.refreshToken });
    // Ponovna uporaba prvotnega A-žetona -> prekliče samo A.
    await request(app).post('/api/v1/auth/refresh').send({ refreshToken: a.body.refreshToken });

    const bStillWorks = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: b.body.refreshToken });
    expect(bStillWorks.status).toBe(200);

    const aNowBlocked = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: rotatedA.body.refreshToken });
    expect(aNowBlocked.status).toBe(401);
  });
});

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/main.js';
import { startTestDb, stopTestDb, clearTestDb } from '../setup/mongo-memory.js';
import { setTestEnv } from '../setup/test-env.js';

// FR-015: po 5 neuspelih poskusih v 15 minutah -> 429, sporočilo ne razkriva obstoja računa.
beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(clearTestDb);

describe('omejevanje hitrosti prijave', () => {
  it('šesti zaporedni neuspeli poskus vrne 429', async () => {
    const { app } = await createApp();
    const attempt = () =>
      request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'admin@example.com', password: 'napacno', platform: 'web' });

    for (let i = 0; i < 5; i++) {
      const res = await attempt();
      expect(res.status).toBe(401);
    }
    const sixth = await attempt();
    expect(sixth.status).toBe(429);
  });

  it('omejitev velja tudi za neobstoječ e-poštni naslov (brez razkritja obstoja)', async () => {
    const { app } = await createApp();
    const attempt = () =>
      request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'ne-obstaja@example.com', password: 'karkoli', platform: 'web' });

    let last;
    for (let i = 0; i < 6; i++) last = await attempt();
    expect(last?.status).toBe(429);
  });
});

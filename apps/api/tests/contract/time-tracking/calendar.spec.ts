import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/main.js';
import { startTestDb, stopTestDb, clearTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { loginAndUnlock, seedProfileFixture } from './_helpers.js';

// Pogodbeni test proti specs/002-time-tracking/contracts/openapi.yaml:
// GET/POST /time-tracking/holidays, GET /time-tracking/calendar.

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterEach(clearTestDb);
afterAll(stopTestDb);

describe('/time-tracking/holidays pogodba', () => {
  it('GET za novo leto samodejno napolni slovenske praznike (FR-011)', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);

    const res = await request(app)
      .get('/api/v1/time-tracking/holidays?year=2026')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(10);
    expect(res.body.some((h: { name: string }) => h.name === 'božič')).toBe(true);
  });

  it('POST ročno popravi praznik, source postane manual', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);

    const res = await request(app)
      .post('/api/v1/time-tracking/holidays')
      .set('Authorization', `Bearer ${token}`)
      .send({ date: '2026-01-01', name: 'Popravljeno ime', isWorkFree: true, isHoliday: true });

    expect(res.status).toBe(200);
    expect(res.body.source).toBe('manual');
    expect(res.body.name).toBe('Popravljeno ime');
  });
});

describe('/time-tracking/calendar pogodba', () => {
  it('vrne status in razlog za vsak dan v obdobju (FR-015)', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const { profile } = await seedProfileFixture({ profile: { daysOfWeek: [1, 2, 3, 4, 5] } });

    const res = await request(app)
      .get(`/api/v1/time-tracking/calendar?from=2026-08-17&to=2026-08-18&profileId=${profile._id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    const day17 = res.body.find((d: { localDate: string }) => d.localDate === '2026-08-17');
    // 17.8. je ponedeljek in praznik, ki NI dela prost (isWorkFree: false) -> workday
    expect(day17.status).toBe('workday');
  });

  it('brez from/to vrne 400', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);

    const res = await request(app).get('/api/v1/time-tracking/calendar').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });
});

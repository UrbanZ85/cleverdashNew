import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/main.js';
import { startTestDb, stopTestDb, clearTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { loginAndUnlock, seedProfileFixture } from './_helpers.js';
import { getClockPortal, resetClockPortalForTests } from '../../../src/modules/time-tracking/clock-portal/index.js';
import type { FakeClockPortal } from '../../../src/modules/time-tracking/clock-portal/fake-clock-portal.js';
import { loadEnv } from '../../../src/platform/config/env.js';
import { getLogger } from '../../../src/platform/logging/logger.js';
import { resetStateCacheForTests } from '../../../src/modules/time-tracking/services/state-cache.service.js';

// Pogodbeni test proti specs/002-time-tracking/contracts/openapi.yaml:
// GET /time-tracking/state, GET /time-tracking/available-actions.

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(() => {
  resetClockPortalForTests();
  resetStateCacheForTests();
  return clearTestDb();
});

describe('/time-tracking/state pogodba', () => {
  it('vrne stanje in razpoložljive akcije iz FakeClockPortal', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    await seedProfileFixture();

    const env = loadEnv();
    const portal = getClockPortal(env, getLogger(env)) as FakeClockPortal;
    portal.setAvailableActions(['Prijava na delo']);

    const res = await request(app)
      .get('/api/v1/time-tracking/state')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.state).toBe('OFF_DUTY');
    expect(res.body.availableActions).toEqual(['Prijava na delo']);
    expect(res.body.fromCache).toBe(false);
  });

  it('prazen nabor akcij vrne UNKNOWN, ne veljavno stanje (FR-022)', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    await seedProfileFixture();

    const env = loadEnv();
    const portal = getClockPortal(env, getLogger(env)) as FakeClockPortal;
    portal.setAvailableActions([]);

    const res = await request(app)
      .get('/api/v1/time-tracking/state')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.state).toBe('UNKNOWN');
  });

  it('drugi klic znotraj cacheSeconds vrne fromCache: true', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    await seedProfileFixture();

    const env = loadEnv();
    const portal = getClockPortal(env, getLogger(env)) as FakeClockPortal;
    portal.setAvailableActions(['Prijava na delo']);

    await request(app).get('/api/v1/time-tracking/state').set('Authorization', `Bearer ${token}`);
    const second = await request(app)
      .get('/api/v1/time-tracking/state')
      .set('Authorization', `Bearer ${token}`);

    expect(second.body.fromCache).toBe(true);
  });

  it('refresh=true obide predpomnilnik', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    await seedProfileFixture();

    const env = loadEnv();
    const portal = getClockPortal(env, getLogger(env)) as FakeClockPortal;
    portal.setAvailableActions(['Prijava na delo']);

    await request(app).get('/api/v1/time-tracking/state').set('Authorization', `Bearer ${token}`);
    const refreshed = await request(app)
      .get('/api/v1/time-tracking/state?refresh=true')
      .set('Authorization', `Bearer ${token}`);

    expect(refreshed.body.fromCache).toBe(false);
  });

  it('brez avtentikacije je zahteva zavrnjena', async () => {
    const { app } = await createApp();
    const res = await request(app).get('/api/v1/time-tracking/state');
    expect(res.status).toBe(401);
  });
});

describe('/time-tracking/available-actions pogodba', () => {
  it('vrne samo imena akcij in readAt', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    await seedProfileFixture();

    const env = loadEnv();
    const portal = getClockPortal(env, getLogger(env)) as FakeClockPortal;
    portal.setAvailableActions(['Malica', 'Konec dela']);

    const res = await request(app)
      .get('/api/v1/time-tracking/available-actions')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.availableActions).toEqual(['Malica', 'Konec dela']);
    expect(res.body.readAt).toBeDefined();
  });
});

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

// Pogodbeni test proti specs/002-time-tracking/contracts/openapi.yaml: POST /time-tracking/actions.
// DRY_RUN je v testnem okolju privzeto "true" (tests/setup/test-env.ts) — vsak test, ki
// dejansko klika, ga mora eksplicitno izklopiti.

beforeAll(async () => {
  await startTestDb();
});
afterEach(() => {
  resetClockPortalForTests();
  resetStateCacheForTests();
  return clearTestDb();
});
afterAll(stopTestDb);

describe('POST /time-tracking/actions pogodba', () => {
  it('izvede akcijo in vrne preverjen izid', async () => {
    setTestEnv({ DRY_RUN: 'false' });
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    await seedProfileFixture();

    const env = loadEnv();
    const portal = getClockPortal(env, getLogger(env)) as FakeClockPortal;
    portal.setAvailableActions(['Prijava na delo']);

    const res = await request(app)
      .post('/api/v1/time-tracking/actions')
      .set('Authorization', `Bearer ${token}`)
      .send({ actionName: 'Prijava na delo' });

    expect(res.status).toBe(200);
    expect(res.body.verified).toBe(true);
    expect(res.body.stateAfter).toBe('ON_DUTY');
  });

  it('already_done, ko je stanje že pravo — brez napake', async () => {
    setTestEnv({ DRY_RUN: 'false' });
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    await seedProfileFixture();

    const env = loadEnv();
    const portal = getClockPortal(env, getLogger(env)) as FakeClockPortal;
    portal.setAvailableActions(['Malica', 'Konec dela']); // ON_DUTY že velja

    const res = await request(app)
      .post('/api/v1/time-tracking/actions')
      .set('Authorization', `Bearer ${token}`)
      .send({ actionName: 'Prijava na delo' });

    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe('already_done');
  });

  it('unexpected_state vrne 422, ne 200 s tiho napačnim izidom', async () => {
    setTestEnv({ DRY_RUN: 'false' });
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    await seedProfileFixture();

    const env = loadEnv();
    const portal = getClockPortal(env, getLogger(env)) as FakeClockPortal;
    portal.setAvailableActions(['Prijava na delo']); // OFF_DUTY

    const res = await request(app)
      .post('/api/v1/time-tracking/actions')
      .set('Authorization', `Bearer ${token}`)
      .send({ actionName: 'Konec malice' }); // zahteva ON_BREAK

    expect(res.status).toBe(422);
  });

  it('dryRun v telesu ne klikne ničesar', async () => {
    setTestEnv({ DRY_RUN: 'false' });
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    await seedProfileFixture();

    const env = loadEnv();
    const portal = getClockPortal(env, getLogger(env)) as FakeClockPortal;
    portal.setAvailableActions(['Prijava na delo']);

    const res = await request(app)
      .post('/api/v1/time-tracking/actions')
      .set('Authorization', `Bearer ${token}`)
      .send({ actionName: 'Prijava na delo', dryRun: true });

    expect(res.status).toBe(200);
    expect(res.body.dryRun).toBe(true);
    expect(res.body.verified).toBe(false);
  });

  it('manjkajoč actionName vrne 400', async () => {
    setTestEnv({ DRY_RUN: 'false' });
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    await seedProfileFixture();

    const res = await request(app)
      .post('/api/v1/time-tracking/actions')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it('brez avtentikacije je zahteva zavrnjena', async () => {
    setTestEnv();
    const { app } = await createApp();
    const res = await request(app).post('/api/v1/time-tracking/actions').send({ actionName: 'Prijava na delo' });
    expect(res.status).toBe(401);
  });
});

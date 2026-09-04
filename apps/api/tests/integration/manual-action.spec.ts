import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/main.js';
import { startTestDb, stopTestDb, clearTestDb } from '../setup/mongo-memory.js';
import { setTestEnv } from '../setup/test-env.js';
import { loginAndUnlock, seedProfileFixture } from '../contract/time-tracking/_helpers.js';
import { getClockPortal, resetClockPortalForTests } from '../../src/modules/time-tracking/clock-portal/index.js';
import type { FakeClockPortal } from '../../src/modules/time-tracking/clock-portal/fake-clock-portal.js';
import { loadEnv } from '../../src/platform/config/env.js';
import { getLogger } from '../../src/platform/logging/logger.js';
import { resetStateCacheForTests } from '../../src/modules/time-tracking/services/state-cache.service.js';
import { ActionRecordModel } from '../../src/modules/time-tracking/models/action-record.model.js';
import { PlannedActionModel } from '../../src/modules/time-tracking/models/planned-action.model.js';
import { ljubljanaCalendarDay } from '../../src/domain/timezone.js';

// US1, sprejemni scenariji 3 in 5: ročna akcija se zapiše v zgodovino z virom "manual" in,
// če se ujema z današnjo načrtovano akcijo, jo zaključi — opozorilo zanjo kasneje ne pride.

beforeAll(async () => {
  await startTestDb();
});
afterEach(() => {
  resetClockPortalForTests();
  resetStateCacheForTests();
  return clearTestDb();
});
afterAll(stopTestDb);

describe('Ročni tok: branje → klik → verifikacija → zgodovina (US1)', () => {
  it('brez ujemajoče se načrtovane akcije: zapiše ad-hoc ActionRecord z virom manual', async () => {
    setTestEnv({ DRY_RUN: 'false' });
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const { location } = await seedProfileFixture();

    const env = loadEnv();
    const portal = getClockPortal(env, getLogger(env)) as FakeClockPortal;
    portal.setAvailableActions(['Prijava na delo']);

    const res = await request(app)
      .post('/api/v1/time-tracking/actions')
      .set('Authorization', `Bearer ${token}`)
      .send({ actionName: 'Prijava na delo', locationId: String(location._id) });

    expect(res.status).toBe(200);
    expect(res.body.verified).toBe(true);

    const records = await ActionRecordModel.find({ actionName: 'Prijava na delo' }).lean();
    expect(records).toHaveLength(1);
    expect(records[0]?.source).toBe('manual');
    expect(records[0]?.finalOutcome).toBe('succeeded');
    expect(records[0]?.profileId).toBeNull();
  });

  it('z ujemajočo se načrtovano akcijo: PlannedAction se zaključi, vir postane manual', async () => {
    setTestEnv({ DRY_RUN: 'false' });
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const { location, profile } = await seedProfileFixture();

    const localDate = ljubljanaCalendarDay(new Date());
    const planned = await PlannedActionModel.create({
      userId: profile.userId,
      localDate,
      profileId: profile._id,
      locationId: location._id,
      actionName: 'Prijava na delo',
      actionOrder: 1,
      scheduledAt: new Date(),
      baseLocalTime: '06:00:00',
      mode: 'AUTO',
      state: 'due',
      source: 'schedule',
    });

    const env = loadEnv();
    const portal = getClockPortal(env, getLogger(env)) as FakeClockPortal;
    portal.setAvailableActions(['Prijava na delo']);

    const res = await request(app)
      .post('/api/v1/time-tracking/actions')
      .set('Authorization', `Bearer ${token}`)
      .send({ actionName: 'Prijava na delo', locationId: String(location._id) });

    expect(res.status).toBe(200);
    expect(res.body.plannedActionId).toBe(String(planned._id));

    const updated = await PlannedActionModel.findById(planned._id).lean();
    expect(updated?.state).toBe('succeeded');
    expect(updated?.source).toBe('manual');
    expect(updated?.completedAt).not.toBeNull();

    const record = await ActionRecordModel.findOne({ actionName: 'Prijava na delo' }).lean();
    expect(record?.source).toBe('manual');
    expect(String(record?.profileId)).toBe(String(profile._id));
  });

  it('already_done: ne piše ActionAttempt/ActionRecord kot uspešen klik, samo vrne izid', async () => {
    setTestEnv({ DRY_RUN: 'false' });
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const { location } = await seedProfileFixture();

    const env = loadEnv();
    const portal = getClockPortal(env, getLogger(env)) as FakeClockPortal;
    portal.setAvailableActions(['Malica', 'Konec dela']); // ON_DUTY že velja

    const res = await request(app)
      .post('/api/v1/time-tracking/actions')
      .set('Authorization', `Bearer ${token}`)
      .send({ actionName: 'Prijava na delo', locationId: String(location._id) });

    expect(res.body.outcome).toBe('already_done');

    const record = await ActionRecordModel.findOne({ actionName: 'Prijava na delo' }).lean();
    expect(record?.finalOutcome).toBe('already_done');
  });
});

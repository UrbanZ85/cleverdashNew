import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/main.js';
import { startTestDb, stopTestDb, clearTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { loginAndUnlock, seedProfileFixture } from './_helpers.js';
import { PlannedActionModel } from '../../../src/modules/time-tracking/models/planned-action.model.js';

// Pogodbeni test proti specs/002-time-tracking/contracts/openapi.yaml:
// POST/GET/DELETE /time-tracking/absences, POST /time-tracking/overrides.

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterEach(clearTestDb);
afterAll(stopTestDb);

describe('/time-tracking/absences pogodba', () => {
  it('POST vnese odsotnost čez mejo meseca, endDate je vključen (FR-012)', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);

    const res = await request(app)
      .post('/api/v1/time-tracking/absences')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'vacation', startDate: '2026-06-29', endDate: '2026-07-03' });

    expect(res.status).toBe(201);
    expect(res.body.dayCount).toBe(5); // 29,30 junij + 1,2,3 julij
  });

  it('POST prekliče prihodnje planned-actions v obdobju odsotnosti', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const { profile } = await seedProfileFixture();
    await PlannedActionModel.create({
      userId: profile.userId,
      localDate: '2099-06-15',
      profileId: profile._id,
      locationId: profile.locationId,
      actionName: 'Prijava na delo',
      actionOrder: 1,
      scheduledAt: new Date('2099-06-15T06:00:00Z'),
      baseLocalTime: '06:00:00',
      mode: 'AUTO',
      state: 'planned',
    });

    await request(app)
      .post('/api/v1/time-tracking/absences')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'vacation', startDate: '2099-06-10', endDate: '2099-06-20', profileIds: [String(profile._id)] });

    const cancelled = await PlannedActionModel.findOne({ localDate: '2099-06-15' }).lean();
    expect(cancelled?.state).toBe('cancelled');
  });

  it('DELETE odstrani odsotnost', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const created = await request(app)
      .post('/api/v1/time-tracking/absences')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'sick', startDate: '2026-09-01', endDate: '2026-09-02' });

    const res = await request(app)
      .delete(`/api/v1/time-tracking/absences/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
  });
});

describe('/time-tracking/overrides pogodba', () => {
  it('POST vsili delovni dan na sicer prost dan (Story 7)', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);

    const res = await request(app)
      .post('/api/v1/time-tracking/overrides')
      .set('Authorization', `Bearer ${token}`)
      .send({ localDate: '2026-08-15', kind: 'forceWorkday' }); // sobota

    expect(res.status).toBe(201);
  });

  it('forceWorkday, ki se prekriva z obstoječo odsotnostjo, vrne 422', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    await request(app)
      .post('/api/v1/time-tracking/absences')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'vacation', startDate: '2026-07-01', endDate: '2026-07-10' });

    const res = await request(app)
      .post('/api/v1/time-tracking/overrides')
      .set('Authorization', `Bearer ${token}`)
      .send({ localDate: '2026-07-05', kind: 'forceWorkday' });

    expect(res.status).toBe(422);
  });

  it('odsotnost, ki se prekriva z obstoječim forceWorkday, vrne 422', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    await request(app)
      .post('/api/v1/time-tracking/overrides')
      .set('Authorization', `Bearer ${token}`)
      .send({ localDate: '2026-08-15', kind: 'forceWorkday' });

    const res = await request(app)
      .post('/api/v1/time-tracking/absences')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'vacation', startDate: '2026-08-10', endDate: '2026-08-20' });

    expect(res.status).toBe(422);
  });
});

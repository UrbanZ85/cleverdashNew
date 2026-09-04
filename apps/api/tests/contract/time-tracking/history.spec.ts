import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Types } from 'mongoose';
import { createApp } from '../../../src/main.js';
import { startTestDb, stopTestDb, clearTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { loginAndUnlock, seedProfileFixture, defaultTestUserId } from './_helpers.js';
import { ActionRecordModel } from '../../../src/modules/time-tracking/models/action-record.model.js';
import { PlannedActionModel } from '../../../src/modules/time-tracking/models/planned-action.model.js';
import { ActionAttemptModel } from '../../../src/modules/time-tracking/models/action-attempt.model.js';

// Pogodbeni test proti specs/002-time-tracking/contracts/openapi.yaml:
// GET /time-tracking/history, GET /time-tracking/history/{id}/attempts.

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterEach(clearTestDb);
afterAll(stopTestDb);

describe('/time-tracking/history pogodba (US9)', () => {
  it('vrne zapise s časi, izidom, virom in stanjem pred/po (FR-050)', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const { profile } = await seedProfileFixture();
    await ActionRecordModel.create({
      userId: profile.userId,
      localDate: '2026-08-18',
      profileId: profile._id,
      profileName: profile.name,
      locationName: 'Testna lokacija',
      actionName: 'Prijava na delo',
      scheduledAt: new Date('2026-08-18T04:00:00Z'),
      completedAt: new Date('2026-08-18T04:00:05Z'),
      finalOutcome: 'succeeded',
      source: 'schedule',
      stateBefore: 'OFF_DUTY',
      stateAfter: 'ON_DUTY',
    });

    const res = await request(app)
      .get('/api/v1/time-tracking/history?from=2026-08-01&to=2026-08-31')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].finalOutcome).toBe('succeeded');
    expect(res.body.total).toBe(1);
  });

  it('filtrira po izidu, profilu in obdobju (FR-051)', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const { profile } = await seedProfileFixture();
    await ActionRecordModel.create([
      {
        userId: profile.userId,
        localDate: '2026-08-10',
        profileId: profile._id,
        profileName: profile.name,
        locationName: 'l',
        actionName: 'Prijava na delo',
        scheduledAt: new Date(),
        finalOutcome: 'succeeded',
        source: 'schedule',
      },
      {
        userId: profile.userId,
        localDate: '2026-08-11',
        profileId: profile._id,
        profileName: profile.name,
        locationName: 'l',
        actionName: 'Konec dela',
        scheduledAt: new Date(),
        finalOutcome: 'failed',
        source: 'schedule',
      },
    ]);

    const res = await request(app)
      .get(`/api/v1/time-tracking/history?from=2026-08-01&to=2026-08-31&outcome=failed&profileId=${profile._id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].finalOutcome).toBe('failed');
  });

  it('straničenje deluje (page/pageSize)', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const { profile } = await seedProfileFixture();
    const records = Array.from({ length: 5 }, (_, i) => ({
      userId: profile.userId,
      localDate: `2026-08-0${i + 1}`,
      profileId: profile._id,
      profileName: profile.name,
      locationName: 'l',
      actionName: 'Prijava na delo',
      scheduledAt: new Date(),
      finalOutcome: 'succeeded' as const,
      source: 'schedule' as const,
    }));
    await ActionRecordModel.create(records);

    const res = await request(app)
      .get('/api/v1/time-tracking/history?from=2026-08-01&to=2026-08-31&page=1&pageSize=2')
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.items).toHaveLength(2);
    expect(res.body.total).toBe(5);
  });

  it('history/{id}/attempts vrne poskuse za en zapis, vključno s posnetkom ob napaki', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const { profile, location } = await seedProfileFixture();
    const planned = await PlannedActionModel.create({
      userId: profile.userId,
      localDate: '2026-08-18',
      profileId: profile._id,
      locationId: location._id,
      actionName: 'Prijava na delo',
      actionOrder: 1,
      scheduledAt: new Date(),
      baseLocalTime: '06:00:00',
      mode: 'AUTO',
      state: 'failed',
    });
    await ActionAttemptModel.create({
      userId: profile.userId,
      plannedActionId: planned._id,
      attemptNumber: 1,
      startedAt: new Date(),
      finishedAt: new Date(),
      outcome: 'not_verified',
      clockStateBefore: 'OFF_DUTY',
      clockStateAfter: 'OFF_DUTY',
      screenshotPath: '/app/data/screenshots/test.png',
      durationMs: 100,
    });
    const record = await ActionRecordModel.create({
      userId: profile.userId,
      localDate: '2026-08-18',
      plannedActionId: planned._id,
      profileId: profile._id,
      profileName: profile.name,
      locationName: location.name,
      actionName: 'Prijava na delo',
      scheduledAt: new Date(),
      finalOutcome: 'failed',
      source: 'schedule',
    });

    const res = await request(app)
      .get(`/api/v1/time-tracking/history/${record._id}/attempts`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    // Naslov, ki datoteko postreže — ne pot na disku strežnika, ki odjemalcu nič ne pomeni.
    const attemptId = res.body[0].id;
    expect(res.body[0].screenshotUrl).toBe(`/time-tracking/history/attempts/${attemptId}/screenshot`);

    // Datoteke v testu ni, zato 404 z razlago (FR-053) — nikoli 500 in nikoli tiha prazna slika.
    const missing = await request(app)
      .get(`/api/v1/time-tracking/history/attempts/${attemptId}/screenshot`)
      .set('Authorization', `Bearer ${token}`);
    expect(missing.status).toBe(404);
  });

  it('posnetek zaslona tujega poskusa ni dosegljiv niti po natančnem naslovu', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const foreignAttempt = await ActionAttemptModel.create({
      userId: new Types.ObjectId(), // drug uporabnik
      attemptNumber: 1,
      startedAt: new Date(),
      finishedAt: new Date(),
      outcome: 'not_verified',
      clockStateBefore: 'OFF_DUTY',
      clockStateAfter: 'OFF_DUTY',
      screenshotPath: '/app/data/screenshots/tuji.png',
      durationMs: 100,
    });

    const res = await request(app)
      .get(`/api/v1/time-tracking/history/attempts/${foreignAttempt._id}/screenshot`)
      .set('Authorization', `Bearer ${token}`);

    // Enak 404 kot za neobstoječ zapis — obstoj tujega poskusa se ne razkrije.
    expect(res.status).toBe(404);
  });

  it('history/{id}/attempts za ad-hoc ročno akcijo (brez plannedActionId) vrne prazen seznam', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const userId = await defaultTestUserId();
    const record = await ActionRecordModel.create({
      userId,
      localDate: '2026-08-18',
      profileName: 'Ročna akcija',
      locationName: 'l',
      actionName: 'Prijava na delo',
      scheduledAt: new Date(),
      finalOutcome: 'succeeded',
      source: 'manual',
    });

    const res = await request(app)
      .get(`/api/v1/time-tracking/history/${record._id}/attempts`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

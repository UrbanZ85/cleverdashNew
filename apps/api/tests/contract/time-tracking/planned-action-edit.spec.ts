import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/main.js';
import { startTestDb, stopTestDb, clearTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { loginAndUnlock, seedProfileFixture, defaultTestUserId } from './_helpers.js';
import { PlannedActionModel } from '../../../src/modules/time-tracking/models/planned-action.model.js';
import { TrackingLocationModel } from '../../../src/modules/time-tracking/models/tracking-location.model.js';

// PATCH /time-tracking/planned-actions/{id}: popravek ENEGA dne — ura in lokacija — ne da bi
// se dotaknili urnika. Koledar to uporablja ob kliku na dan.

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterEach(clearTestDb);
afterAll(stopTestDb);

const DATE = '2099-06-15';

async function seedAction(over: Record<string, unknown> = {}) {
  const { profile, location, session } = await seedProfileFixture();
  const action = await PlannedActionModel.create({
    userId: profile.userId,
    localDate: DATE,
    profileId: profile._id,
    locationId: location._id,
    actionName: 'Prijava na delo',
    actionOrder: 1,
    scheduledAt: new Date(`${DATE}T04:00:00Z`),
    baseLocalTime: '06:00:00',
    mode: 'AUTO',
    state: 'planned',
    source: 'schedule',
    ...over,
  });
  return { action, profile, location, session };
}

describe('PATCH /time-tracking/planned-actions/{id} pogodba', () => {
  it('localTime popravi TUDI baseLocalTime, ne samo trenutka', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const { action } = await seedAction();

    const res = await request(app)
      .patch(`/api/v1/time-tracking/planned-actions/${action._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ localTime: '09:30' });

    expect(res.status).toBe(200);
    // Brez popravka baseLocalTime bi zaslon Danes in zgodovina kazala staro uro.
    expect(res.body.baseLocalTime).toBe('09:30:00');
    expect(new Date(res.body.scheduledAt).toISOString()).toContain(DATE);
  });

  it('ročno vpisana ura nima raztrosa — izvede se točno takrat, kot piše', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const { action } = await seedAction();

    const res = await request(app)
      .patch(`/api/v1/time-tracking/planned-actions/${action._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ localTime: '09:30:00' });

    // 09:30 po Ljubljani je poleti 07:30 UTC — brez raztrosa natanko, brez sekund vmes.
    expect(new Date(res.body.scheduledAt).toISOString()).toBe('2099-06-15T07:30:00.000Z');
  });

  it('sprememba lokacije preimenuje gumb za začetek dela (FR-090)', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const { action, session } = await seedAction();
    const doma = await TrackingLocationModel.create({
      userId: await defaultTestUserId(),
      name: 'Doma',
      url: 'https://e-racuni.com/S6a/Clockin-doma',
      sessionId: session._id,
      startAction: 'Delo od doma',
      coordinateTemplate: { latitude: '46.0629_6', longitude: '14.5602_9' },
    });

    const res = await request(app)
      .patch(`/api/v1/time-tracking/planned-actions/${action._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ locationId: String(doma._id) });

    expect(res.status).toBe(200);
    // Brez preimenovanja bi načrt doma pritisnil gumb "Prijava na delo", ki ga tam ni.
    expect(res.body.actionName).toBe('Delo od doma');
    expect(res.body.locationId).toBe(String(doma._id));
  });

  it('akcija, ki ni začetek dela, ob spremembi lokacije obdrži ime', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const { action, session } = await seedAction({ actionName: 'Malica', baseLocalTime: '12:00:00' });
    const doma = await TrackingLocationModel.create({
      userId: await defaultTestUserId(),
      name: 'Doma',
      url: 'https://e-racuni.com/S6a/Clockin-doma',
      sessionId: session._id,
      startAction: 'Delo od doma',
      coordinateTemplate: { latitude: '46.0629_6', longitude: '14.5602_9' },
    });

    const res = await request(app)
      .patch(`/api/v1/time-tracking/planned-actions/${action._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ locationId: String(doma._id) });

    expect(res.body.actionName).toBe('Malica');
  });

  it('preimenovanje, ki bi trčilo z obstoječim začetkom dela, vrne 422', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const { action, profile, session } = await seedAction();
    const doma = await TrackingLocationModel.create({
      userId: await defaultTestUserId(),
      name: 'Doma',
      url: 'https://e-racuni.com/S6a/Clockin-doma',
      sessionId: session._id,
      startAction: 'Delo od doma',
      coordinateTemplate: { latitude: '46.0629_6', longitude: '14.5602_9' },
    });
    await PlannedActionModel.create({
      userId: profile.userId,
      localDate: DATE,
      profileId: profile._id,
      locationId: doma._id,
      actionName: 'Delo od doma',
      actionOrder: 2,
      scheduledAt: new Date(`${DATE}T05:00:00Z`),
      baseLocalTime: '07:00:00',
      mode: 'AUTO',
      state: 'planned',
      source: 'manual',
    });

    const res = await request(app)
      .patch(`/api/v1/time-tracking/planned-actions/${action._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ locationId: String(doma._id) });

    // Brez tega preverjanja bi trčil edinstveni indeks in vrnil 500.
    expect(res.status).toBe(422);
    expect(res.body.detail).toContain('Delo od doma');
  });

  it('izvedene akcije ni mogoče spreminjati — evidenca ni urejevalnik (člen XII)', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const { action } = await seedAction({ state: 'succeeded', completedAt: new Date() });

    const res = await request(app)
      .patch(`/api/v1/time-tracking/planned-actions/${action._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ localTime: '09:30' });

    expect(res.status).toBe(422);
    expect((await PlannedActionModel.findById(action._id))?.baseLocalTime).toBe('06:00:00');
  });

  it('preskok dneva ostane mogoč', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const { action } = await seedAction();

    const res = await request(app)
      .patch(`/api/v1/time-tracking/planned-actions/${action._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ state: 'skipped' });

    expect(res.status).toBe(200);
    expect(res.body.state).toBe('skipped');
  });

  it('tuja lokacija vrne 404, ne tihe spremembe', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const { action } = await seedAction();

    const res = await request(app)
      .patch(`/api/v1/time-tracking/planned-actions/${action._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ locationId: '507f1f77bcf86cd799439011' });

    expect(res.status).toBe(404);
  });

  it('neveljavna ura vrne 400', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const { action } = await seedAction();

    const res = await request(app)
      .patch(`/api/v1/time-tracking/planned-actions/${action._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ localTime: '25:00' });

    expect(res.status).toBe(400);
  });

  it('GET /planned-actions vrne locationId — koledar iz njega izriše značko', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const { location } = await seedAction();

    const res = await request(app)
      .get(`/api/v1/time-tracking/planned-actions?from=${DATE}&to=${DATE}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body[0].locationId).toBe(String(location._id));
  });
});

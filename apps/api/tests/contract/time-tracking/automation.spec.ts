import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/main.js';
import { startTestDb, stopTestDb, clearTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { loginAndUnlock, seedProfileFixture, defaultTestUserId } from './_helpers.js';
import { PlannedActionModel } from '../../../src/modules/time-tracking/models/planned-action.model.js';
import { enabledUserIds } from '../../../src/modules/time-tracking/services/automation.service.js';
import { ljubljanaCalendarDay } from '../../../src/domain/timezone.js';

// Dve stikali: `SCHEDULER_ENABLED` (namestitev) in osebno stikalo uporabnika. Ta datoteka
// pokriva drugo — GET/PUT /time-tracking/automation in njegove takojšnje posledice.

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterEach(clearTestDb);
afterAll(stopTestDb);

const today = () => ljubljanaCalendarDay(new Date());

async function seedPlannedAction(
  userId: string,
  profileId: unknown,
  locationId: unknown,
  over: Record<string, unknown> = {},
) {
  return PlannedActionModel.create({
    userId,
    localDate: today(),
    profileId,
    locationId,
    actionName: 'Prijava na delo',
    actionOrder: 1,
    scheduledAt: new Date(`${today()}T06:00:00Z`),
    baseLocalTime: '06:00:00',
    mode: 'AUTO',
    state: 'planned',
    source: 'schedule',
    ...over,
  });
}

describe('/time-tracking/automation pogodba', () => {
  it('GET privzeto vrne izklopljeno — avtomatika ni privzetek, ampak odločitev', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);

    const res = await request(app).get('/api/v1/time-tracking/automation').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.userEnabled).toBe(false);
    expect(res.body.effective).toBe(false);
    expect(res.body.changedAt).toBeNull();
  });

  it('GET pove OBE stikali ločeno, ne samo skupnega izida', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);

    const res = await request(app).get('/api/v1/time-tracking/automation').set('Authorization', `Bearer ${token}`);

    // Brez ločenih polj uporabnik ob izklopljenem schedulerju ne bi razumel, zakaj njegovo
    // vklopljeno stikalo ne naredi ničesar.
    expect(res.body).toHaveProperty('schedulerEnabled');
    expect(res.body).toHaveProperty('userEnabled');
    expect(typeof res.body.effective).toBe('boolean');
  });

  it('PUT vklopi in izklopi, GET vrne novo stanje', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);

    const on = await request(app)
      .put('/api/v1/time-tracking/automation')
      .set('Authorization', `Bearer ${token}`)
      .send({ enabled: true });
    expect(on.status).toBe(200);
    expect(on.body.userEnabled).toBe(true);

    const after = await request(app).get('/api/v1/time-tracking/automation').set('Authorization', `Bearer ${token}`);
    expect(after.body.userEnabled).toBe(true);
    expect(after.body.changedAt).not.toBeNull();

    const off = await request(app)
      .put('/api/v1/time-tracking/automation')
      .set('Authorization', `Bearer ${token}`)
      .send({ enabled: false });
    expect(off.body.userEnabled).toBe(false);
  });

  it('izklop TAKOJ prekliče prihodnje načrtovane akcije', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const { profile, location } = await seedProfileFixture();
    const action = await seedPlannedAction(String(profile.userId), profile._id, location._id);

    const res = await request(app)
      .put('/api/v1/time-tracking/automation')
      .set('Authorization', `Bearer ${token}`)
      .send({ enabled: false });

    expect(res.body.cancelled).toBe(1);
    expect((await PlannedActionModel.findById(action._id))?.state).toBe('cancelled');
  });

  it('izklop se ne dotakne že izvedene zgodovine', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const { profile, location } = await seedProfileFixture();
    const done = await seedPlannedAction(String(profile.userId), profile._id, location._id, {
      actionName: 'Konec dela',
      state: 'succeeded',
    });

    await request(app)
      .put('/api/v1/time-tracking/automation')
      .set('Authorization', `Bearer ${token}`)
      .send({ enabled: false });

    expect((await PlannedActionModel.findById(done._id))?.state).toBe('succeeded');
  });

  it('vklop sestavi načrt znova — preklicani dan se ne izgubi', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    // Profil dela vse dni v tednu, sicer bi bil izid odvisen od tega, kateri dan test teče.
    const { profile } = await seedProfileFixture({ profile: { daysOfWeek: [1, 2, 3, 4, 5, 6, 7] } });

    await request(app)
      .put('/api/v1/time-tracking/automation')
      .set('Authorization', `Bearer ${token}`)
      .send({ enabled: true });
    const created = await PlannedActionModel.countDocuments({ localDate: today(), state: 'planned' });
    expect(created).toBeGreaterThan(0);

    await request(app)
      .put('/api/v1/time-tracking/automation')
      .set('Authorization', `Bearer ${token}`)
      .send({ enabled: false });
    expect(await PlannedActionModel.countDocuments({ localDate: today(), state: 'planned' })).toBe(0);

    // Brez brisanja preklicanih zapisov bi `upsert` v buildPlanForDay zadel obstoječi zapis
    // in ničesar ne obnovil — preostanek dneva bi bil izgubljen.
    const back = await request(app)
      .put('/api/v1/time-tracking/automation')
      .set('Authorization', `Bearer ${token}`)
      .send({ enabled: true });
    expect(back.body.rebuilt).toBeGreaterThan(0);
    expect(await PlannedActionModel.countDocuments({ localDate: today(), state: 'planned' })).toBe(created);
    expect(String(profile.userId)).toBeTruthy();
  });

  it('vklop ne obnovi akcij, ki jih je preklicala odsotnost — presoja ostane v buildPlanForDay', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    await seedProfileFixture({ profile: { daysOfWeek: [1, 2, 3, 4, 5, 6, 7] } });

    await request(app)
      .post('/api/v1/time-tracking/absences')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'vacation', startDate: today(), endDate: today() });

    await request(app)
      .put('/api/v1/time-tracking/automation')
      .set('Authorization', `Bearer ${token}`)
      .send({ enabled: true });

    expect(await PlannedActionModel.countDocuments({ localDate: today(), state: 'planned' })).toBe(0);
  });

  it('enabledUserIds vidi samo uporabnike z vklopljenim stikalom', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const userId = await defaultTestUserId();

    expect(await enabledUserIds()).not.toContain(userId);

    await request(app)
      .put('/api/v1/time-tracking/automation')
      .set('Authorization', `Bearer ${token}`)
      .send({ enabled: true });

    expect([...(await enabledUserIds())]).toContain(userId);
  });

  it('PUT brez veljavnega telesa vrne 400', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);

    const res = await request(app)
      .put('/api/v1/time-tracking/automation')
      .set('Authorization', `Bearer ${token}`)
      .send({ enabled: 'ja' });

    expect(res.status).toBe(400);
  });

  it('brez avtentikacije ni dostopa', async () => {
    const { app } = await createApp();
    expect((await request(app).get('/api/v1/time-tracking/automation')).status).toBe(401);
    expect((await request(app).put('/api/v1/time-tracking/automation').send({ enabled: true })).status).toBe(401);
  });
});

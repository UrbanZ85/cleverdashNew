import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/main.js';
import { startTestDb, stopTestDb, clearTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { loginAndUnlock, seedProfileFixture } from './_helpers.js';
import { PlannedActionModel } from '../../../src/modules/time-tracking/models/planned-action.model.js';
import { TrackingProfileModel } from '../../../src/modules/time-tracking/models/tracking-profile.model.js';

// `POST /time-tracking/rebuild-plan` s `force`. Načrt dneva je namenoma ZAMRZNJEN, ko enkrat
// nastane (`$setOnInsert` v schedule-builder.service.ts), da ročni popravek preživi tik. Zato
// sprememba urnika sama po sebi ne popravi že načrtovanega dneva — v koledarju ostanejo stare
// ure. `force` je edini izhod iz tega.

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterEach(clearTestDb);
afterAll(stopTestDb);

const DATE = '2099-06-15'; // torek

async function planDay(app: Parameters<typeof request>[0], token: string) {
  await request(app)
    .post('/api/v1/time-tracking/rebuild-plan')
    .set('Authorization', `Bearer ${token}`)
    .send({ date: DATE });
}

describe('/time-tracking/rebuild-plan?force pogodba', () => {
  it('brez force sprememba urnika NE popravi že načrtovanega dneva', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const { profile } = await seedProfileFixture({ profile: { daysOfWeek: [1, 2, 3, 4, 5, 6, 7] } });
    await planDay(app, token);

    await TrackingProfileModel.updateOne(
      { _id: profile._id },
      { actions: [{ actionName: 'Prijava na delo', localTime: '09:00:00', jitterSeconds: 0, order: 1 }] },
    );
    const res = await request(app)
      .post('/api/v1/time-tracking/rebuild-plan')
      .set('Authorization', `Bearer ${token}`)
      .send({ date: DATE });

    expect(res.body.created).toBe(0);
    expect(res.body.replaced).toBe(0);
    const action = await PlannedActionModel.findOne({ localDate: DATE, actionName: 'Prijava na delo' }).lean();
    expect(action?.baseLocalTime).toBe('06:00:00'); // stara ura obstane — to je vprašanje iz prakse
  });

  it('force zavrže še neizvedene akcije in jih sestavi po NOVEM urniku', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const { profile } = await seedProfileFixture({ profile: { daysOfWeek: [1, 2, 3, 4, 5, 6, 7] } });
    await planDay(app, token);

    await TrackingProfileModel.updateOne(
      { _id: profile._id },
      { actions: [{ actionName: 'Prijava na delo', localTime: '09:00:00', jitterSeconds: 0, order: 1 }] },
    );
    const res = await request(app)
      .post('/api/v1/time-tracking/rebuild-plan')
      .set('Authorization', `Bearer ${token}`)
      .send({ date: DATE, force: true });

    expect(res.body.replaced).toBeGreaterThan(0);
    expect(res.body.created).toBe(1);
    const action = await PlannedActionModel.findOne({ localDate: DATE, actionName: 'Prijava na delo' }).lean();
    expect(action?.baseLocalTime).toBe('09:00:00');
  });

  it('force se NE dotakne izvedenih akcij — te so zapis, ne načrt (člen VI)', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const { profile, location } = await seedProfileFixture({ profile: { daysOfWeek: [1, 2, 3, 4, 5, 6, 7] } });
    const done = await PlannedActionModel.create({
      userId: profile.userId,
      localDate: DATE,
      profileId: profile._id,
      locationId: location._id,
      actionName: 'Prijava na delo',
      actionOrder: 1,
      scheduledAt: new Date(`${DATE}T04:00:00Z`),
      baseLocalTime: '06:00:00',
      mode: 'AUTO',
      state: 'succeeded',
      completedAt: new Date(),
      source: 'schedule',
    });

    await request(app)
      .post('/api/v1/time-tracking/rebuild-plan')
      .set('Authorization', `Bearer ${token}`)
      .send({ date: DATE, force: true });

    const still = await PlannedActionModel.findById(done._id).lean();
    expect(still?.state).toBe('succeeded');
    expect(still?.baseLocalTime).toBe('06:00:00');
  });

  it('force se NE dotakne ročno vnesenih akcij — niso last urnika', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const { profile, location } = await seedProfileFixture({ profile: { daysOfWeek: [1, 2, 3, 4, 5, 6, 7] } });
    const manual = await PlannedActionModel.create({
      userId: profile.userId,
      localDate: DATE,
      profileId: profile._id,
      locationId: location._id,
      actionName: 'Odmor med delom',
      actionOrder: 9,
      scheduledAt: new Date(`${DATE}T08:00:00Z`),
      baseLocalTime: '10:00:00',
      mode: 'AUTO',
      state: 'planned',
      source: 'manual',
    });

    await request(app)
      .post('/api/v1/time-tracking/rebuild-plan')
      .set('Authorization', `Bearer ${token}`)
      .send({ date: DATE, force: true });

    expect(await PlannedActionModel.findById(manual._id).lean()).not.toBeNull();
  });

  it('force zavrže OBTIČAL running — sicer osvežitev ne more narediti nič', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const { profile, location } = await seedProfileFixture({ profile: { daysOfWeek: [1, 2, 3, 4, 5, 6, 7] } });
    const stuck = await PlannedActionModel.create({
      userId: profile.userId,
      localDate: DATE,
      profileId: profile._id,
      locationId: location._id,
      actionName: 'Prijava na delo',
      actionOrder: 1,
      scheduledAt: new Date(`${DATE}T04:00:00Z`),
      baseLocalTime: '06:00:00',
      mode: 'AUTO',
      state: 'running',
      source: 'schedule',
    });
    // Postaran mimo sheme: `updatedAt` postavlja Mongoose sam.
    await PlannedActionModel.collection.updateOne(
      { _id: stuck._id },
      { $set: { updatedAt: new Date(Date.now() - 3_600_000) } },
    );

    const res = await request(app)
      .post('/api/v1/time-tracking/rebuild-plan')
      .set('Authorization', `Bearer ${token}`)
      .send({ date: DATE, force: true });

    // Obtičal zapis zaradi edinstvenega indeksa (dan, profil, akcija) prepreči vsak nov vpis,
    // zato je brez tega v koledarju obstala stara ura in gumb "Osveži" ni naredil ničesar.
    expect(res.body.replaced).toBeGreaterThan(0);
    expect(await PlannedActionModel.findById(stuck._id).lean()).toBeNull();
    expect(await PlannedActionModel.countDocuments({ localDate: DATE, state: 'planned' })).toBeGreaterThan(0);
  });

  it('force NE zavrže svežega running — tisti se prav zdaj izvaja', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const { profile, location } = await seedProfileFixture({ profile: { daysOfWeek: [1, 2, 3, 4, 5, 6, 7] } });
    const inFlight = await PlannedActionModel.create({
      userId: profile.userId,
      localDate: DATE,
      profileId: profile._id,
      locationId: location._id,
      actionName: 'Prijava na delo',
      actionOrder: 1,
      scheduledAt: new Date(`${DATE}T04:00:00Z`),
      baseLocalTime: '06:00:00',
      mode: 'AUTO',
      state: 'running',
      source: 'schedule',
    });

    await request(app)
      .post('/api/v1/time-tracking/rebuild-plan')
      .set('Authorization', `Bearer ${token}`)
      .send({ date: DATE, force: true });

    expect((await PlannedActionModel.findById(inFlight._id).lean())?.state).toBe('running');
  });

  it('force na dnevu, ki ni delovni, pusti dan prazen', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    await seedProfileFixture({ profile: { daysOfWeek: [1, 2, 3, 4, 5, 6, 7] } });
    await planDay(app, token);

    await request(app)
      .post('/api/v1/time-tracking/absences')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'vacation', startDate: DATE, endDate: DATE });

    const res = await request(app)
      .post('/api/v1/time-tracking/rebuild-plan')
      .set('Authorization', `Bearer ${token}`)
      .send({ date: DATE, force: true });

    expect(res.body.created).toBe(0);
    expect(await PlannedActionModel.countDocuments({ localDate: DATE, state: 'planned' })).toBe(0);
  });
});

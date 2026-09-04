import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/main.js';
import { startTestDb, stopTestDb, clearTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { loginAndUnlock, seedProfileFixture } from './_helpers.js';

// Pogodbeni test proti specs/002-time-tracking/contracts/openapi.yaml:
// /time-tracking/profiles, /profiles/{id}/mode, /profiles/{id}/preview, /locations, /sessions.

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterEach(clearTestDb);
afterAll(stopTestDb);

describe('/time-tracking/profiles pogodba', () => {
  it('nov profil brez mode dobi privzeto AUTO (FR-007)', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    // seedProfileFixture() ustvari aktiven profil za pon-pet — ta test namenoma uporabi
    // vikend, da se ne prekriva (prekrivanje je predmet ločenega testa spodaj).
    const { location } = await seedProfileFixture();

    const res = await request(app)
      .post('/api/v1/time-tracking/profiles')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Nov profil',
        daysOfWeek: [6, 7],
        locationId: String(location._id),
        actions: [{ actionName: 'Prijava na delo', localTime: '06:00:00', order: 1 }],
      });

    expect(res.status).toBe(201);
    expect(res.body.mode).toBe('AUTO');
  });

  it('prekrivajoč se dan med dvema aktivnima profiloma vrne 422 (FR-006)', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const { location } = await seedProfileFixture({ profile: { daysOfWeek: [1, 2, 3, 4, 5] } });

    const res = await request(app)
      .post('/api/v1/time-tracking/profiles')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Prekrivajoč profil',
        daysOfWeek: [5, 6],
        locationId: String(location._id),
        actions: [],
      });

    expect(res.status).toBe(422);
  });

  it('neaktiven profil se ne šteje za prekrivanje', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const { location } = await seedProfileFixture({ profile: { daysOfWeek: [1, 2, 3, 4, 5], active: false } });

    const res = await request(app)
      .post('/api/v1/time-tracking/profiles')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Nov aktiven profil',
        daysOfWeek: [1, 2],
        locationId: String(location._id),
        actions: [],
      });

    expect(res.status).toBe(201);
  });

  it('PUT /profiles/{id}/mode nastavi način', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const { profile } = await seedProfileFixture();

    const res = await request(app)
      .put(`/api/v1/time-tracking/profiles/${profile._id}/mode`)
      .set('Authorization', `Bearer ${token}`)
      .send({ mode: 'REMIND_ONLY' });

    expect(res.status).toBe(200);
    expect(res.body.mode).toBe('REMIND_ONLY');
  });

  it('GET /profiles/{id}/preview ne zapiše ničesar v bazo', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const { profile } = await seedProfileFixture({ profile: { daysOfWeek: [1, 2, 3, 4, 5, 6, 7] } });

    const res = await request(app)
      .get(`/api/v1/time-tracking/profiles/${profile._id}/preview?date=2026-08-18`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.dayStatus).toBe('workday');
    expect(res.body.actions.length).toBeGreaterThan(0);

    const { PlannedActionModel } = await import('../../../src/modules/time-tracking/models/planned-action.model.js');
    const stored = await PlannedActionModel.find({ profileId: profile._id }).lean();
    expect(stored).toHaveLength(0);
  });

  it('DELETE /profiles/{id} prekliče prihodnje planned-actions', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const { profile } = await seedProfileFixture();
    const { PlannedActionModel } = await import('../../../src/modules/time-tracking/models/planned-action.model.js');
    await PlannedActionModel.create({
      userId: profile.userId,
      localDate: '2099-01-01',
      profileId: profile._id,
      locationId: profile.locationId,
      actionName: 'Prijava na delo',
      actionOrder: 1,
      scheduledAt: new Date('2099-01-01T06:00:00Z'),
      baseLocalTime: '06:00:00',
      mode: 'AUTO',
      state: 'planned',
    });

    const res = await request(app)
      .delete(`/api/v1/time-tracking/profiles/${profile._id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);

    const cancelled = await PlannedActionModel.findOne({ profileId: profile._id }).lean();
    expect(cancelled?.state).toBe('cancelled');
  });
});

describe('/time-tracking/locations in /sessions pogodba', () => {
  it('POST /locations ustvari novo lokacijo', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const { session } = await seedProfileFixture();

    const res = await request(app)
      .post('/api/v1/time-tracking/locations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Doma',
        url: 'https://e-racuni.com/S6a/Clockin-test',
        sessionId: String(session._id),
        coordinateTemplate: { latitude: '45.9611_0', longitude: '14.2978_7' },
      });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Doma');
  });

  it('PUT /sessions/{id} nikoli ne vrne cele vrednosti piškotka (FR-092)', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const { session } = await seedProfileFixture();

    const res = await request(app)
      .put(`/api/v1/time-tracking/sessions/${session._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ cookieValue: 'popolnoma-nova-skrivna-vrednost-piskotka' });

    expect(res.status).toBe(200);
    expect(res.body.session.cookieValueMasked).not.toContain('popolnoma-nova-skrivna-vrednost-piskotka');
    expect(JSON.stringify(res.body)).not.toContain('popolnoma-nova-skrivna-vrednost-piskotka');
  });
});

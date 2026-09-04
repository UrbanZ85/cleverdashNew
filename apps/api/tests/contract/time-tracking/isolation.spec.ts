import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/main.js';
import { startTestDb, stopTestDb, clearTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { fakeKeycloakForTests } from '../../setup/keycloak-global.js';
import { loginAsTestUser } from '../../setup/login-as-test-user.js';
import { seedProfileFixture } from './_helpers.js';
import { ActionRecordModel } from '../../../src/modules/time-tracking/models/action-record.model.js';

// US2, SC-002: "popolnoma ločeni podatki na uporabnika" — profil in zgodovina beleženja
// časa dveh uporabnikov sta popolnoma izolirana.

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(clearTestDb);

describe('Izolacija profilov/zgodovine beleženja časa med uporabniki (SC-002)', () => {
  it('GET /time-tracking/profiles vrne samo profile trenutnega uporabnika', async () => {
    const { app } = await createApp();
    const { accessToken: tokenA, userId: userIdA } = await loginAsTestUser(app, fakeKeycloakForTests, {
      sub: 'kc-sub-tt-user-a',
      email: 'tt-a@example.com',
      roles: ['cleverdash-user'],
    });
    const { accessToken: tokenB, userId: userIdB } = await loginAsTestUser(app, fakeKeycloakForTests, {
      sub: 'kc-sub-tt-user-b',
      email: 'tt-b@example.com',
      roles: ['cleverdash-user'],
    });

    await seedProfileFixture({ userId: userIdA, profile: { name: 'Profil A' } });
    await seedProfileFixture({ userId: userIdB, profile: { name: 'Profil B' } });

    const resA = await request(app).get('/api/v1/time-tracking/profiles').set('Authorization', `Bearer ${tokenA}`);
    expect(resA.body).toHaveLength(1);
    expect(resA.body[0].name).toBe('Profil A');

    const resB = await request(app).get('/api/v1/time-tracking/profiles').set('Authorization', `Bearer ${tokenB}`);
    expect(resB.body).toHaveLength(1);
    expect(resB.body[0].name).toBe('Profil B');
  });

  it('GET /time-tracking/history vrne samo zgodovino trenutnega uporabnika', async () => {
    const { app } = await createApp();
    const { accessToken: tokenA, userId: userIdA } = await loginAsTestUser(app, fakeKeycloakForTests, {
      sub: 'kc-sub-tt-hist-a',
      email: 'tt-hist-a@example.com',
      roles: ['cleverdash-user'],
    });
    const { accessToken: tokenB, userId: userIdB } = await loginAsTestUser(app, fakeKeycloakForTests, {
      sub: 'kc-sub-tt-hist-b',
      email: 'tt-hist-b@example.com',
      roles: ['cleverdash-user'],
    });

    await ActionRecordModel.create({
      userId: userIdA,
      localDate: '2026-08-18',
      profileName: 'Profil A',
      locationName: 'l',
      actionName: 'Prijava na delo',
      scheduledAt: new Date('2026-08-18T04:00:00Z'),
      finalOutcome: 'succeeded',
      source: 'manual',
    });
    await ActionRecordModel.create({
      userId: userIdB,
      localDate: '2026-08-18',
      profileName: 'Profil B',
      locationName: 'l',
      actionName: 'Konec dela',
      scheduledAt: new Date('2026-08-18T14:00:00Z'),
      finalOutcome: 'succeeded',
      source: 'manual',
    });

    const resA = await request(app)
      .get('/api/v1/time-tracking/history?from=2026-08-01&to=2026-08-31')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(resA.body.items).toHaveLength(1);
    expect(resA.body.items[0].actionName).toBe('Prijava na delo');

    const resB = await request(app)
      .get('/api/v1/time-tracking/history?from=2026-08-01&to=2026-08-31')
      .set('Authorization', `Bearer ${tokenB}`);
    expect(resB.body.items).toHaveLength(1);
    expect(resB.body.items[0].actionName).toBe('Konec dela');
  });
});

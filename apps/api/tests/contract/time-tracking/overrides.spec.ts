import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/main.js';
import { startTestDb, stopTestDb, clearTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { loginAndUnlock, seedProfileFixture } from './_helpers.js';
import { PlannedActionModel } from '../../../src/modules/time-tracking/models/planned-action.model.js';

// GET/DELETE /time-tracking/overrides. Doslej je obstajal samo POST: izjemo je bilo mogoče
// vnesti, ne pa videti ali odstraniti. Vsiljen delovni dan pri tem TRAJNO zavrne vsak dopust
// na ta datum (`assertNoForceWorkdayOverlap`), zato je bil napačen klik nepopravljiv.

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterEach(clearTestDb);
afterAll(stopTestDb);

const DATE = '2099-09-01';

async function createOverride(app: Parameters<typeof request>[0], token: string, localDate = DATE) {
  const res = await request(app)
    .post('/api/v1/time-tracking/overrides')
    .set('Authorization', `Bearer ${token}`)
    .send({ localDate, kind: 'forceWorkday' });
  expect(res.status).toBe(201);
  return res.body as { id: string };
}

describe('/time-tracking/overrides pogodba', () => {
  it('GET vrne vnesene izjeme — brez tega jih v koledarju ni videti', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    await createOverride(app, token);

    const res = await request(app).get('/api/v1/time-tracking/overrides').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ localDate: DATE, kind: 'forceWorkday' });
  });

  it('GET filtrira po obdobju', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    await createOverride(app, token, '2099-09-01');
    await createOverride(app, token, '2099-10-01');

    const res = await request(app)
      .get('/api/v1/time-tracking/overrides?from=2099-09-01&to=2099-09-30')
      .set('Authorization', `Bearer ${token}`);

    expect(res.body).toHaveLength(1);
    expect(res.body[0].localDate).toBe('2099-09-01');
  });

  it('DELETE odstrani izjemo in s tem SPROSTI datum za dopust', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    const override = await createOverride(app, token);

    // Dokler izjema stoji, je dopust zavrnjen — to je bila slepa ulica.
    const blocked = await request(app)
      .post('/api/v1/time-tracking/absences')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'vacation', startDate: DATE, endDate: DATE });
    expect(blocked.status).toBe(422);

    const removed = await request(app)
      .delete(`/api/v1/time-tracking/overrides/${override.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(removed.status).toBe(204);

    const allowed = await request(app)
      .post('/api/v1/time-tracking/absences')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'vacation', startDate: DATE, endDate: DATE });
    expect(allowed.status).toBe(201);
  });

  it('DELETE prekliče akcije, ki so nastale samo zaradi vsiljenega dneva', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    // 1. 9. 2099 je torek; profil, ki dela samo ob sobotah, ta dan sicer NE dela.
    await seedProfileFixture({ profile: { daysOfWeek: [6] } });
    const override = await createOverride(app, token);

    await request(app)
      .post('/api/v1/time-tracking/rebuild-plan')
      .set('Authorization', `Bearer ${token}`)
      .send({ date: DATE });
    expect(await PlannedActionModel.countDocuments({ localDate: DATE, state: 'planned' })).toBeGreaterThan(0);

    await request(app)
      .delete(`/api/v1/time-tracking/overrides/${override.id}`)
      .set('Authorization', `Bearer ${token}`);

    // Dan spet ni delovni, zato načrtovanih akcij ne sme ostati.
    expect(await PlannedActionModel.countDocuments({ localDate: DATE, state: 'planned' })).toBe(0);
  });

  it('DELETE neobstoječe izjeme vrne 404', async () => {
    const { app } = await createApp();
    const token = await loginAndUnlock(app);

    const res = await request(app)
      .delete('/api/v1/time-tracking/overrides/507f1f77bcf86cd799439011')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  it('brez avtentikacije ni dostopa', async () => {
    const { app } = await createApp();
    expect((await request(app).get('/api/v1/time-tracking/overrides')).status).toBe(401);
    expect((await request(app).delete('/api/v1/time-tracking/overrides/507f1f77bcf86cd799439011')).status).toBe(401);
  });
});

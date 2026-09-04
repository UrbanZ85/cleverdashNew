import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createHash } from 'node:crypto';
import { createApp } from '../../../src/main.js';
import { startTestDb, stopTestDb, clearTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { seedProfileFixture } from './_helpers.js';
import { getClockPortal, resetClockPortalForTests } from '../../../src/modules/time-tracking/clock-portal/index.js';
import type { FakeClockPortal } from '../../../src/modules/time-tracking/clock-portal/fake-clock-portal.js';
import { loadEnv } from '../../../src/platform/config/env.js';
import { getLogger } from '../../../src/platform/logging/logger.js';
import { resetStateCacheForTests } from '../../../src/modules/time-tracking/services/state-cache.service.js';
import { ApiKeyModel } from '../../../src/platform/apikeys/model.js';
import { ActionRecordModel } from '../../../src/modules/time-tracking/models/action-record.model.js';

// US11, quickstart.md §4 primer 15, SC-009: dvakratni klic z istim Idempotency-Key → ena
// izvedba, ne dve. Uporablja API ključ (n8n), ne uporabniško sejo — Story 11.

beforeAll(async () => {
  await startTestDb();
});
afterEach(() => {
  resetClockPortalForTests();
  resetStateCacheForTests();
  return clearTestDb();
});
afterAll(stopTestDb);

async function seedApiKey(scopes: string[]) {
  const secret = 'n8n-test-key-' + scopes.join('-');
  await ApiKeyModel.create({
    label: 'n8n',
    keyHash: createHash('sha256').update(secret).digest('hex'),
    keyPrefix: secret.slice(0, 8),
    scopes,
  });
  return secret;
}

describe('Idempotency-Key na POST /time-tracking/actions (US11, SC-009)', () => {
  it('ponovljena zahteva z istim ključem ne izvede akcije drugič', async () => {
    setTestEnv({ DRY_RUN: 'false' });
    const { app } = await createApp();
    const secret = await seedApiKey(['action:write']);
    await seedProfileFixture();

    const env = loadEnv();
    const portal = getClockPortal(env, getLogger(env)) as FakeClockPortal;
    portal.setAvailableActions(['Prijava na delo']);

    const idempotencyKey = 'fixture-not-a-secret-001';
    const first = await request(app)
      .post('/api/v1/time-tracking/actions')
      .set('X-API-Key', secret)
      .set('Idempotency-Key', idempotencyKey)
      .send({ actionName: 'Prijava na delo' });

    const second = await request(app)
      .post('/api/v1/time-tracking/actions')
      .set('X-API-Key', secret)
      .set('Idempotency-Key', idempotencyKey)
      .send({ actionName: 'Prijava na delo' });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body); // isti izid obakrat

    // Ena dejanska izvedba — en sam zgodovinski zapis, vir "api".
    const records = await ActionRecordModel.find({ actionName: 'Prijava na delo' }).lean();
    expect(records).toHaveLength(1);
    expect(records[0]?.source).toBe('api');
  });
});

describe('Obsegi API ključa (US11)', () => {
  it('ključ z omejenim obsegom (samo state:read) ne sme sprožiti akcije', async () => {
    setTestEnv();
    const { app } = await createApp();
    const secret = await seedApiKey(['state:read']);
    await seedProfileFixture();

    const res = await request(app)
      .post('/api/v1/time-tracking/actions')
      .set('X-API-Key', secret)
      .send({ actionName: 'Prijava na delo' });

    expect(res.status).toBe(403);
  });

  it('ključ z action:write sme sprožiti akcijo, a ne sme upravljati profilov', async () => {
    setTestEnv({ DRY_RUN: 'false' });
    const { app } = await createApp();
    const secret = await seedApiKey(['action:write']);
    const { location } = await seedProfileFixture();

    const env = loadEnv();
    const portal = getClockPortal(env, getLogger(env)) as FakeClockPortal;
    portal.setAvailableActions(['Prijava na delo']);

    const actionRes = await request(app)
      .post('/api/v1/time-tracking/actions')
      .set('X-API-Key', secret)
      .send({ actionName: 'Prijava na delo' });
    expect(actionRes.status).toBe(200);

    const profileRes = await request(app)
      .post('/api/v1/time-tracking/profiles')
      .set('X-API-Key', secret)
      .send({ name: 'x', daysOfWeek: [1], locationId: String(location._id), actions: [] });
    expect(profileRes.status).toBe(403);
  });

  it('n8n tipičen nabor (state:read, action:write, history:read) doseže vse tri poti', async () => {
    setTestEnv({ DRY_RUN: 'false' });
    const { app } = await createApp();
    const secret = await seedApiKey(['state:read', 'action:write', 'history:read']);
    await seedProfileFixture();

    const env = loadEnv();
    const portal = getClockPortal(env, getLogger(env)) as FakeClockPortal;
    portal.setAvailableActions(['Prijava na delo']);

    const state = await request(app).get('/api/v1/time-tracking/state').set('X-API-Key', secret);
    expect(state.status).toBe(200);

    const action = await request(app)
      .post('/api/v1/time-tracking/actions')
      .set('X-API-Key', secret)
      .send({ actionName: 'Prijava na delo' });
    expect(action.status).toBe(200);

    const history = await request(app).get('/api/v1/time-tracking/history').set('X-API-Key', secret);
    expect(history.status).toBe(200);
  });
});

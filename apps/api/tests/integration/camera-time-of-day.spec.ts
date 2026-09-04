import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/main.js';
import { startTestDb, stopTestDb, clearTestDb } from '../setup/mongo-memory.js';
import { setTestEnv } from '../setup/test-env.js';
import { loginAndUnlock, seedCameraFixture } from '../contract/cameras/_helpers.js';
import { ljubljanaHour } from '../../src/domain/timezone.js';

// quickstart.md §3.6, §4 primer 1-3 (integracijska raven — glej tudi
// tests/unit/camera-ordering.spec.ts za čisto domensko logiko). `vi.useFakeTimers()` se
// namenoma NE uporablja (glej tests/unit/cache-ttl-bounds.spec.ts — Mongo gonilnik se z
// zamrznjenim časom ne strinja); namesto tega test prebere DEJANSKO trenutno uro v
// Ljubljani in preveri, da GET /cameras spoštuje isto pravilo, ne glede na to, kdaj teče.

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(clearTestDb);

describe('Razvrstitev po času dneva — US6 konec-do-konca', () => {
  it('GET /cameras vrne dopoldansko/popoldansko kamero glede na dejansko trenutno uro (Europe/Ljubljana)', async () => {
    const currentHour = ljubljanaHour(new Date());
    const matchingPeriod: 'morning' | 'afternoon' = currentHour < 12 ? 'morning' : 'afternoon';

    const { app } = await createApp();
    const token = await loginAndUnlock(app);
    await seedCameraFixture({ name: 'Popoldanska', timeOfDay: 'afternoon', order: 0 });
    await seedCameraFixture({ name: 'Dopoldanska', timeOfDay: 'morning', order: 1 });

    const res = await request(app).get('/api/v1/cameras').set('Authorization', `Bearer ${token}`);
    const names = res.body.cameras.map((c: { name: string }) => c.name);
    const expectedFirst = matchingPeriod === 'morning' ? 'Dopoldanska' : 'Popoldanska';
    expect(names[0]).toBe(expectedFirst);
  });
});

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { startTestDb, stopTestDb, clearTestDb } from '../setup/mongo-memory.js';
import { setTestEnv } from '../setup/test-env.js';
import { PlannedActionModel } from '../../src/modules/time-tracking/models/planned-action.model.js';
import { reclaimStaleRunning, staleRunningMs } from '../../src/modules/time-tracking/services/stale-running.service.js';
import { loadEnv } from '../../src/platform/config/env.js';
import { getLogger } from '../../src/platform/logging/logger.js';

// `running` je bil slepa ulica: postavi ga korak za obdelavo zapadlih tik pred izvedbo, izhod
// iz njega pa ima samo zaključena izvedba. Če proces ugasne vmes (restart strežnika), zapis
// obvisi — poizvedba po zapadlih ga ne pobere (išče planned/due), polnočno zaprtje gleda samo
// pretekle dneve. Zaradi edinstvenega indeksa (dan, profil, akcija) tak zapis hkrati BLOKIRA
// ponovno sestavljanje načrta za tisti dan, zato v koledarju obstane stara ura.

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterEach(clearTestDb);
afterAll(stopTestDb);

const LOCAL_DATE = '2099-06-15';

async function seedRunning(ageMs: number) {
  const action = await PlannedActionModel.create({
    userId: new Types.ObjectId(),
    localDate: LOCAL_DATE,
    profileId: new Types.ObjectId(),
    locationId: new Types.ObjectId(),
    actionName: 'Malica',
    actionOrder: 2,
    scheduledAt: new Date(Date.now() - ageMs),
    baseLocalTime: '11:05:00',
    mode: 'AUTO',
    state: 'running',
    source: 'schedule',
  });
  // `updatedAt` postavlja Mongoose sam; za staranje ga je treba prepisati mimo sheme.
  await PlannedActionModel.collection.updateOne(
    { _id: action._id },
    { $set: { updatedAt: new Date(Date.now() - ageMs) } },
  );
  return action;
}

describe('reclaimStaleRunning', () => {
  it('prag je vsaj pet minut in raste s protokolno omejitvijo brskalnika', () => {
    expect(staleRunningMs({ BROWSER_PROTOCOL_TIMEOUT_MS: 1000 })).toBe(5 * 60_000);
    expect(staleRunningMs({ BROWSER_PROTOCOL_TIMEOUT_MS: 120_000 })).toBe(600_000);
  });

  it('obtičalo akcijo vrne v due, da jo naslednji korak lahko obdela', async () => {
    const env = loadEnv();
    const action = await seedRunning(staleRunningMs(env) + 60_000);

    const reclaimed = await reclaimStaleRunning(env, getLogger(env));

    expect(reclaimed).toBe(1);
    const after = await PlannedActionModel.findById(action._id).lean();
    expect(after?.state).toBe('due');
    // Razlog mora ostati zapisan — tiha napaka je hrošč najvišje resnosti (člen VI).
    expect(after?.failureReason).toContain('ponovni zagon');
  });

  it('sveže akcije se NE dotakne — ta se prav zdaj izvaja', async () => {
    const env = loadEnv();
    const action = await seedRunning(30_000);

    expect(await reclaimStaleRunning(env, getLogger(env))).toBe(0);
    expect((await PlannedActionModel.findById(action._id).lean())?.state).toBe('running');
  });

  it('drugih stanj ne premakne', async () => {
    const env = loadEnv();
    const succeeded = await PlannedActionModel.create({
      userId: new Types.ObjectId(),
      localDate: LOCAL_DATE,
      profileId: new Types.ObjectId(),
      locationId: new Types.ObjectId(),
      actionName: 'Prijava na delo',
      actionOrder: 1,
      scheduledAt: new Date(Date.now() - 86_400_000),
      baseLocalTime: '06:00:00',
      mode: 'AUTO',
      state: 'succeeded',
      source: 'schedule',
    });
    await PlannedActionModel.collection.updateOne(
      { _id: succeeded._id },
      { $set: { updatedAt: new Date(Date.now() - 86_400_000) } },
    );

    expect(await reclaimStaleRunning(env, getLogger(env))).toBe(0);
    expect((await PlannedActionModel.findById(succeeded._id).lean())?.state).toBe('succeeded');
  });
});

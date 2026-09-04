import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { startTestDb, stopTestDb, clearTestDb } from '../setup/mongo-memory.js';
import { recordScheduledAttempt } from '../../src/modules/time-tracking/services/record-execution.service.js';
import { PlannedActionModel } from '../../src/modules/time-tracking/models/planned-action.model.js';
import { ActionAttemptModel } from '../../src/modules/time-tracking/models/action-attempt.model.js';
import { ActionRecordModel } from '../../src/modules/time-tracking/models/action-record.model.js';
import type { ExecuteResult } from '../../src/modules/time-tracking/services/action-executor.service.js';

// Story 3 (US3), quickstart.md §4 primer 5: neuspel klik se ponovi z naraščajočim
// zamikom. Primer 9 (docs/legacy-engine.md §4.5): izčrpani poskusi → `failed`, NIKOLI
// tih `succeeded`.

beforeAll(startTestDb);
afterAll(stopTestDb);
afterEach(clearTestDb);

async function seedPlannedAction() {
  return PlannedActionModel.create({
    userId: '000000000000000000000003',
    localDate: '2026-08-18',
    profileId: '000000000000000000000001',
    locationId: '000000000000000000000002',
    actionName: 'Prijava na delo',
    actionOrder: 1,
    scheduledAt: new Date(),
    baseLocalTime: '06:00:00',
    mode: 'AUTO',
    state: 'running',
  });
}

const notVerified: ExecuteResult = {
  clicked: true,
  stateBefore: 'OFF_DUTY',
  stateAfter: 'OFF_DUTY',
  availableActionsBefore: ['Prijava na delo'],
  availableActionsAfter: ['Prijava na delo'],
  verified: false,
  durationMs: 5,
  outcome: 'not_verified',
  diagnostics: { reason: 'ok' },
};

describe('recordScheduledAttempt — naraščajoč zamik do izčrpanja (US3)', () => {
  it('prvi neuspel poskus razporedi ponovitev z zamikom retryBackoffSeconds[0], ostane v due', async () => {
    const action = await seedPlannedAction();
    const outcome = await recordScheduledAttempt({
      locationName: 'Testna lokacija',
      result: notVerified,
      plannedAction: action,
      maxAttempts: 3,
      retryBackoffSeconds: [30, 120, 300],
    });

    expect(outcome).toBe('retry_scheduled');
    const updated = await PlannedActionModel.findById(action._id).lean();
    expect(updated?.state).toBe('due');
    expect(updated?.attemptCount).toBe(1);
    const delayMs = updated!.nextAttemptAt!.getTime() - Date.now();
    expect(delayMs).toBeGreaterThan(25_000);
    expect(delayMs).toBeLessThan(35_000);

    const attempts = await ActionAttemptModel.find({ plannedActionId: action._id }).lean();
    expect(attempts).toHaveLength(1);
    // Zgodovina se NE zapiše, dokler poskusi niso izčrpani ali uspešni.
    const records = await ActionRecordModel.find({}).lean();
    expect(records).toHaveLength(0);
  });

  it('izčrpani poskusi → failed, NIKOLI succeeded (docs/legacy-engine.md §4.5)', async () => {
    const action = await seedPlannedAction();
    action.attemptCount = 2; // že dva neuspela poskusa
    await action.save();

    const outcome = await recordScheduledAttempt({
      locationName: 'Testna lokacija',
      result: notVerified,
      plannedAction: action,
      maxAttempts: 3,
      retryBackoffSeconds: [30, 120, 300],
    });

    expect(outcome).toBe('failed_exhausted');
    const updated = await PlannedActionModel.findById(action._id).lean();
    expect(updated?.state).toBe('failed');
    expect(updated?.state).not.toBe('succeeded');

    const record = await ActionRecordModel.findOne({}).lean();
    expect(record?.finalOutcome).toBe('failed');
  });

  it('uspešen poskus finalizira takoj, ne glede na attemptCount', async () => {
    const action = await seedPlannedAction();
    const verified: ExecuteResult = { ...notVerified, verified: true, stateAfter: 'ON_DUTY', outcome: 'succeeded' };

    const outcome = await recordScheduledAttempt({
      locationName: 'Testna lokacija',
      result: verified,
      plannedAction: action,
      maxAttempts: 3,
      retryBackoffSeconds: [30, 120, 300],
    });

    expect(outcome).toBe('succeeded');
    const updated = await PlannedActionModel.findById(action._id).lean();
    expect(updated?.state).toBe('succeeded');
    const record = await ActionRecordModel.findOne({}).lean();
    expect(record?.finalOutcome).toBe('succeeded');
  });
});

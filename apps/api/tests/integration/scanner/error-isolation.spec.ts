import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { clearTestDb, startTestDb, stopTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { loadEnv } from '../../../src/platform/config/env.js';
import { getLogger } from '../../../src/platform/logging/logger.js';
import { ScannerDefinitionModel } from '../../../src/platform/scanner/models/scanner-definition.model.js';
import { ScannerNotificationModel } from '../../../src/platform/scanner/models/scanner-notification.model.js';
import { ScannerResultModel } from '../../../src/platform/scanner/models/scanner-result.model.js';
import { ScannerRunModel } from '../../../src/platform/scanner/models/scanner-run.model.js';
import { resetScannerTypesForTests } from '../../../src/platform/scanner/registry.js';
import { executeRun } from '../../../src/platform/scanner/services/run-executor.service.js';
import { requestManualRun } from '../../../src/platform/scanner/services/scheduler.service.js';
import { runScannerTick, stopScannerSchedulerForTests } from '../../../src/platform/scanner/services/tick.js';
import { mockType, okOutcome, seedDefinition, seedUser, type MockTypeHandle } from './_helpers.js';

// FR-017 (US5): napaka enega zagona ali enega skenerja ne vpliva na druge; rezultati pridejo samo iz
// uspešnih zagonov; skener, izbrisan med zagonom, ne pusti rezultatov ne dopisov. Dopolnjuje
// run-lifecycle.spec.ts (ki pokriva izolacijo med dvema single definicijama in `partial` pri batch).

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterAll(stopTestDb);

let single: MockTypeHandle;
const ACTOR = new Types.ObjectId().toString();
const env = () => loadEnv();
const logger = () => getLogger(loadEnv());

beforeEach(() => {
  resetScannerTypesForTests();
  single = mockType('solo', 'single');
});
afterEach(async () => {
  stopScannerSchedulerForTests();
  await clearTestDb();
});

function reconcileOutcome(items: Array<{ identity: string; title: string; amount: number }>) {
  return async (ctx: Parameters<MockTypeHandle['behaviour']['execute']>[0]) => {
    const { events, counters } = await ctx.results!.reconcile(
      items.map((i) => ({ identity: i.identity, source: 'mock', title: i.title, price: { amount: i.amount, currency: 'EUR' }, data: {} })),
      { sourceSucceeded: true },
    );
    return okOutcome({ counters, events, definitions: [{ definitionId: ctx.definition!.id, ownerId: ctx.definition!.userId, outcome: 'ok', message: null }] });
  };
}

describe('izolacija napak', () => {
  it('execute vrže v zagonu 1 in uspe v zagonu 2 → prvi failed brez rezultatov, drugi succeeded z rezultati in dopisom', async () => {
    const ana = await seedUser('ana');
    const def = await seedDefinition(ana._id, 'solo');
    single.behaviour.execute = async () => {
      throw new Error('vir je odpovedal');
    };
    const t0 = new Date('2026-10-19T10:05:00Z');
    const first = await runScannerTick(env(), logger(), t0);
    expect(first?.executedRunIds).toHaveLength(1);
    expect((await ScannerRunModel.findById(first!.executedRunIds[0]).lean())?.status).toBe('failed');
    expect(await ScannerResultModel.countDocuments()).toBe(0);
    expect(await ScannerNotificationModel.countDocuments()).toBe(0);
    expect((await ScannerDefinitionModel.findById(def._id).lean())?.status).toMatchObject({ lastOutcome: 'failed', message: 'vir je odpovedal', lastSuccessAt: null });

    single.behaviour.execute = reconcileOutcome([{ identity: 'a', title: 'A', amount: 5 }]);
    const second = await runScannerTick(env(), logger(), new Date('2026-10-19T11:05:00Z'));
    expect(second?.executedRunIds).toHaveLength(1);
    const run = await ScannerRunModel.findById(second!.executedRunIds[0]).lean();
    expect(run?.status).toBe('succeeded');
    expect(run?.counters).toMatchObject({ new: 1, notificationsPending: 0, notificationsSuppressed: 1 });
    expect(await ScannerResultModel.countDocuments()).toBe(1);
    expect(await ScannerNotificationModel.countDocuments({ runId: run!._id })).toBe(1);
    expect((await ScannerDefinitionModel.findById(def._id).lean())?.status).toMatchObject({ lastOutcome: 'ok' });
  });

  it('skener, izbrisan MED zagonom → cancelled, rezultati pobrisani, dopisov ni', async () => {
    const ana = await seedUser('ana');
    const def = await seedDefinition(ana._id, 'solo');
    single.behaviour.execute = async (ctx) => {
      const outcome = await reconcileOutcome([{ identity: 'a', title: 'A', amount: 5 }])(ctx);
      await ScannerDefinitionModel.deleteOne({ _id: def._id });
      return outcome;
    };
    const now = new Date();
    const { runId } = await requestManualRun(env(), { kind: 'definition', type: 'solo', definitionId: String(def._id), ownerId: String(ana._id) }, ACTOR, now);
    const run = await executeRun(runId, env(), logger(), now);
    expect(run?.status).toBe('cancelled');
    expect(run?.runErrors[0]?.code).toBe('definition-deleted');
    expect(await ScannerResultModel.countDocuments()).toBe(0);
    expect(await ScannerNotificationModel.countDocuments()).toBe(0);
  });

  it('napaka pri sestavljanju dopisov ne izgubi rezultatov in zagon je partial z razlogom', async () => {
    const ana = await seedUser('ana');
    await seedDefinition(ana._id, 'solo');
    single.behaviour.execute = async (ctx) => {
      const outcome = await reconcileOutcome([{ identity: 'a', title: 'A', amount: 5 }])(ctx);
      // Dogodek s pokvarjenim prejemnikom: sestavljanje vrže (neveljaven ObjectId).
      return { ...outcome, events: [{ ...outcome.events[0]!, definitionId: 'ni-objectid' }] };
    };
    const tick = await runScannerTick(env(), logger(), new Date('2026-10-19T10:05:00Z'));
    const run = await ScannerRunModel.findById(tick!.executedRunIds[0]).lean();
    expect(run?.status).toBe('partial');
    expect(run?.runErrors[0]?.code).toBe('notifications');
    expect(await ScannerResultModel.countDocuments()).toBe(1);
  });
});

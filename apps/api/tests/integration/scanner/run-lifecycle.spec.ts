import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { clearTestDb, startTestDb, stopTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { loadEnv } from '../../../src/platform/config/env.js';
import { getLogger } from '../../../src/platform/logging/logger.js';
import { ScannerRunModel } from '../../../src/platform/scanner/models/scanner-run.model.js';
import { ScannerNotificationModel } from '../../../src/platform/scanner/models/scanner-notification.model.js';
import { ScannerDefinitionModel } from '../../../src/platform/scanner/models/scanner-definition.model.js';
import { resetScannerTypesForTests } from '../../../src/platform/scanner/registry.js';
import { executeRun } from '../../../src/platform/scanner/services/run-executor.service.js';
import { requestManualRun, resetUnavailableLogForTests, scheduleDueRuns } from '../../../src/platform/scanner/services/scheduler.service.js';
import { runScannerTick, stopScannerSchedulerForTests } from '../../../src/platform/scanner/services/tick.js';
import { getOrCreateTypeSettings } from '../../../src/platform/scanner/services/type-settings.service.js';
import type { AnyScannerType } from '../../../src/platform/scanner/types.js';
import { mockType, okOutcome, seedDefinition, seedUser, type MockTypeHandle } from './_helpers.js';

// FR-013, FR-016, FR-018, FR-020 (US1, US5): termini tipov in skenerjev, zapore, prekinitev,
// preklic, sočasnost, neregistriran tip — vse z MOCK tipi, brez letov.

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterAll(stopTestDb);

let batch: MockTypeHandle;
let single: MockTypeHandle;
const ACTOR = new Types.ObjectId().toString();
const env = () => loadEnv();
const logger = () => getLogger(loadEnv());

beforeEach(() => {
  resetScannerTypesForTests();
  resetUnavailableLogForTests();
  batch = mockType('mock', 'batch');
  single = mockType('solo', 'single');
});
afterEach(async () => {
  stopScannerSchedulerForTests();
  await clearTestDb();
});

describe('urnik tipa (batch)', () => {
  it('dva sočasna poskusa ustvarita EN zagon za isti termin (E11000) s ključem z obsegom', async () => {
    const now = new Date('2026-10-17T05:30:00Z'); // 07:30 lokalno → zapadel termin 06:00
    const [a, b] = await Promise.all([scheduleDueRuns(env(), logger(), now), scheduleDueRuns(env(), logger(), now)]);
    expect(a + b).toBe(1);
    const runs = await ScannerRunModel.find().lean();
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ scannerType: 'mock', slotKey: 'schedule:type:mock:2026-10-17T06:00+02:00', scope: { kind: 'type' }, trigger: 'schedule' });
    expect((await getOrCreateTypeSettings(batch.type as AnyScannerType)).lastScheduledSlotAt?.toISOString()).toBe('2026-10-17T04:00:00.000Z');
    expect(await scheduleDueRuns(env(), logger(), new Date('2026-10-17T06:00:00Z'))).toBe(0);
  });

  it('tik: termin → zagon → execute tipa klican; drugi tik v isti uri nič', async () => {
    const now = new Date('2026-10-17T05:30:00Z');
    const t1 = await runScannerTick(env(), logger(), now);
    expect(t1?.scheduled).toBe(1);
    expect(t1?.executedRunIds).toHaveLength(1);
    expect(batch.calls).toHaveLength(1);
    expect(batch.calls[0]?.definitionId).toBeNull();
    expect((await ScannerRunModel.findById(t1!.executedRunIds[0]).lean())?.status).toBe('succeeded');
    const t2 = await runScannerTick(env(), logger(), new Date(now.getTime() + 60_000));
    expect(t2).toMatchObject({ scheduled: 0, executedRunIds: [] });
  });

  it('ročni zagon obsega, ki teče → 409; drug obseg je sprejet', async () => {
    const now = new Date();
    await ScannerRunModel.create({
      scannerType: 'mock',
      scope: { kind: 'type' },
      slotKey: 'manual:running',
      trigger: 'manual',
      status: 'running',
      createdAt: now,
      startedAt: now,
      heartbeatAt: now,
      expiresAt: new Date(now.getTime() + 86_400_000),
    });
    await expect(requestManualRun(env(), { kind: 'type', type: 'mock' }, ACTOR, now)).rejects.toMatchObject({ status: 409 });
    const ana = await seedUser('ana');
    const def = await seedDefinition(ana._id, 'solo');
    await expect(requestManualRun(env(), { kind: 'definition', type: 'solo', definitionId: String(def._id), ownerId: String(ana._id) }, ACTOR, now)).resolves.toBeTruthy();
    await expect(requestManualRun(env(), { kind: 'type', type: 'neznan' }, ACTOR, now)).rejects.toMatchObject({ status: 400 });
  });
});

describe('urnik skenerja (single)', () => {
  it('vklopljena definicija dobi zagon z obsegom definicije; izklopljena ne; tip dobi definicijo v ctx', async () => {
    const ana = await seedUser('ana');
    const on = await seedDefinition(ana._id, 'solo', { name: 'Vklopljen' });
    await seedDefinition(ana._id, 'solo', { name: 'Izklopljen', enabled: false });
    const now = new Date('2026-10-17T05:30:00Z');
    const tick = await runScannerTick(env(), logger(), now);
    // +1: batch tip `mock` ob istem terminu dobi svoj zagon tipa; tu štejemo zagon definicije.
    expect(tick?.scheduled).toBe(2);
    expect(await ScannerRunModel.countDocuments({ 'scope.kind': 'definition' })).toBe(1);
    const run = await ScannerRunModel.findOne({ 'scope.definitionId': on._id }).lean();
    expect(run).toMatchObject({ scannerType: 'solo', slotKey: `schedule:def:${String(on._id)}:2026-10-17T07:00+02:00`, status: 'succeeded' });
    expect(single.calls).toEqual([{ runId: String(run!._id), definitionId: String(on._id) }]);
    expect((await ScannerDefinitionModel.findById(on._id).lean())?.schedule.lastScheduledSlotAt?.toISOString()).toBe('2026-10-17T05:00:00.000Z');
    expect((await ScannerDefinitionModel.findById(on._id).lean())?.status).toMatchObject({ lastOutcome: 'ok', lastRunId: run!._id });
  });

  it('dva skenerja z lastnima urnikoma v istem tiku → dva zagona, zaporedno; napaka prvega ne ustavi drugega', async () => {
    const ana = await seedUser('ana');
    const a = await seedDefinition(ana._id, 'solo', { name: 'A' });
    const b = await seedDefinition(ana._id, 'solo', { name: 'B' });
    single.behaviour.execute = async (ctx) => {
      if (ctx.definition?.id === String(a._id)) throw new Error('vir je odpovedal');
      return okOutcome({ definitions: [{ definitionId: ctx.definition!.id, ownerId: ctx.definition!.userId, outcome: 'ok', message: null }] });
    };
    const tick = await runScannerTick(env(), logger(), new Date('2026-10-17T05:30:00Z'));
    expect(await ScannerRunModel.countDocuments({ 'scope.kind': 'definition' })).toBe(2);
    expect(tick?.executedRunIds).toHaveLength(3); // + zagon batch tipa `mock`
    const runA = await ScannerRunModel.findOne({ 'scope.definitionId': a._id }).lean();
    const runB = await ScannerRunModel.findOne({ 'scope.definitionId': b._id }).lean();
    expect(runA?.status).toBe('failed');
    expect(runA?.runErrors[0]).toMatchObject({ code: 'unexpected', message: 'vir je odpovedal' });
    expect(runB?.status).toBe('succeeded');
    expect((await ScannerDefinitionModel.findById(a._id).lean())?.status).toMatchObject({ lastOutcome: 'failed', message: 'vir je odpovedal' });
    expect((await ScannerDefinitionModel.findById(b._id).lean())?.status.lastOutcome).toBe('ok');
  });

  it('definicija neregistriranega ali izklopljenega tipa nima zagona; zabeleženo enkrat', async () => {
    const ana = await seedUser('ana');
    await seedDefinition(ana._id, 'izginuli');
    mockType('ugasnjen', 'single', { enabled: false });
    await seedDefinition(ana._id, 'ugasnjen');
    const now = new Date('2026-10-17T05:30:00Z');
    // Edini zagon je zagon batch tipa `mock`; za definiciji tipov `izginuli` in `ugasnjen` ga ni.
    expect(await scheduleDueRuns(env(), logger(), now)).toBe(1);
    expect(await scheduleDueRuns(env(), logger(), new Date(now.getTime() + 60_000))).toBe(0);
    expect(await ScannerRunModel.countDocuments({ 'scope.kind': 'definition' })).toBe(0);
  });

  it('skener, izbrisan med čakanjem zagona, konča kot cancelled brez klica tipa', async () => {
    const ana = await seedUser('ana');
    const def = await seedDefinition(ana._id, 'solo');
    const now = new Date();
    const { runId } = await requestManualRun(env(), { kind: 'definition', type: 'solo', definitionId: String(def._id), ownerId: String(ana._id) }, ACTOR, now);
    await ScannerDefinitionModel.deleteOne({ _id: def._id });
    const run = await executeRun(runId, env(), logger(), now);
    expect(run?.status).toBe('cancelled');
    expect(single.calls).toHaveLength(0);
  });
});

describe('prekinitev, preklic, sočasnost', () => {
  it('running brez utripa → interrupted; termin je pokrit in se ne ponovi', async () => {
    const slot = new Date('2026-10-17T04:00:00Z');
    const stale = await ScannerRunModel.create({
      scannerType: 'mock',
      scope: { kind: 'type' },
      slotKey: 'schedule:type:mock:2026-10-17T06:00+02:00',
      trigger: 'schedule',
      status: 'running',
      scheduledFor: slot,
      createdAt: slot,
      startedAt: slot,
      heartbeatAt: new Date(slot.getTime() + 60_000),
      expiresAt: new Date(slot.getTime() + 86_400_000),
    });
    await getOrCreateTypeSettings(batch.type as AnyScannerType);
    const { ScannerTypeSettingsModel } = await import('../../../src/platform/scanner/models/scanner-type-settings.model.js');
    await ScannerTypeSettingsModel.updateOne({ type: 'mock' }, { $set: { lastScheduledSlotAt: slot } });

    const tick = await runScannerTick(env(), logger(), new Date('2026-10-17T05:00:00Z'));
    expect(tick?.interrupted).toBe(1);
    expect(tick?.scheduled).toBe(0);
    expect((await ScannerRunModel.findById(stale._id).lean())?.status).toBe('interrupted');
    expect(await ScannerRunModel.countDocuments()).toBe(1);
  });

  it('cancelRequested pred izvajanjem → cancelled brez klica tipa; med izvajanjem → tip vidi shouldCancel in dopisov ni', async () => {
    const now = new Date();
    const first = await requestManualRun(env(), { kind: 'type', type: 'mock' }, ACTOR, now);
    await ScannerRunModel.updateOne({ _id: first.runId }, { $set: { cancelRequested: true } });
    expect((await executeRun(first.runId, env(), logger(), now))?.status).toBe('cancelled');
    expect(batch.calls).toHaveLength(0);

    const ana = await seedUser('ana');
    batch.behaviour.execute = async (ctx) => {
      await ScannerRunModel.updateOne({ _id: new Types.ObjectId(ctx.runId) }, { $set: { cancelRequested: true } });
      expect(await ctx.shouldCancel()).toBe(true);
      return okOutcome({
        events: [{ definitionId: String(new Types.ObjectId()), definitionName: 'x', ownerId: String(ana._id), recipients: [String(ana._id)], resultRef: 'r1', changeType: 'NEW', payload: {} }],
      });
    };
    const second = await requestManualRun(env(), { kind: 'type', type: 'mock' }, ACTOR, new Date(now.getTime() + 1000));
    expect((await executeRun(second.runId, env(), logger(), now))?.status).toBe('cancelled');
    expect(await ScannerNotificationModel.countDocuments()).toBe(0);
  });

  it('SCANNER_MAX_CONCURRENT_RUNS=1: tekoč zagon drugega izvoda ustavi izvajanje čakajočih; po koncu se izvedejo', async () => {
    const now = new Date();
    const ana = await seedUser('ana');
    const def = await seedDefinition(ana._id, 'solo');
    const running = await ScannerRunModel.create({
      scannerType: 'mock',
      scope: { kind: 'type' },
      slotKey: 'manual:other-instance',
      trigger: 'manual',
      status: 'running',
      createdAt: now,
      startedAt: now,
      heartbeatAt: now,
      expiresAt: new Date(now.getTime() + 86_400_000),
    });
    const queued = await requestManualRun(env(), { kind: 'definition', type: 'solo', definitionId: String(def._id), ownerId: String(ana._id) }, ACTOR, now);
    const tick = await runScannerTick(env(), logger(), new Date(now.getTime() + 1000));
    expect(tick?.executedRunIds).toEqual([]);
    await running.updateOne({ $set: { status: 'succeeded' } });
    const tick2 = await runScannerTick(env(), logger(), new Date(now.getTime() + 2000));
    expect(tick2?.executedRunIds).toContain(String(queued.runId));
  });

  it('zagon tipa, ki je bil medtem odjavljen, konča failed z razlogom type-unavailable', async () => {
    const now = new Date();
    const { runId } = await requestManualRun(env(), { kind: 'type', type: 'mock' }, ACTOR, now);
    resetScannerTypesForTests();
    const run = await executeRun(runId, env(), logger(), now);
    expect(run?.status).toBe('failed');
    expect(run?.runErrors[0]?.code).toBe('type-unavailable');
  });

  it('tip vrne succeeded z neuspelim skenerjem → zagon je partial; napake tipa so v runErrors', async () => {
    const ana = await seedUser('ana');
    batch.behaviour.execute = async () =>
      okOutcome({
        counters: { seen: 7 },
        definitions: [
          { definitionId: String(new Types.ObjectId()), ownerId: String(ana._id), outcome: 'ok', message: null },
          { definitionId: String(new Types.ObjectId()), ownerId: String(ana._id), outcome: 'failed', message: 'vir ni odgovoril' },
        ],
        errors: [{ code: 'source', message: 'vir ni odgovoril' }],
        extras: { anything: true },
      });
    const now = new Date();
    const { runId } = await requestManualRun(env(), { kind: 'type', type: 'mock' }, ACTOR, now);
    const run = await executeRun(runId, env(), logger(), now);
    expect(run?.status).toBe('partial');
    expect(run?.counters).toMatchObject({ seen: 7, definitions: 2, notificationsPending: 0 });
    expect(run?.definitions).toHaveLength(2);
    expect(run?.extras).toEqual({ anything: true });
    expect(run?.runErrors[0]).toMatchObject({ code: 'source' });
  });
});

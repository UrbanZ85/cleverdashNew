import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { clearTestDb, startTestDb, stopTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { ScannerRunModel } from '../../../src/platform/scanner/models/scanner-run.model.js';
import { ScannerNotificationModel } from '../../../src/platform/scanner/models/scanner-notification.model.js';
import { ScannerTypeSettingsModel } from '../../../src/platform/scanner/models/scanner-type-settings.model.js';
import { FlightProviderStatusModel } from '../../../src/modules/flight-deals/models/flight-provider-status.model.js';
import { UserModel } from '../../../src/modules/auth/models/user.model.js';
import { resetFakeProviderForTests } from '../../../src/modules/flight-deals/providers/fake.provider.js';
import { ryanairProvider } from '../../../src/modules/flight-deals/providers/ryanair.provider.js';
import { claimDailyRun } from '../../../src/modules/flight-deals/services/provider-runner.service.js';
import { registerFlightScannerType } from '../../../src/modules/flight-deals/scanner/index.js';
import { flightScannerType } from '../../../src/modules/flight-deals/scanner/type.js';
import { runScannerTick, stopScannerSchedulerForTests } from '../../../src/platform/scanner/services/tick.js';
import { requestManualRun, scheduleDueRuns } from '../../../src/platform/scanner/services/scheduler.service.js';
import { executeRun } from '../../../src/platform/scanner/services/run-executor.service.js';
import { getOrCreateTypeSettings, updateTypeSchedule } from '../../../src/platform/scanner/services/type-settings.service.js';
import { loadEnv } from '../../../src/platform/config/env.js';
import { getLogger } from '../../../src/platform/logging/logger.js';
import { seedRule } from '../../contract/flight-deals/_helpers.js';
import { ACTOR, FLIGHTS_SCOPE, FLIGHT_TEST_OPTIONS } from './_run.js';

// US6 iz 015 (FR-048, FR-050, FR-051, SC-006) nad jedrom skenerjev (016): sočasni tiki, en termin,
// prekinjen zagon, dohitevanje, sprememba urnika brez restarta, dnevna meja neuradnega vira.
// Pričakovanja so ista kot pred refaktoringom; spremenjeni so uvozi, obseg zagona (`type:flights`)
// in oblika ključa termina (`schedule:type:flights:…`).

beforeAll(async () => {
  setTestEnv({ FLIGHT_FAKE_PROVIDER_ENABLED: 'true' });
  await startTestDb();
  registerFlightScannerType();
});
afterAll(stopTestDb);
afterEach(async () => {
  stopScannerSchedulerForTests();
  resetFakeProviderForTests();
  await clearTestDb();
});

const env = () => loadEnv();
const logger = () => getLogger(loadEnv());
const OPTS = { typeOptions: FLIGHT_TEST_OPTIONS };
const SLOT_PREFIX = 'schedule:type:flights:';

async function user(name: string) {
  return UserModel.create({ keycloakSubject: `kc-${name}`, email: `${name}@example.com`, displayName: name, lastLoginAt: new Date() });
}

function runDoc(overrides: Record<string, unknown>) {
  const now = new Date();
  return {
    scannerType: 'flights',
    scope: { kind: 'type', definitionId: null, ownerId: null },
    trigger: 'manual',
    createdAt: now,
    heartbeatAt: now,
    expiresAt: new Date(now.getTime() + 86_400_000),
    ...overrides,
  };
}

describe('termini in sočasnost (FR-050)', () => {
  it('dva sočasna poskusa ustvarita EN zagon za isti termin (E11000)', async () => {
    const now = new Date('2026-10-17T05:30:00Z'); // 07:30 lokalno → zapadel termin 06:00
    const [a, b] = await Promise.all([scheduleDueRuns(env(), logger(), now), scheduleDueRuns(env(), logger(), now)]);
    expect(a + b).toBe(1);
    const runs = await ScannerRunModel.find().lean();
    expect(runs).toHaveLength(1);
    expect(runs[0]?.slotKey).toBe(`${SLOT_PREFIX}2026-10-17T06:00+02:00`);
    const settings = await getOrCreateTypeSettings(flightScannerType);
    expect(settings.lastScheduledSlotAt?.toISOString()).toBe('2026-10-17T04:00:00.000Z');
    // Isti termin znova: nič.
    expect(await scheduleDueRuns(env(), logger(), new Date('2026-10-17T06:00:00Z'))).toBe(0);
  });

  it('tik: termin → zagon → izveden; drugi tik v isti uri ne naredi nič', async () => {
    const ana = await user('ana');
    await seedRule(String(ana._id));
    const now = new Date('2026-10-17T05:30:00Z');
    const t1 = await runScannerTick(env(), logger(), now, OPTS);
    expect(t1?.scheduled).toBe(1);
    expect(t1?.executedRunIds).toHaveLength(1);
    const run = await ScannerRunModel.findById(t1!.executedRunIds[0]).lean();
    expect(run?.status).toBe('succeeded');
    expect(run?.trigger).toBe('schedule');
    const t2 = await runScannerTick(env(), logger(), new Date(now.getTime() + 60_000), OPTS);
    expect(t2).toMatchObject({ scheduled: 0, executedRunIds: [] });
  });

  it('ročni zagon med tekočim → 409; `queued` ne teče, dokler drug teče', async () => {
    const now = new Date();
    const running = await ScannerRunModel.create(runDoc({ slotKey: 'manual:running', status: 'running', startedAt: now }));
    await expect(requestManualRun(env(), FLIGHTS_SCOPE, ACTOR, now)).rejects.toMatchObject({ status: 409 });
    const queued = await ScannerRunModel.create(runDoc({ slotKey: 'schedule:q', trigger: 'schedule', status: 'queued' }));
    const tick = await runScannerTick(env(), logger(), new Date(now.getTime() + 1000), OPTS);
    expect(tick?.executedRunIds).toEqual([]);
    await running.updateOne({ $set: { status: 'succeeded' } });
    // 016: tik izvede VSE čakajoče zagone (tudi termin, ki ga je medtem ustvaril sam) — čakajoči je med njimi.
    const tick2 = await runScannerTick(env(), logger(), new Date(now.getTime() + 2000), OPTS);
    expect(tick2?.executedRunIds).toContain(String(queued._id));
  });

  it('preklic: cancelRequested ustavi zagon pred primerjavo in brez dopisov', async () => {
    const ana = await user('ana');
    await seedRule(String(ana._id));
    const now = new Date();
    const { runId } = await requestManualRun(env(), FLIGHTS_SCOPE, ACTOR, now);
    await ScannerRunModel.updateOne({ _id: runId }, { $set: { cancelRequested: true } });
    const run = await executeRun(runId, env(), logger(), now, OPTS);
    expect(run?.status).toBe('cancelled');
    expect(await ScannerNotificationModel.countDocuments()).toBe(0);
  });
});

describe('prekinjen zagon in dohitevanje (FR-051)', () => {
  it('running brez utripa → interrupted; termin je pokrit; naslednji termin se izvede; dopisi niso podvojeni', async () => {
    const ana = await user('ana');
    await seedRule(String(ana._id));
    // Zagon ob 06:00, ki je obstal: utrip pred 40 minutami.
    const slot = new Date('2026-10-17T04:00:00Z');
    const stale = await ScannerRunModel.create(
      runDoc({
        slotKey: `${SLOT_PREFIX}2026-10-17T06:00+02:00`,
        trigger: 'schedule',
        status: 'running',
        scheduledFor: slot,
        createdAt: slot,
        startedAt: slot,
        heartbeatAt: new Date(slot.getTime() + 60_000),
        expiresAt: new Date(slot.getTime() + 86_400_000),
      }),
    );
    await getOrCreateTypeSettings(flightScannerType);
    await ScannerTypeSettingsModel.updateOne({ type: 'flights' }, { $set: { lastScheduledSlotAt: slot } });
    // Dopis prekinjenega zagona je bil že poslan.
    await ScannerNotificationModel.create({
      recipientUserId: ana._id,
      runId: stale._id,
      scannerType: 'flights',
      items: [],
      status: 'sent',
      attemptCount: 1,
      sentAt: slot,
      createdAt: slot,
      expiresAt: new Date(slot.getTime() + 86_400_000),
    });

    const now = new Date('2026-10-17T05:00:00Z'); // 07:00 lokalno
    const tick = await runScannerTick(env(), logger(), now, OPTS);
    expect(tick?.interrupted).toBe(1);
    expect((await ScannerRunModel.findById(stale._id).lean())?.status).toBe('interrupted');
    // Termin 06:00 je pokrit (lastScheduledSlotAt), zato se NE ponovi.
    expect(tick?.scheduled).toBe(0);
    expect(await ScannerRunModel.countDocuments({ slotKey: `${SLOT_PREFIX}2026-10-17T06:00+02:00` })).toBe(1);
    expect(await ScannerNotificationModel.countDocuments({ runId: stale._id })).toBe(1);

    // Naslednji termin (18:00) ob 18:30 se izvede.
    const later = await runScannerTick(env(), logger(), new Date('2026-10-17T16:30:00Z'), OPTS);
    expect(later?.scheduled).toBe(1);
    expect(later?.executedRunIds).toHaveLength(1);
    expect((await ScannerRunModel.findById(later!.executedRunIds[0]).lean())?.slotKey).toBe(`${SLOT_PREFIX}2026-10-17T18:00+02:00`);
  });

  it('pending dopisi prekinjenega zagona se pošljejo naprej (ne izgubijo)', async () => {
    const ana = await user('ana');
    const now = new Date();
    const stale = await ScannerRunModel.create(
      runDoc({
        slotKey: 'manual:stale',
        status: 'running',
        createdAt: new Date(now.getTime() - 3_600_000),
        startedAt: new Date(now.getTime() - 3_600_000),
        heartbeatAt: new Date(now.getTime() - 3_600_000),
      }),
    );
    await ScannerNotificationModel.create({
      recipientUserId: ana._id,
      runId: stale._id,
      scannerType: 'flights',
      items: [],
      status: 'pending',
      attemptCount: 0,
      nextAttemptAt: now,
      createdAt: now,
      expiresAt: new Date(now.getTime() + 86_400_000),
    });
    const tick = await runScannerTick(env(), logger(), now, OPTS);
    expect(tick?.interrupted).toBe(1);
    // Brez postavk → zadržan, a OBDELAN (ni ostal pending).
    expect((await ScannerNotificationModel.findOne().lean())?.status).toBe('suppressed');
  });
});

describe('sprememba urnika brez restarta (FR-048, SC-006)', () => {
  it('nov izraz velja ob naslednjem tiku; sprememba ne dohiti terminov starega urnika', async () => {
    const t0 = new Date('2026-10-17T10:00:00Z'); // 12:00 lokalno
    await runScannerTick(env(), logger(), t0, OPTS); // dohiti 06:00 (sveža namestitev)
    expect(await ScannerRunModel.countDocuments()).toBe(1);

    await updateTypeSchedule(flightScannerType, { cronExpression: '*/2 * * * *' }, ACTOR, t0);
    const settings = await getOrCreateTypeSettings(flightScannerType);
    expect(settings).toMatchObject({ preset: 'custom', cronExpression: '*/2 * * * *' });
    expect(settings.lastScheduledSlotAt?.getTime()).toBe(t0.getTime());

    const tick = await runScannerTick(env(), logger(), new Date(t0.getTime() + 2 * 60_000 + 5000), OPTS);
    expect(tick?.scheduled).toBe(1);
    const runs = await ScannerRunModel.find().sort({ createdAt: 1 }).lean();
    expect(runs).toHaveLength(2);
    expect(runs[1]?.slotKey).toBe(`${SLOT_PREFIX}2026-10-17T12:02+02:00`);

    await updateTypeSchedule(flightScannerType, { enabled: false }, ACTOR);
    const off = await runScannerTick(env(), logger(), new Date(t0.getTime() + 10 * 60_000), OPTS);
    expect(off?.scheduled).toBe(0);
  });
});

describe('dnevna meja neuradnega vira (FR-020)', () => {
  it('tretji zagon istega dne vir preskoči; nov dan števec ponastavi', async () => {
    const day1 = new Date('2026-10-17T10:00:00Z');
    expect(await claimDailyRun(ryanairProvider, day1, 2)).toBe(true);
    expect(await claimDailyRun(ryanairProvider, day1, 2)).toBe(true);
    expect(await claimDailyRun(ryanairProvider, day1, 2)).toBe(false);
    const status = await FlightProviderStatusModel.findOne({ providerId: 'ryanair' }).lean();
    expect(status?.requestsToday).toMatchObject({ day: '2026-10-17', count: 2 });
    expect(await claimDailyRun(ryanairProvider, new Date('2026-10-18T10:00:00Z'), 2)).toBe(true);
    expect(await claimDailyRun(ryanairProvider, day1, null)).toBe(true);
  });
});

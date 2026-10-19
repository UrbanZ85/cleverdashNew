import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { clearTestDb, startTestDb, stopTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { FlightSearchRunModel } from '../../../src/modules/flight-deals/models/flight-search-run.model.js';
import { FlightNotificationModel } from '../../../src/modules/flight-deals/models/flight-notification.model.js';
import { FlightSchedulerSettingsModel } from '../../../src/modules/flight-deals/models/flight-scheduler-settings.model.js';
import { FlightProviderStatusModel } from '../../../src/modules/flight-deals/models/flight-provider-status.model.js';
import { UserModel } from '../../../src/modules/auth/models/user.model.js';
import { resetFakeProviderForTests } from '../../../src/modules/flight-deals/providers/fake.provider.js';
import { ryanairProvider } from '../../../src/modules/flight-deals/providers/ryanair.provider.js';
import { claimDailyRun } from '../../../src/modules/flight-deals/services/provider-runner.service.js';
import { runFlightTick, scheduleDueRun, stopFlightDealsSchedulerForTests, requestManualRun } from '../../../src/modules/flight-deals/services/tick.js';
import { executeRun } from '../../../src/modules/flight-deals/services/run-executor.service.js';
import { getOrCreateSchedulerSettings, updateSchedulerSettings } from '../../../src/modules/flight-deals/services/scheduler-settings.service.js';
import { loadEnv } from '../../../src/platform/config/env.js';
import { getLogger } from '../../../src/platform/logging/logger.js';
import { seedRule } from '../../contract/flight-deals/_helpers.js';
import { ACTOR } from './_run.js';

// US6 (FR-048, FR-050, FR-051, SC-006): sočasni tiki, en termin, prekinjen zagon, dohitevanje,
// sprememba urnika brez restarta, dnevna meja neuradnega vira.

beforeAll(async () => {
  setTestEnv({ FLIGHT_FAKE_PROVIDER_ENABLED: 'true' });
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(async () => {
  stopFlightDealsSchedulerForTests();
  resetFakeProviderForTests();
  await clearTestDb();
});

const env = () => loadEnv();
const logger = () => getLogger(loadEnv());
const OPTS = { runner: { retryDelaysMs: [0, 0] } };

async function user(name: string) {
  return UserModel.create({ keycloakSubject: `kc-${name}`, email: `${name}@example.com`, displayName: name, lastLoginAt: new Date() });
}

describe('termini in sočasnost (FR-050)', () => {
  it('dva sočasna poskusa ustvarita EN zagon za isti termin (E11000)', async () => {
    const now = new Date('2026-10-17T05:30:00Z'); // 07:30 lokalno → zapadel termin 06:00
    const [a, b] = await Promise.all([scheduleDueRun(env(), now), scheduleDueRun(env(), now)]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    const runs = await FlightSearchRunModel.find().lean();
    expect(runs).toHaveLength(1);
    expect(runs[0]?.slotKey).toBe('schedule:2026-10-17T06:00+02:00');
    const settings = await getOrCreateSchedulerSettings();
    expect(settings.lastScheduledSlotAt?.toISOString()).toBe('2026-10-17T04:00:00.000Z');
    // Isti termin znova: nič.
    expect(await scheduleDueRun(env(), new Date('2026-10-17T06:00:00Z'))).toBe(false);
  });

  it('tik: termin → zagon → izveden; drugi tik v isti uri ne naredi nič', async () => {
    const ana = await user('ana');
    await seedRule(String(ana._id));
    const now = new Date('2026-10-17T05:30:00Z');
    const t1 = await runFlightTick(env(), logger(), now, OPTS);
    expect(t1).toMatchObject({ scheduled: true });
    expect(t1?.executedRunId).toBeTruthy();
    const run = await FlightSearchRunModel.findById(t1!.executedRunId).lean();
    expect(run?.status).toBe('succeeded');
    expect(run?.trigger).toBe('schedule');
    const t2 = await runFlightTick(env(), logger(), new Date(now.getTime() + 60_000), OPTS);
    expect(t2).toMatchObject({ scheduled: false, executedRunId: null });
  });

  it('ročni zagon med tekočim → 409; `queued` ne teče, dokler drug teče', async () => {
    const now = new Date();
    const running = await FlightSearchRunModel.create({
      slotKey: 'manual:running',
      trigger: 'manual',
      status: 'running',
      createdAt: now,
      startedAt: now,
      heartbeatAt: now,
      expiresAt: new Date(now.getTime() + 86_400_000),
    });
    await expect(requestManualRun(env(), ACTOR, now)).rejects.toMatchObject({ status: 409 });
    await FlightSearchRunModel.create({ slotKey: 'schedule:q', trigger: 'schedule', status: 'queued', createdAt: now, heartbeatAt: now, expiresAt: now });
    const tick = await runFlightTick(env(), logger(), new Date(now.getTime() + 1000), OPTS);
    expect(tick?.executedRunId).toBeNull();
    await running.updateOne({ $set: { status: 'succeeded' } });
    const tick2 = await runFlightTick(env(), logger(), new Date(now.getTime() + 2000), OPTS);
    expect(tick2?.executedRunId).toBeTruthy();
  });

  it('preklic: cancelRequested ustavi zagon pred primerjavo in brez dopisov', async () => {
    const ana = await user('ana');
    await seedRule(String(ana._id));
    const now = new Date();
    const { runId } = await requestManualRun(env(), ACTOR, now);
    await FlightSearchRunModel.updateOne({ _id: runId }, { $set: { cancelRequested: true } });
    const run = await executeRun(runId, env(), logger(), now, OPTS);
    expect(run?.status).toBe('cancelled');
    expect(await FlightNotificationModel.countDocuments()).toBe(0);
  });
});

describe('prekinjen zagon in dohitevanje (FR-051)', () => {
  it('running brez utripa → interrupted; termin je pokrit; naslednji termin se izvede; dopisi niso podvojeni', async () => {
    const ana = await user('ana');
    await seedRule(String(ana._id));
    // Zagon ob 06:00, ki je obstal: utrip pred 40 minutami.
    const slot = new Date('2026-10-17T04:00:00Z');
    const stale = await FlightSearchRunModel.create({
      slotKey: 'schedule:2026-10-17T06:00+02:00',
      trigger: 'schedule',
      status: 'running',
      scheduledFor: slot,
      createdAt: slot,
      startedAt: slot,
      heartbeatAt: new Date(slot.getTime() + 60_000),
      expiresAt: new Date(slot.getTime() + 86_400_000),
    });
    await FlightSchedulerSettingsModel.updateOne({}, { $set: { lastScheduledSlotAt: slot } }, { upsert: true });
    await getOrCreateSchedulerSettings();
    // Dopis prekinjenega zagona je bil že poslan.
    await FlightNotificationModel.create({
      recipientUserId: ana._id,
      runId: stale._id,
      items: [],
      status: 'sent',
      attemptCount: 1,
      sentAt: slot,
      createdAt: slot,
      expiresAt: new Date(slot.getTime() + 86_400_000),
    });

    const now = new Date('2026-10-17T05:00:00Z'); // 07:00 lokalno
    const tick = await runFlightTick(env(), logger(), now, OPTS);
    expect(tick?.interrupted).toBe(1);
    expect((await FlightSearchRunModel.findById(stale._id).lean())?.status).toBe('interrupted');
    // Termin 06:00 je pokrit (lastScheduledSlotAt), zato se NE ponovi.
    expect(tick?.scheduled).toBe(false);
    expect(await FlightSearchRunModel.countDocuments({ slotKey: 'schedule:2026-10-17T06:00+02:00' })).toBe(1);
    expect(await FlightNotificationModel.countDocuments({ runId: stale._id })).toBe(1);

    // Naslednji termin (18:00) ob 18:30 se izvede.
    const later = await runFlightTick(env(), logger(), new Date('2026-10-17T16:30:00Z'), OPTS);
    expect(later?.scheduled).toBe(true);
    expect(later?.executedRunId).toBeTruthy();
    expect((await FlightSearchRunModel.findById(later!.executedRunId).lean())?.slotKey).toBe('schedule:2026-10-17T18:00+02:00');
  });

  it('pending dopisi prekinjenega zagona se pošljejo naprej (ne izgubijo)', async () => {
    const ana = await user('ana');
    const now = new Date();
    const stale = await FlightSearchRunModel.create({
      slotKey: 'manual:stale',
      trigger: 'manual',
      status: 'running',
      createdAt: new Date(now.getTime() - 3_600_000),
      startedAt: new Date(now.getTime() - 3_600_000),
      heartbeatAt: new Date(now.getTime() - 3_600_000),
      expiresAt: new Date(now.getTime() + 86_400_000),
    });
    await FlightNotificationModel.create({
      recipientUserId: ana._id,
      runId: stale._id,
      items: [],
      status: 'pending',
      attemptCount: 0,
      nextAttemptAt: now,
      createdAt: now,
      expiresAt: new Date(now.getTime() + 86_400_000),
    });
    const tick = await runFlightTick(env(), logger(), now, OPTS);
    expect(tick?.interrupted).toBe(1);
    // Brez postavk → zadržan, a OBDELAN (ni ostal pending).
    expect((await FlightNotificationModel.findOne().lean())?.status).toBe('suppressed');
  });
});

describe('sprememba urnika brez restarta (FR-048, SC-006)', () => {
  it('nov izraz velja ob naslednjem tiku; sprememba ne dohiti terminov starega urnika', async () => {
    const t0 = new Date('2026-10-17T10:00:00Z'); // 12:00 lokalno
    await runFlightTick(env(), logger(), t0, OPTS); // dohiti 06:00 (sveža namestitev)
    expect(await FlightSearchRunModel.countDocuments()).toBe(1);

    await updateSchedulerSettings({ cronExpression: '*/2 * * * *' }, ACTOR, t0);
    const settings = await getOrCreateSchedulerSettings();
    expect(settings).toMatchObject({ preset: 'custom', cronExpression: '*/2 * * * *' });
    expect(settings.lastScheduledSlotAt?.getTime()).toBe(t0.getTime());

    const tick = await runFlightTick(env(), logger(), new Date(t0.getTime() + 2 * 60_000 + 5000), OPTS);
    expect(tick?.scheduled).toBe(true);
    const runs = await FlightSearchRunModel.find().sort({ createdAt: 1 }).lean();
    expect(runs).toHaveLength(2);
    expect(runs[1]?.slotKey).toBe('schedule:2026-10-17T12:02+02:00');

    await updateSchedulerSettings({ enabled: false }, ACTOR);
    const off = await runFlightTick(env(), logger(), new Date(t0.getTime() + 10 * 60_000), OPTS);
    expect(off?.scheduled).toBe(false);
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

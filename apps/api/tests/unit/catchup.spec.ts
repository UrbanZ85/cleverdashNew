import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';
import { startTestDb, stopTestDb, clearTestDb } from '../setup/mongo-memory.js';
import { setTestEnv } from '../setup/test-env.js';
import { enableAutomationForUser } from '../setup/enable-automation.js';

// US10, Story 10, quickstart.md §4 primer 11: znotraj maxDelayMinutes se akcija izvede;
// izven tega okna se označi `missed`, NE tiho preskoči.

const { mockSend } = vi.hoisted(() => ({ mockSend: vi.fn() }));
vi.mock('firebase-admin', () => ({
  default: {
    initializeApp: vi.fn(() => ({ messaging: () => ({ send: mockSend }) })),
    credential: { applicationDefault: vi.fn(() => ({})) },
  },
}));

const { runTick, resetTickStepsForTests, stopSchedulerForTests } = await import('../../src/modules/time-tracking/scheduler.js');
const { registerSchedulerSteps, resetSchedulerStepsRegistrationForTests } = await import(
  '../../src/modules/time-tracking/scheduler-steps.js'
);
const { getClockPortal, resetClockPortalForTests } = await import('../../src/modules/time-tracking/clock-portal/index.js');
const { loadEnv } = await import('../../src/platform/config/env.js');
const { getLogger } = await import('../../src/platform/logging/logger.js');
const { TrackingProfileModel } = await import('../../src/modules/time-tracking/models/tracking-profile.model.js');
const { TrackingLocationModel } = await import('../../src/modules/time-tracking/models/tracking-location.model.js');
const { RemoteSessionModel } = await import('../../src/modules/time-tracking/models/remote-session.model.js');
const { PlannedActionModel } = await import('../../src/modules/time-tracking/models/planned-action.model.js');
const { NotificationRecordModel } = await import('../../src/platform/notifications/notification-record.model.js');

type FakeClockPortal = InstanceType<
  typeof import('../../src/modules/time-tracking/clock-portal/fake-clock-portal.js').FakeClockPortal
>;

beforeAll(async () => {
  setTestEnv({ DRY_RUN: 'false' });
  await startTestDb();
});
afterEach(() => {
  mockSend.mockReset();
  resetClockPortalForTests();
  resetTickStepsForTests();
  resetSchedulerStepsRegistrationForTests();
  stopSchedulerForTests();
  return clearTestDb();
});
afterAll(stopTestDb);

async function seedProfileAndLocation(maxDelayMinutes: number) {
  const userId = new Types.ObjectId().toString();
  const session = await RemoteSessionModel.create({
    userId,
    name: 's',
    cookieName: 'x',
    cookieValue: 'y',
    cookieDomain: 'e.test',
  });
  const location = await TrackingLocationModel.create({
    userId,
    name: 'l',
    url: 'https://e.test',
    sessionId: session._id,
    coordinateTemplate: { latitude: '46.0_1', longitude: '14.0_1' },
  });
  const profile = await TrackingProfileModel.create({
    userId,
    name: 'p',
    daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
    locationId: location._id,
    mode: 'AUTO',
    actions: [{ actionName: 'Prijava na delo', localTime: '06:00:00', order: 1 }],
    maxDelayMinutes,
  });
  // Dve stikali: brez osebnega vklopa korak za obdelavo zapadlih to akcijo preskoči.
  await enableAutomationForUser(userId);
  return { profile, location };
}

describe('Dohitevanje po izpadu — znotraj maxDelayMinutes (US10)', () => {
  it('akcija, zamujena za manj kot maxDelayMinutes, se izvede', async () => {
    mockSend.mockResolvedValue('id');
    const { profile, location } = await seedProfileAndLocation(90);
    const scheduledAt = new Date(Date.now() - 30 * 60_000); // 30 min nazaj, meja je 90 min
    const localDate = new Date().toISOString().slice(0, 10);
    await PlannedActionModel.create({
      userId: profile.userId,
      localDate,
      profileId: profile._id,
      locationId: location._id,
      actionName: 'Prijava na delo',
      actionOrder: 1,
      scheduledAt,
      baseLocalTime: '06:00:00',
      mode: 'AUTO',
      state: 'due',
    });

    const env = loadEnv();
    const portal = getClockPortal(env, getLogger(env)) as FakeClockPortal;
    portal.setAvailableActions(['Prijava na delo']);

    registerSchedulerSteps();
    await runTick(env, getLogger(env));

    const updated = await PlannedActionModel.findOne({ profileId: profile._id }).lean();
    expect(updated?.state).toBe('succeeded');
  });
});

describe('Dohitevanje po izpadu — izven maxDelayMinutes (US10)', () => {
  it('akcija, zamujena za več kot maxDelayMinutes, postane missed BREZ poskusa klika', async () => {
    const { profile, location } = await seedProfileAndLocation(90);
    const scheduledAt = new Date(Date.now() - 120 * 60_000); // 120 min nazaj, meja je 90 min
    const localDate = new Date().toISOString().slice(0, 10);
    await PlannedActionModel.create({
      userId: profile.userId,
      localDate,
      profileId: profile._id,
      locationId: location._id,
      actionName: 'Prijava na delo',
      actionOrder: 1,
      scheduledAt,
      baseLocalTime: '06:00:00',
      mode: 'AUTO',
      state: 'due',
    });

    const env = loadEnv();
    const portal = getClockPortal(env, getLogger(env)) as FakeClockPortal;
    portal.setAvailableActions(['Prijava na delo']); // OFF_DUTY — če bi kliknil, bi uspel; NE SME poskusiti

    registerSchedulerSteps();
    await runTick(env, getLogger(env));

    const updated = await PlannedActionModel.findOne({ profileId: profile._id }).lean();
    expect(updated?.state).toBe('missed');
    // Dokaz, da NI poskusil klikniti: FakeClockPortal availableActions se ne bi smel spremeniti.
    const reading = await portal.readState({
      url: '',
      latitude: 0,
      longitude: 0,
      cookieName: '',
      cookieValue: '',
      cookieDomain: '',
    });
    expect(reading.availableActions).toEqual(['Prijava na delo']); // nespremenjeno

    const notification = await NotificationRecordModel.findOne({}).lean();
    expect(notification?.deliveryStatus).toBe('suppressed'); // ni registriranih naprav v testu, a zapis obstaja
  });
});

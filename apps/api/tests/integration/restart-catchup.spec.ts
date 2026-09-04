import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { startTestDb, stopTestDb, clearTestDb } from '../setup/mongo-memory.js';
import { setTestEnv } from '../setup/test-env.js';
import { enableAutomationForUser } from '../setup/enable-automation.js';

// US10, quickstart.md §4 primer 11 / edge case v spec.md: restart sredi dneva, ko so
// nekatere akcije dneva že izvedene, druge še ne — po ponovnem zagonu se obdelajo samo
// tiste, ki so zares zapadle ali čakajo; že izvedene ostanejo NEDOTAKNJENE.

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
const { UserModel } = await import('../../src/modules/auth/models/user.model.js');

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

describe('Restart sredi dneva — dohitevanje brez izgube (US10)', () => {
  it('že uspešna akcija ostane nedotaknjena, čakajoča se izvede ob "ponovnem zagonu" (naslednjem runTick)', async () => {
    mockSend.mockResolvedValue('id');
    // 004: RemoteSession/TrackingLocation/TrackingProfile so zdaj osebni podatek (userId
    // obvezen, data-model.md) — createApp() ne ustvari več začetnega uporabnika (FR-018).
    const user = await UserModel.create({
      keycloakSubject: 'kc-sub-restart-catchup-test',
      email: 'admin@example.com',
      displayName: 'Test uporabnik',
    });
    const session = await RemoteSessionModel.create({
      userId: user._id,
      name: 's',
      cookieName: 'x',
      cookieValue: 'y',
      cookieDomain: 'e.test',
    });
    const location = await TrackingLocationModel.create({
      userId: user._id,
      name: 'l',
      url: 'https://e.test',
      sessionId: session._id,
      coordinateTemplate: { latitude: '46.0_1', longitude: '14.0_1' },
    });
    const profile = await TrackingProfileModel.create({
      userId: user._id,
      name: 'p',
      daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
      locationId: location._id,
      mode: 'AUTO',
      actions: [
        { actionName: 'Prijava na delo', localTime: '06:00:00', order: 1 },
        { actionName: 'Konec dela', localTime: '14:00:00', order: 2 },
      ],
    });
    // Dve stikali: brez osebnega vklopa tik čakajoče akcije ne dohiti.
    await enableAutomationForUser(user._id);

    const localDate = new Date().toISOString().slice(0, 10);
    const alreadyDone = await PlannedActionModel.create({
      userId: user._id,
      localDate,
      profileId: profile._id,
      locationId: location._id,
      actionName: 'Prijava na delo',
      actionOrder: 1,
      scheduledAt: new Date(Date.now() - 3600_000),
      baseLocalTime: '06:00:00',
      mode: 'AUTO',
      state: 'succeeded', // "izveden PRED restartom"
      completedAt: new Date(Date.now() - 3500_000),
      source: 'schedule',
    });
    const pending = await PlannedActionModel.create({
      userId: user._id,
      localDate,
      profileId: profile._id,
      locationId: location._id,
      actionName: 'Konec dela',
      actionOrder: 2,
      scheduledAt: new Date(Date.now() - 60_000), // zapadla, a "sistem se je ravnokar zagnal"
      baseLocalTime: '14:00:00',
      mode: 'AUTO',
      state: 'due',
    });

    const env = loadEnv();
    const portal = getClockPortal(env, getLogger(env)) as FakeClockPortal;
    portal.setAvailableActions(['Malica', 'Konec dela']); // ON_DUTY — "Konec dela" je smiselna, "Prijava na delo" ne bi bila

    // Simulira "ponovni zagon": startScheduler kliče runTick() enkrat takoj ob zagonu,
    // preden setInterval sploh začne teči — to je natanko ta klic.
    registerSchedulerSteps();
    await runTick(env, getLogger(env));

    const stillDone = await PlannedActionModel.findById(alreadyDone._id).lean();
    expect(stillDone?.state).toBe('succeeded'); // nedotaknjeno
    expect(stillDone?.completedAt?.getTime()).toBe(alreadyDone.completedAt!.getTime()); // isti čas, ni bilo ponovno obdelano

    const caughtUp = await PlannedActionModel.findById(pending._id).lean();
    expect(caughtUp?.state).toBe('succeeded'); // dohiteno, ne izgubljeno
  });
});

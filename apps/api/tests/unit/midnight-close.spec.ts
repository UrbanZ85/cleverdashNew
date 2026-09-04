import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { startTestDb, stopTestDb, clearTestDb } from '../setup/mongo-memory.js';
import { setTestEnv } from '../setup/test-env.js';

// US10, FR-045 (clarify seja 2026-08-20), quickstart.md §4 primer 12: akcija sredi niza
// ponovnih poskusov ob prehodu čez polnoč se TAKOJ zapre kot `missed`, brez poskusa po
// polnoči — ne glede na to, koliko poskusov ji je še ostalo.

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
const { ActionRecordModel } = await import('../../src/modules/time-tracking/models/action-record.model.js');

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

describe('Polnočno zaprtje prekine sredi niza ponovnih poskusov (FR-045)', () => {
  it('akcija iz VČERAJŠNJEGA localDate, še v stanju "due", postane missed — brez klika', async () => {
    const userId = '000000000000000000000003';
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
      actions: [{ actionName: 'Konec dela', localTime: '23:55:00', order: 1 }],
    });

    const yesterday = new Date(Date.now() - 24 * 60 * 60_000).toISOString().slice(0, 10);
    const planned = await PlannedActionModel.create({
      userId,
      localDate: yesterday, // "včeraj" — ne glede na dejanski trenutni datum je to VEDNO < danes
      profileId: profile._id,
      locationId: location._id,
      actionName: 'Konec dela',
      actionOrder: 1,
      scheduledAt: new Date(Date.now() - 60_000),
      baseLocalTime: '23:55:00',
      mode: 'AUTO',
      state: 'due', // sredi niza ponovnih poskusov — še ima poskusov na voljo
      attemptCount: 1,
      nextAttemptAt: new Date(Date.now() + 60_000), // naslednji poskus bi bil čez minuto — a dan je že mimo
    });

    const env = loadEnv();
    const portal = getClockPortal(env, getLogger(env)) as FakeClockPortal;
    portal.setAvailableActions(['Konec dela']); // klik bi uspel, ČE bi se zgodil — NE SME se

    registerSchedulerSteps();
    await runTick(env, getLogger(env));

    const updated = await PlannedActionModel.findById(planned._id).lean();
    expect(updated?.state).toBe('missed');

    // Dokaz, da ni bilo poskusa klika po polnoči: stanje FakeClockPortal ostane nespremenjeno.
    const reading = await portal.readState({
      url: '',
      latitude: 0,
      longitude: 0,
      cookieName: '',
      cookieValue: '',
      cookieDomain: '',
    });
    expect(reading.availableActions).toEqual(['Konec dela']);

    const record = await ActionRecordModel.findOne({ plannedActionId: planned._id }).lean();
    expect(record?.finalOutcome).toBe('missed');
  });
});

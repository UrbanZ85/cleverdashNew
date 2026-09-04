import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { startTestDb, stopTestDb, clearTestDb } from '../setup/mongo-memory.js';
import { setTestEnv } from '../setup/test-env.js';

// Story 4 (US4), quickstart.md §4 primer 10: v REMIND_ONLY sistem NIKOLI ne pokliče
// `performAction` — samo `readState` in po potrebi opozori.

const { mockSend } = vi.hoisted(() => ({ mockSend: vi.fn() }));
vi.mock('firebase-admin', () => ({
  default: {
    initializeApp: vi.fn(() => ({ messaging: () => ({ send: mockSend }) })),
    credential: { applicationDefault: vi.fn(() => ({})) },
  },
}));

const { checkReminder } = await import('../../src/modules/time-tracking/services/reminder-service.js');
const { FakeClockPortal } = await import('../../src/modules/time-tracking/clock-portal/fake-clock-portal.js');
const { TrackingProfileModel } = await import('../../src/modules/time-tracking/models/tracking-profile.model.js');
const { TrackingLocationModel } = await import('../../src/modules/time-tracking/models/tracking-location.model.js');
const { RemoteSessionModel } = await import('../../src/modules/time-tracking/models/remote-session.model.js');
const { PlannedActionModel } = await import('../../src/modules/time-tracking/models/planned-action.model.js');
const { ActionAttemptModel } = await import('../../src/modules/time-tracking/models/action-attempt.model.js');
const { NotificationRecordModel } = await import('../../src/platform/notifications/notification-record.model.js');
const { DeviceModel } = await import('../../src/platform/notifications/device.model.js');

beforeAll(async () => {
  setTestEnv();
  await startTestDb();
});
afterEach(() => {
  mockSend.mockReset();
  return clearTestDb();
});
afterAll(stopTestDb);

async function seedProfileAndAction(overrides: { graceMinutes?: number; maxReminders?: number } = {}) {
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
    daysOfWeek: [1, 2, 3, 4, 5],
    locationId: location._id,
    mode: 'REMIND_ONLY',
    actions: [{ actionName: 'Prijava na delo', localTime: '06:00:00', order: 1 }],
    graceMinutes: overrides.graceMinutes ?? 10,
    maxReminders: overrides.maxReminders ?? 3,
    reminderIntervalMinutes: 10,
  });
  const scheduledAt = new Date(Date.now() - 15 * 60_000); // 15 min v preteklosti — grace (10 min) je potekel
  const action = await PlannedActionModel.create({
    userId,
    localDate: '2026-08-18',
    profileId: profile._id,
    locationId: location._id,
    actionName: 'Prijava na delo',
    actionOrder: 1,
    scheduledAt,
    baseLocalTime: '06:00:00',
    mode: 'REMIND_ONLY',
    state: 'due',
  });
  return { profile, action, location };
}

describe('checkReminder — nikoli ne klikne (US4)', () => {
  it('po strpnem obdobju pošlje opozorilo, NE klikne ničesar', async () => {
    mockSend.mockResolvedValue('id');
    await DeviceModel.create({ userId: '000000000000000000000001', pushToken: 't', platform: 'android', channels: ['reminders'] });
    const { profile, action } = await seedProfileAndAction();

    const portal = new FakeClockPortal();
    portal.setAvailableActions(['Prijava na delo']); // OFF_DUTY — pričakovano po akciji je ON_DUTY, torej ni opravljeno

    const outcome = await checkReminder(action, profile, portal);
    expect(outcome).toBe('reminded');

    // NIKOLI performAction: FakeClockPortal ne spremeni availableActions, ker checkReminder
    // kliče samo readState — preverimo posredno: ni ustvarjenega ActionAttempt (ti nastanejo
    // samo prek performAction/executor poti, ne prek readState).
    const attempts = await ActionAttemptModel.find({}).lean();
    expect(attempts).toHaveLength(0);

    const updated = await PlannedActionModel.findById(action._id).lean();
    expect(updated?.state).toBe('due'); // ostane odprto, ni "succeeded"
    expect(updated?.reminderCount).toBe(1);

    const notification = await NotificationRecordModel.findOne({ type: 'reminder' }).lean();
    expect(notification?.deliveryStatus).toBe('sent');
  });

  it('pred iztekom strpnega obdobja ne opozori', async () => {
    const { profile, action } = await seedProfileAndAction({ graceMinutes: 60 }); // scheduledAt je 15 min nazaj, grace 60 min → še ni doseženo
    const portal = new FakeClockPortal();
    portal.setAvailableActions(['Prijava na delo']);

    const outcome = await checkReminder(action, profile, portal);
    expect(outcome).toBe('not_yet_due');
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('preneha opozarjati po doseženi meji ponovitev (FR-041)', async () => {
    const { profile, action } = await seedProfileAndAction({ maxReminders: 1 });
    action.reminderCount = 1;
    await action.save();

    const portal = new FakeClockPortal();
    portal.setAvailableActions(['Prijava na delo']);

    const outcome = await checkReminder(action, profile, portal);
    expect(outcome).toBe('reminders_exhausted');
    expect(mockSend).not.toHaveBeenCalled();
  });
});

describe('checkReminder — zunanja izvedba ustavi opozarjanje (US4, FR-042)', () => {
  it('če je uporabnik akcijo opravil sam, naslednje branje jo zazna in ustavi opozarjanje', async () => {
    const { profile, action } = await seedProfileAndAction();
    const portal = new FakeClockPortal();
    portal.setAvailableActions(['Malica', 'Konec dela']); // ON_DUTY — natanko pričakovano po "Prijava na delo"

    const outcome = await checkReminder(action, profile, portal);
    expect(outcome).toBe('completed_externally');
    expect(mockSend).not.toHaveBeenCalled();

    const updated = await PlannedActionModel.findById(action._id).lean();
    expect(updated?.state).toBe('succeeded');
  });
});

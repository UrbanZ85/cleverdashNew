import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { startTestDb, stopTestDb, clearTestDb } from '../setup/mongo-memory.js';
import { setTestEnv } from '../setup/test-env.js';
import { enableAutomationForUser } from '../setup/enable-automation.js';

// US2, Independent Test: profil v AUTO, FakeClockPortal, počakaj do tika, preveri
// izvedbo+verifikacijo+potrditveno obvestilo — brez čakanja na pravi 30-sekundni interval,
// tik se pokliče neposredno (`runTick`), enako kot bi ga poklical `setInterval`.
// firebase-admin je zamenjan (isti vzorec kot notification-latency.spec.ts), ker testno
// okolje nima pravih poverilnic (člen IV) in ker prava dostava ni predmet tega testa.

const { mockSend } = vi.hoisted(() => ({ mockSend: vi.fn() }));

vi.mock('firebase-admin', () => ({
  default: {
    initializeApp: vi.fn(() => ({ messaging: () => ({ send: mockSend }) })),
    credential: { applicationDefault: vi.fn(() => ({})) },
  },
}));

const { createApp } = await import('../../src/main.js');
const { getClockPortal, resetClockPortalForTests } = await import('../../src/modules/time-tracking/clock-portal/index.js');
const { loadEnv } = await import('../../src/platform/config/env.js');
const { getLogger } = await import('../../src/platform/logging/logger.js');
const { runTick, resetTickStepsForTests, stopSchedulerForTests } = await import('../../src/modules/time-tracking/scheduler.js');
const { registerSchedulerSteps, resetSchedulerStepsRegistrationForTests } = await import(
  '../../src/modules/time-tracking/scheduler-steps.js'
);
const { TrackingProfileModel } = await import('../../src/modules/time-tracking/models/tracking-profile.model.js');
const { TrackingLocationModel } = await import('../../src/modules/time-tracking/models/tracking-location.model.js');
const { RemoteSessionModel } = await import('../../src/modules/time-tracking/models/remote-session.model.js');
const { PlannedActionModel } = await import('../../src/modules/time-tracking/models/planned-action.model.js');
const { NotificationRecordModel } = await import('../../src/platform/notifications/notification-record.model.js');
const { DeviceModel } = await import('../../src/platform/notifications/device.model.js');
const { UserModel } = await import('../../src/modules/auth/models/user.model.js');
const { ljubljanaCalendarDay } = await import('../../src/domain/timezone.js');

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

describe('AUTO tik: načrt → zapadla akcija → izvedba → verifikacija → potrditev (US2)', () => {
  it('izvede in preveri akcijo ob načrtovanem času, pošlje potrditveno obvestilo', async () => {
    mockSend.mockResolvedValue('message-id');
    await createApp(); // poveže usmerjevalnik, registrira zdravstveno razširitev
    registerSchedulerSteps();

    // 004: createApp() ne ustvari več začetnega uporabnika (bootstrap-user.service.ts je
    // odstranjen, FR-018) — uporabnika za ta test ustvarimo neposredno.
    const user = await UserModel.create({
      keycloakSubject: 'kc-sub-auto-tick-test',
      email: 'admin@example.com',
      displayName: 'Test uporabnik',
    });
    await DeviceModel.create({ userId: user._id, pushToken: 'test-token', platform: 'android', channels: ['confirmation'] });

    const session = await RemoteSessionModel.create({
      userId: user._id,
      name: 'seja',
      cookieName: 'x',
      cookieValue: 'y',
      cookieDomain: 'example.test',
    });
    const location = await TrackingLocationModel.create({
      userId: user._id,
      name: 'lokacija',
      url: 'https://example.test',
      sessionId: session._id,
      coordinateTemplate: { latitude: '46.0_1', longitude: '14.0_1' },
    });
    // Načrtovan čas TIK PRED "zdaj", da je ob prvem tiku že zapadel.
    const pastTime = new Date(Date.now() - 60_000);
    const localTimeHHMMSS = ljubljanaTimeOf(pastTime);
    const profile = await TrackingProfileModel.create({
      userId: user._id,
      name: 'profil',
      daysOfWeek: [1, 2, 3, 4, 5, 6, 7], // vsak dan, da test ni odvisen od dneva zagona
      locationId: location._id,
      mode: 'AUTO',
      actions: [{ actionName: 'Prijava na delo', localTime: localTimeHHMMSS, jitterSeconds: 0, order: 1 }],
    });
    // Dve stikali: SCHEDULER_ENABLED je v testnem okolju vklopljen, osebno stikalo pa je
    // privzeto izklopljeno — tik brez njega ne sestavi načrta in ne izvede ničesar.
    await enableAutomationForUser(user._id);

    const env = loadEnv();
    const portal = getClockPortal(env, getLogger(env)) as FakeClockPortal;
    portal.setAvailableActions(['Prijava na delo']);

    const result = await runTick(env, getLogger(env));
    expect(result?.plansBuilt).toBeGreaterThan(0);
    expect(result?.actionsProcessed).toBe(1);

    const localDate = ljubljanaCalendarDay(new Date());
    const planned = await PlannedActionModel.findOne({ localDate, profileId: profile._id }).lean();
    expect(planned?.state).toBe('succeeded');
    expect(planned?.source).toBe('schedule');

    const notification = await NotificationRecordModel.findOne({ type: 'confirmation' }).lean();
    expect(notification).not.toBeNull();
    expect(notification?.deliveryStatus).toBe('sent');
    expect(mockSend).toHaveBeenCalledTimes(1);
  });
});

// Člen VI: padla akcija ne sme naslednje narediti videti opravljene. Iz prakse: "Malica"
// trikrat ni bila potrjena, ura je ostala ON_DUTY — kar je hkrati pričakovano stanje PO
// "Konec malice" — in "Konec malice" je bil zabeležen kot `already_done`, čeprav v evidenci
// delodajalca ni bilo ne začetka ne konca malice.
describe('AUTO tik: already_done za akcijo s padlo predhodnico (člen VI)', () => {
  it('akcije ne razglasi za opravljeno, ampak za zamujeno, z razlogom in obvestilom', async () => {
    mockSend.mockResolvedValue('message-id');
    await createApp();
    registerSchedulerSteps();

    const user = await UserModel.create({
      keycloakSubject: 'kc-sub-broken-chain-test',
      email: 'admin@example.com',
      displayName: 'Test uporabnik',
    });
    const session = await RemoteSessionModel.create({
      userId: user._id,
      name: 'seja',
      cookieName: 'x',
      cookieValue: 'y',
      cookieDomain: 'example.test',
    });
    const location = await TrackingLocationModel.create({
      userId: user._id,
      name: 'lokacija',
      url: 'https://example.test',
      sessionId: session._id,
      coordinateTemplate: { latitude: '46.0_1', longitude: '14.0_1' },
    });

    const profile = await TrackingProfileModel.create({
      userId: user._id,
      name: 'profil',
      daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
      locationId: location._id,
      mode: 'AUTO',
      // Ena sama priložnost, da je veriga pretrgana že v tem tiku (sicer bi Malica čakala
      // na ponovni poskus in "Konec malice" bi bil povsem legitimno še odprt).
      maxAttempts: 1,
      actions: [
        { actionName: 'Malica', localTime: ljubljanaTimeOf(new Date(Date.now() - 120_000)), jitterSeconds: 0, order: 2 },
        {
          actionName: 'Konec malice',
          localTime: ljubljanaTimeOf(new Date(Date.now() - 60_000)),
          jitterSeconds: 0,
          order: 3,
        },
      ],
    });
    await enableAutomationForUser(user._id);

    const env = loadEnv();
    const portal = getClockPortal(env, getLogger(env)) as FakeClockPortal;
    // Ura je na delu, klik na Malico pa ne učinkuje — stanje ostane ON_DUTY.
    portal.setAvailableActions(['Malica', 'Konec dela']);
    portal.scriptClickNoEffect('Malica');

    const result = await runTick(env, getLogger(env));
    expect(result?.actionsProcessed).toBe(2);

    const localDate = ljubljanaCalendarDay(new Date());
    const malica = await PlannedActionModel.findOne({
      localDate,
      profileId: profile._id,
      actionName: 'Malica',
    }).lean();
    const konecMalice = await PlannedActionModel.findOne({
      localDate,
      profileId: profile._id,
      actionName: 'Konec malice',
    }).lean();

    expect(malica?.state).toBe('failed');
    expect(konecMalice?.state).toBe('missed');
    expect(konecMalice?.failureReason).toContain('Malica');

    const notice = await NotificationRecordModel.findOne({
      dedupeKey: `missed:${String(konecMalice?._id)}`,
    }).lean();
    expect(notice?.body).toContain('Malica');
  });
});

function ljubljanaTimeOf(date: Date): string {
  const iso = date.toLocaleTimeString('en-GB', { timeZone: 'Europe/Ljubljana', hour12: false });
  return iso.length === 8 ? iso : `0${iso}`;
}

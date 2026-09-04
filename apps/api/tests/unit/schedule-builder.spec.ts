import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { startTestDb, stopTestDb, clearTestDb } from '../setup/mongo-memory.js';
import { buildPlanForDay } from '../../src/modules/time-tracking/services/schedule-builder.service.js';
import { TrackingProfileModel } from '../../src/modules/time-tracking/models/tracking-profile.model.js';
import { TrackingLocationModel } from '../../src/modules/time-tracking/models/tracking-location.model.js';
import { RemoteSessionModel } from '../../src/modules/time-tracking/models/remote-session.model.js';
import { PlannedActionModel } from '../../src/modules/time-tracking/models/planned-action.model.js';
import { HolidayModel } from '../../src/modules/time-tracking/models/holiday.model.js';
import { CalendarDayModel } from '../../src/modules/time-tracking/models/calendar-day.model.js';

// FR-003: dejanski čas se izračuna ENKRAT ob sestavljanju in je od takrat nespremenjen.
// FR-034/docs/legacy-engine.md §4.3: upsert na (localDate, profileId, actionName) je
// idempotenten — drugi klic ne podvoji.

beforeAll(startTestDb);
afterAll(stopTestDb);
afterEach(clearTestDb);

let seedCounter = 0;

async function seedProfile(
  overrides: Partial<Record<string, unknown>> = {},
  locationOverrides: Partial<Record<string, unknown>> = {},
) {
  const n = ++seedCounter;
  // 004: userId je obvezen na vseh treh (data-model.md) — pravi UserModel dokument tu ni
  // potreben, ker Mongoose referenčne integritete ne preverja (samo required ObjectId).
  const userId = (overrides.userId as string | undefined) ?? new Types.ObjectId().toString();
  const session = await RemoteSessionModel.create({
    userId,
    name: `seja-${n}`,
    cookieName: 'x',
    cookieValue: 'y',
    cookieDomain: 'example.test',
  });
  const location = await TrackingLocationModel.create({
    userId,
    name: `lokacija-${n}`,
    url: 'https://example.test',
    sessionId: session._id,
    coordinateTemplate: { latitude: '46.0_1', longitude: '14.0_1' },
    ...locationOverrides,
  });
  return TrackingProfileModel.create({
    userId,
    name: 'profil',
    daysOfWeek: [1, 2, 3, 4, 5],
    locationId: location._id,
    mode: 'AUTO',
    actions: [
      { actionName: 'Prijava na delo', localTime: '06:00:00', jitterSeconds: 0, order: 1 },
      { actionName: 'Konec dela', localTime: '14:00:00', jitterSeconds: 0, order: 2 },
    ],
    ...overrides,
  });
}

describe('buildPlanForDay', () => {
  it('na delovni dan ustvari eno PlannedAction na akcijo, z enkrat izračunanim časom', async () => {
    const profile = await seedProfile();
    const localDate = '2026-08-18'; // torek

    const result = await buildPlanForDay(profile, localDate);
    expect(result.created).toBe(2);
    expect(result.dayStatus).toBe('workday');

    const actions = await PlannedActionModel.find({ localDate, profileId: profile._id }).lean();
    expect(actions).toHaveLength(2);
    const login = actions.find((a) => a.actionName === 'Prijava na delo');
    expect(login?.scheduledAt.toISOString()).toBe('2026-08-18T04:00:00.000Z'); // poletni čas, +02:00
  });

  it('drugi klic za isti dan je idempotenten — brez podvajanja (docs/legacy-engine.md §4.3)', async () => {
    const profile = await seedProfile();
    const localDate = '2026-08-18';

    const first = await buildPlanForDay(profile, localDate);
    expect(first.created).toBe(2);

    const second = await buildPlanForDay(profile, localDate);
    expect(second.created).toBe(0);
    expect(second.skipped).toBe(2);

    const actions = await PlannedActionModel.find({ localDate, profileId: profile._id }).lean();
    expect(actions).toHaveLength(2);
  });

  it('na vikend ne ustvari nobene akcije, a CalendarDay se zapiše', async () => {
    const profile = await seedProfile();
    const localDate = '2026-08-16'; // nedelja, ni v daysOfWeek

    const result = await buildPlanForDay(profile, localDate);
    expect(result.created).toBe(0);
    expect(result.dayStatus).toBe('weekend');

    const day = await CalendarDayModel.findOne({ localDate, profileId: profile._id }).lean();
    expect(day?.status).toBe('weekend');

    const actions = await PlannedActionModel.find({ localDate, profileId: profile._id }).lean();
    expect(actions).toHaveLength(0);
  });

  it('praznik prepreči ustvarjanje akcij na sicer delovni dan', async () => {
    const profile = await seedProfile();
    const localDate = '2026-08-18';
    await HolidayModel.create({ date: localDate, name: 'Preizkusni praznik', isWorkFree: true });

    const result = await buildPlanForDay(profile, localDate);
    expect(result.created).toBe(0);
    expect(result.dayStatus).toBe('holiday');
  });

  it('drug profil za isti dan NI preskočen, ker je prvi že ustvaril vnose (docs/legacy-engine.md §4.3 — globalni namesto profilnega preverjanja podvajanja)', async () => {
    const profileA = await seedProfile({ name: 'Agenda' });
    const profileB = await seedProfile({ name: 'Doma' });
    const localDate = '2026-08-18'; // torek

    const resultA = await buildPlanForDay(profileA, localDate);
    expect(resultA.created).toBe(2);

    // Legacy bug: `SchedulerTimes.findOne({ scheduledDate: today })` brez profila bi tu
    // vrnil vnos od profileA in profileB v celoti preskočil (tiha izguba).
    const resultB = await buildPlanForDay(profileB, localDate);
    expect(resultB.created).toBe(2);

    const actionsA = await PlannedActionModel.find({ localDate, profileId: profileA._id }).lean();
    const actionsB = await PlannedActionModel.find({ localDate, profileId: profileB._id }).lean();
    expect(actionsA).toHaveLength(2);
    expect(actionsB).toHaveLength(2);
  });

  it('mode OFF: CalendarDay se izračuna, a PlannedAction se NE ustvari (FR-008)', async () => {
    const profile = await seedProfile({ mode: 'OFF' });
    const localDate = '2026-08-18';

    const result = await buildPlanForDay(profile, localDate);
    expect(result.created).toBe(0);

    const day = await CalendarDayModel.findOne({ localDate, profileId: profile._id }).lean();
    expect(day?.status).toBe('workday'); // koledarski status je neodvisen od mode

    const actions = await PlannedActionModel.find({ localDate, profileId: profile._id }).lean();
    expect(actions).toHaveLength(0);
  });
});

// FR-090: gumb za začetek dela je lastnost lokacije, ne profila. Isti urnik, izveden z druge
// lokacije, pritisne drug gumb — profila ni treba podvajati.
describe('buildPlanForDay in gumb lokacije', () => {
  it('akcija za začetek dela prevzame gumb lokacije, ostale ostanejo nespremenjene', async () => {
    const profile = await seedProfile({}, { startAction: 'Delo od doma' });
    const localDate = '2026-08-18'; // torek

    await buildPlanForDay(profile, localDate);

    const names = (await PlannedActionModel.find({ localDate, profileId: profile._id }).lean())
      .map((a) => a.actionName)
      .sort();
    expect(names).toEqual(['Delo od doma', 'Konec dela']);
  });

  it('sprememba gumba lokacije preimenuje že načrtovano akcijo, namesto da bi jo podvojila', async () => {
    const profile = await seedProfile();
    const localDate = '2026-08-18';

    await buildPlanForDay(profile, localDate);
    const before = await PlannedActionModel.findOne({ localDate, profileId: profile._id, actionName: 'Prijava na delo' }).lean();
    expect(before).not.toBeNull();

    await TrackingLocationModel.updateOne({ _id: profile.locationId }, { startAction: 'Delo na terenu' });
    const result = await buildPlanForDay(profile, localDate);
    expect(result.created).toBe(0);

    const actions = await PlannedActionModel.find({ localDate, profileId: profile._id }).lean();
    expect(actions).toHaveLength(2);
    const start = actions.find((a) => a.actionName === 'Delo na terenu');
    // Preimenovanje na mestu: čas iz prvega sestavljanja ostane, akcija se ne prestavi.
    expect(start?.scheduledAt.toISOString()).toBe(before!.scheduledAt.toISOString());
  });

  it('dve različici začetka dela v istem profilu se zlijeta v eno akcijo, brez trka ob indeks', async () => {
    const profile = await seedProfile(
      {
        actions: [
          { actionName: 'Prijava na delo', localTime: '06:00:00', jitterSeconds: 0, order: 1 },
          { actionName: 'Prihod na delo', localTime: '06:05:00', jitterSeconds: 0, order: 2 },
          { actionName: 'Konec dela', localTime: '14:00:00', jitterSeconds: 0, order: 3 },
        ],
      },
      { startAction: 'Delo od doma' },
    );
    const localDate = '2026-08-18';

    const result = await buildPlanForDay(profile, localDate);
    expect(result.created).toBe(2);
    expect(result.skipped).toBe(1);

    const names = (await PlannedActionModel.find({ localDate, profileId: profile._id }).lean())
      .map((a) => a.actionName)
      .sort();
    expect(names).toEqual(['Delo od doma', 'Konec dela']);
  });
});

import { resolveDayStatus, type AbsencePeriodInput, type CalendarOverrideInput, type HolidayInput } from '../../../domain/calendar.js';
import { computeScheduledInstant } from '../../../domain/scheduling.js';
import type { CalendarDayStatus } from '../../../domain/calendar.js';
import { HolidayModel } from '../models/holiday.model.js';
import { AbsencePeriodModel } from '../models/absence-period.model.js';
import { CalendarOverrideModel } from '../models/calendar-override.model.js';
import { CalendarDayModel } from '../models/calendar-day.model.js';
import { PlannedActionModel } from '../models/planned-action.model.js';
import { TrackingProfileModel } from '../models/tracking-profile.model.js';
import { TrackingLocationModel } from '../models/tracking-location.model.js';
import { isStartAction, resolveActionForLocation, START_ACTIONS } from '../../../domain/clock-state.js';

// research.md §3: sestavljanje načrta je LENOBNO in DOHITEVAJOČE — kliče ga tik za
// [danes, jutri] pri vsakem ciklu (T052) in `POST /time-tracking/rebuild-plan` na zahtevo.
// FR-008: CalendarDay se izračuna NE GLEDE na mode profila; PlannedAction se ustvari samo,
// če je mode != OFF IN je dan delovni.

export interface BuildPlanResult {
  created: number;
  skipped: number;
  dayStatus: CalendarDayStatus;
  reason: string;
}

const ZONE = 'Europe/Ljubljana';

/** Izvožena tudi za `GET /time-tracking/profiles/{id}/preview` (US2 router), da izračun
 * vhodov za `resolveDayStatus` obstaja na enem mestu. `userId` je obvezen (004): brez njega
 * bi odsotnost/izjema uporabnika A z `profileIds: null` ("velja za vse profile") pomotoma
 * vplivala tudi na profile uporabnika B — `holidays` ostane skupen (research.md §5). */
export async function loadCalendarInputs(localDate: string, userId: string): Promise<{
  holidays: HolidayInput[];
  absences: AbsencePeriodInput[];
  overrides: CalendarOverrideInput[];
}> {
  const [holidays, absences, overrides] = await Promise.all([
    HolidayModel.find({ date: localDate }).lean(),
    AbsencePeriodModel.find({ userId, startDate: { $lte: localDate }, endDate: { $gte: localDate } }).lean(),
    CalendarOverrideModel.find({ userId, localDate }).lean(),
  ]);
  return {
    holidays: holidays.map((h) => ({ date: h.date, name: h.name, isWorkFree: h.isWorkFree })),
    absences: absences.map((a) => ({
      type: a.type,
      startDate: a.startDate,
      endDate: a.endDate,
      profileIds: a.profileIds?.map(String) ?? null,
    })),
    overrides: overrides.map((o) => ({
      localDate: o.localDate,
      profileId: o.profileId ? String(o.profileId) : null,
      kind: o.kind,
      note: o.note ?? null,
    })),
  };
}

/** Sestavi (ali ponovno uskladi) načrt enega profila za en dan. Idempotentno: `upsert` na
 * `(localDate, profileId, actionName)` — obstoječih izvedenih akcij ne podvoji in ne
 * prepiše. */
export async function buildPlanForDay(
  profile: InstanceType<typeof TrackingProfileModel>,
  localDate: string,
): Promise<BuildPlanResult> {
  const { holidays, absences, overrides } = await loadCalendarInputs(localDate, String(profile.userId));
  const decision = resolveDayStatus(localDate, String(profile._id), profile.daysOfWeek, {
    holidays,
    absences,
    overrides,
  });

  // FR-008/FR-015: CalendarDay se izračuna NE GLEDE na mode — koledarski pregled in gladek
  // preklop nazaj v AUTO/REMIND_ONLY ne smeta imeti vrzeli.
  await CalendarDayModel.findOneAndUpdate(
    { localDate, profileId: profile._id },
    { userId: profile.userId, status: decision.status, reason: decision.reason, resolvedAt: new Date() },
    { upsert: true },
  );

  const shouldCreateActions = decision.isWorkday && profile.mode !== 'OFF';

  if (!shouldCreateActions) {
    // Dan je postal dela prost (ali profil OFF) PO tem, ko so bile akcije že ustvarjene —
    // prihodnje, še neobdelane akcije se prekličejo (edge case: sprememba koledarja).
    const cancelled = await PlannedActionModel.updateMany(
      { localDate, profileId: profile._id, state: { $in: ['planned', 'due'] } },
      { state: 'cancelled' },
    );
    return { created: 0, skipped: cancelled.modifiedCount, dayStatus: decision.status, reason: decision.reason };
  }

  // FR-090: kateri od štirih gumbov za začetek dela se pritisne, pove LOKACIJA profila, ne
  // profil sam — v načrtu (in od tam v zgodovini in obvestilih) mora stati tisto ime, ki bo
  // res kliknjeno. Lokacije ni mogoče izbrisati, dokler jo profil uporablja (router.ts,
  // DELETE /locations/{id}), zato je `null` tu mogoč samo ob ročnem posegu v bazo — takrat
  // obvelja ime iz profila, kar je isto vedenje kot pred FR-090.
  const location = await TrackingLocationModel.findById(profile.locationId).lean();

  let created = 0;
  let skipped = 0;
  const plannedNames = new Set<string>();
  for (const action of profile.actions.filter((a) => a.enabled)) {
    const actionName = resolveActionForLocation(action.actionName, location?.startAction);
    // Profil z dvema različicama začetka dela (npr. `Prijava na delo` IN `Delo od doma`) se
    // po razrešitvi zlije v isto ime; brez te varovalke bi drugi upsert trčil ob edinstveni
    // indeks (localDate, profileId, actionName) in podrl cel tik.
    if (plannedNames.has(actionName)) {
      skipped += 1;
      continue;
    }
    plannedNames.add(actionName);

    // Gumb lokacije se je spremenil PO tem, ko je bil dan že načrtovan: obstoječa, še
    // neizvedena akcija se preimenuje na mestu. Brez tega bi upsert ustvaril DRUGO akcijo za
    // začetek dela, ta pa bi ob izvedbi našla stanje `ON_DUTY` in obvisela kot "zamujena".
    if (isStartAction(actionName)) {
      await PlannedActionModel.updateOne(
        {
          localDate,
          profileId: profile._id,
          state: { $in: ['planned', 'due'] },
          actionName: { $in: START_ACTIONS.filter((n) => n !== actionName) },
        },
        { $set: { actionName } },
      );
    }

    const { scheduledAt } = computeScheduledInstant(localDate, action.localTime, action.jitterSeconds, ZONE);
    const result = await PlannedActionModel.updateOne(
      { localDate, profileId: profile._id, actionName },
      {
        $setOnInsert: {
          userId: profile.userId,
          localDate,
          profileId: profile._id,
          locationId: profile.locationId,
          actionName,
          actionOrder: action.order,
          scheduledAt,
          baseLocalTime: action.localTime,
          mode: profile.mode,
          state: 'planned',
          source: 'schedule',
        },
      },
      { upsert: true },
    );
    if (result.upsertedCount > 0) created += 1;
    else skipped += 1;
  }

  return { created, skipped, dayStatus: decision.status, reason: decision.reason };
}

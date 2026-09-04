// FR-014: odločitev "ali je ta dan za ta profil delovni" po fiksni prednosti:
// vsiljena izjema (calendarOverrides) > odsotnost > praznik > dan tedna profila.
// Čista funkcija — brez Mongoose, brez omrežja (člen IX). Kliče jo ScheduleBuilder z že
// pridobljenimi podatki iz baze, ne s poizvedbami samimi.

export type CalendarDayStatus =
  | 'workday'
  | 'weekend'
  | 'holiday'
  | 'vacation'
  | 'sick'
  | 'other'
  | 'forced';

export interface CalendarDecision {
  status: CalendarDayStatus;
  reason: string;
  /** `true`, če ScheduleBuilder za ta dan sme ustvariti PlannedAction (workday ALI forced). */
  isWorkday: boolean;
}

export interface HolidayInput {
  date: string; // YYYY-MM-DD
  name: string;
  isWorkFree: boolean;
}

export interface AbsencePeriodInput {
  type: 'vacation' | 'sick' | 'other';
  startDate: string;
  endDate: string; // vključen
  profileIds?: string[] | null; // prazno/null = vsi profili
}

export interface CalendarOverrideInput {
  localDate: string;
  profileId?: string | null; // null = vsi profili
  kind: 'forceWorkday' | 'forceNonWorking';
  note?: string | null;
}

const ISO_WEEKDAY_NAMES = ['', 'ponedeljek', 'torek', 'sreda', 'četrtek', 'petek', 'sobota', 'nedelja'];

function appliesToProfile(profileId: string, targetProfileId?: string | null): boolean {
  return targetProfileId == null || targetProfileId === profileId;
}

function findOverride(
  localDate: string,
  profileId: string,
  overrides: readonly CalendarOverrideInput[],
): CalendarOverrideInput | undefined {
  return overrides.find((o) => o.localDate === localDate && appliesToProfile(profileId, o.profileId));
}

function findAbsence(
  localDate: string,
  profileId: string,
  absences: readonly AbsencePeriodInput[],
): AbsencePeriodInput | undefined {
  return absences.find(
    (a) =>
      localDate >= a.startDate &&
      localDate <= a.endDate &&
      (!a.profileIds || a.profileIds.length === 0 || a.profileIds.includes(profileId)),
  );
}

function findHoliday(localDate: string, holidays: readonly HolidayInput[]): HolidayInput | undefined {
  return holidays.find((h) => h.date === localDate && h.isWorkFree);
}

/**
 * Odloči status enega dne za en profil, po fiksni prednosti FR-014.
 *
 * `calendarOverrides.kind: "forceNonWorking"` je simetrična razširitev `forceWorkday`
 * (isti mehanizem, nasproten učinek) iz data-model.md/contracts — brez lastne uporabniške
 * zgodbe v spec.md (edina zgodba, Story 7, opisuje samo `forceWorkday`), a z jasno,
 * nizko-tvegano semantiko: posamičen dan, ki bi bil sicer delovni, se ročno označi kot
 * prost, ne da bi bil evidentiran kot dopust/bolniška (vrsta `other` prost dan).
 */
export function resolveDayStatus(
  localDate: string,
  profileId: string,
  daysOfWeek: readonly number[],
  data: {
    holidays: readonly HolidayInput[];
    absences: readonly AbsencePeriodInput[];
    overrides: readonly CalendarOverrideInput[];
  },
): CalendarDecision {
  const override = findOverride(localDate, profileId, data.overrides);
  if (override?.kind === 'forceWorkday') {
    return { status: 'forced', reason: override.note ?? 'ročno vsiljen delovni dan', isWorkday: true };
  }
  if (override?.kind === 'forceNonWorking') {
    return { status: 'other', reason: override.note ?? 'ročno označen prost dan', isWorkday: false };
  }

  const absence = findAbsence(localDate, profileId, data.absences);
  if (absence) {
    return { status: absence.type, reason: absenceReason(absence.type), isWorkday: false };
  }

  const holiday = findHoliday(localDate, data.holidays);
  if (holiday) {
    return { status: 'holiday', reason: holiday.name, isWorkday: false };
  }

  const isoWeekday = isoWeekdayOf(localDate);
  if (!daysOfWeek.includes(isoWeekday)) {
    return {
      status: 'weekend',
      reason: `ni v dneh profila (${ISO_WEEKDAY_NAMES[isoWeekday]})`,
      isWorkday: false,
    };
  }

  return { status: 'workday', reason: 'običajen delovni dan profila', isWorkday: true };
}

function absenceReason(type: AbsencePeriodInput['type']): string {
  if (type === 'vacation') return 'dopust';
  if (type === 'sick') return 'bolniška';
  return 'odsotnost';
}

/** ISO dan v tednu (1 = ponedeljek … 7 = nedelja) iz `YYYY-MM-DD`, brez odvisnosti na
 * `Date.getDay()` (0 = nedelja) — glej migracijsko opozorilo v data-model.md. */
function isoWeekdayOf(localDate: string): number {
  const parts = localDate.split('-').map(Number);
  const [year, month, day] = parts;
  if (parts.length !== 3 || year === undefined || month === undefined || day === undefined) {
    throw new Error(`Neveljaven lokalni datum: ${localDate}`);
  }
  // Zeller/`Date.UTC` samo za dan v tednu — datum se NIKOLI ne uporabi za koledarski dan
  // sam (ta ostane niz), samo za izračun dneva v tednu, kar je časovno-pasovno nevtralno.
  const jsDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0 = nedelja
  return jsDay === 0 ? 7 : jsDay;
}

import { TimesheetPresetModel } from '../models/timesheet-preset.model.js';
import { DEFAULT_DAY_SCHEDULE, mergeDaySchedule } from '../domain/schedule.js';
import type { DaySchedule, DayScheduleInput } from '../domain/types.js';

/** Kar modul ve o uporabniku, preden ta karkoli vpiše v obrazec. */
export interface StoredDefaults {
  /** `null` = uporabnik še ni shranil imena; takrat ga MORA prinesti telo zahteve. */
  fullName: string | null;
  weeklyWorkHours: number;
  schedule: DaySchedule;
}

export interface DefaultsPatch {
  fullName?: string | null;
  weeklyWorkHours?: number;
  schedule?: DayScheduleInput;
}

function toStored(doc: {
  fullName?: string | null;
  weeklyWorkHours?: number | null;
  schedule?: DayScheduleInput | null;
} | null): StoredDefaults {
  return {
    fullName: doc?.fullName ?? null,
    weeklyWorkHours: doc?.weeklyWorkHours ?? 40,
    // Tudi shranjen urnik gre skozi zlivanje: zapis iz starejše različice, ki mu manjka
    // kakšen čas, tako ne pusti `undefined` globoko v gradnji preglednice.
    schedule: mergeDaySchedule(doc?.schedule ?? undefined, DEFAULT_DAY_SCHEDULE),
  };
}

export async function readDefaults(userId: string): Promise<StoredDefaults> {
  const doc = await TimesheetPresetModel.findOne({ userId }).lean();
  return toStored(doc);
}

/** Čista zlitev — ločena od zapisa, da usmerjevalnik rezultat preveri PREDEN se shrani.
 * Shranjen urnik z obrnjenimi časi bi pokvaril vsako naslednjo evidenco, ne le tega klica. */
export function mergeDefaults(current: StoredDefaults, patch: DefaultsPatch): StoredDefaults {
  return {
    fullName: patch.fullName === undefined ? current.fullName : (patch.fullName?.trim() || null),
    weeklyWorkHours: patch.weeklyWorkHours ?? current.weeklyWorkHours,
    schedule: mergeDaySchedule(patch.schedule, current.schedule),
  };
}

export async function saveDefaults(userId: string, next: StoredDefaults): Promise<StoredDefaults> {
  await TimesheetPresetModel.updateOne({ userId }, { $set: { ...next, userId } }, { upsert: true });
  return next;
}

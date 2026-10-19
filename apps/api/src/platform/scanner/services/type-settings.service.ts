import { Types } from 'mongoose';
import { badRequest } from '../../errors/problem.js';
import { readUserSummaries, type UserSummary } from '../../users/directory.service.js';
import {
  DEFAULT_TYPE_CRON_EXPRESSION,
  DEFAULT_TYPE_TIMEZONE,
  ScannerTypeSettingsModel,
} from '../models/scanner-type-settings.model.js';
import type { TypeSchedulePatch } from '../domain/definition-input.js';
import { formatSlotLocal, isValidTimezone, nextRun, presetFor, presetForExpression, validateCron } from '../domain/schedule-slots.js';
import { scheduleLabel, typeScheduleLabel } from '../domain/schedule-label.js';
import type { AnyScannerType, SchedulePresetId, TypeScheduleContext } from '../types.js';

// Urnik TIPA (FR-014) — en zapis na tip z batch izvajanjem. Nastane ob prvem branju, privzetek
// da tip (`defaultSchedule`). Sprememba velja ob naslednjem tiku brez restarta — tik bere ta
// zapis vsakič (scheduler.service.ts). Preseljeno iz 015 `scheduler-settings.service.ts`, s
// ključem `type` namesto singletona `'default'`.

export interface TypeSettingsLean {
  _id: Types.ObjectId;
  type: string;
  enabled: boolean;
  preset: SchedulePresetId;
  cronExpression: string;
  timezone: string;
  lastScheduledSlotAt: Date | null;
  updatedBy: Types.ObjectId | null;
  updatedAt: Date;
}

export async function getOrCreateTypeSettings(type: AnyScannerType, now = new Date()): Promise<TypeSettingsLean> {
  const existing = await ScannerTypeSettingsModel.findOne({ type: type.type }).lean<TypeSettingsLean | null>();
  if (existing) return existing;
  const defaults = type.defaultSchedule ?? { preset: 'daily-06-18' as const, cronExpression: DEFAULT_TYPE_CRON_EXPRESSION, timezone: DEFAULT_TYPE_TIMEZONE };
  // `upsert` + `$setOnInsert`: dva sočasna prva klica ne ustvarita dveh zapisov (unikatni `type`).
  await ScannerTypeSettingsModel.updateOne(
    { type: type.type },
    {
      $setOnInsert: {
        type: type.type,
        enabled: true,
        preset: defaults.preset,
        cronExpression: defaults.cronExpression,
        timezone: defaults.timezone,
        lastScheduledSlotAt: null,
        updatedBy: null,
        updatedAt: now,
      },
    },
    { upsert: true },
  );
  const created = await ScannerTypeSettingsModel.findOne({ type: type.type }).lean<TypeSettingsLean | null>();
  if (!created) throw new Error(`Nastavitev urnika za tip "${type.type}" ni bilo mogoče ustvariti.`);
  return created;
}

/**
 * Posodobi urnik tipa. `preset` ≠ `custom` prepiše izraz s prednastavljenim; pri `custom` je izraz
 * obvezen. Izraz in cona se preverita PRED shranjevanjem.
 */
export async function updateTypeSchedule(type: AnyScannerType, patch: TypeSchedulePatch, actorUserId: string, now = new Date()): Promise<TypeSettingsLean> {
  const current = await getOrCreateTypeSettings(type, now);

  let preset: SchedulePresetId = patch.preset ?? current.preset;
  let cronExpression = current.cronExpression;

  if (patch.preset && patch.preset !== 'custom') {
    cronExpression = presetFor(patch.preset).cronExpression ?? current.cronExpression;
  } else if (patch.cronExpression !== undefined) {
    cronExpression = patch.cronExpression.trim().replace(/\s+/g, ' ');
    preset = presetForExpression(cronExpression);
  } else if (patch.preset === 'custom') {
    preset = 'custom';
  }

  const cronError = validateCron(cronExpression);
  if (cronError) throw badRequest(cronError);

  const timezone = patch.timezone ?? current.timezone;
  if (!isValidTimezone(timezone)) throw badRequest(`Časovni pas "${timezone}" ni veljaven (uporabi IANA ime, npr. Europe/Ljubljana).`);

  const enabled = patch.enabled ?? current.enabled;

  // Sprememba izraza ali cone premakne "pokrito do zdaj": sicer bi nov, pogostejši urnik ob
  // naslednjem tiku dohitel termin iz STAREGA dneva, ki ga admin ni mislil.
  const scheduleChanged = cronExpression !== current.cronExpression || timezone !== current.timezone;

  await ScannerTypeSettingsModel.updateOne(
    { type: type.type },
    {
      $set: {
        enabled,
        preset,
        cronExpression,
        timezone,
        updatedBy: new Types.ObjectId(actorUserId),
        updatedAt: now,
        ...(scheduleChanged ? { lastScheduledSlotAt: now } : {}),
      },
    },
  );
  return getOrCreateTypeSettings(type, now);
}

/** Po ustvarjenem zagonu: termin je pokrit. */
export async function markTypeSlot(typeId: string, slot: Date): Promise<void> {
  await ScannerTypeSettingsModel.updateOne(
    { type: typeId, $or: [{ lastScheduledSlotAt: null }, { lastScheduledSlotAt: { $lt: slot } }] },
    { $set: { lastScheduledSlotAt: slot } },
  );
}

/** Urnik tipa v obliki, ki jo tip z lastnimi definicijami dobi v `DefinitionsContext`. */
export function toTypeScheduleContext(settings: TypeSettingsLean, now: Date): TypeScheduleContext {
  const next = settings.enabled ? nextRun(settings.cronExpression, settings.timezone, now) : null;
  return {
    enabled: settings.enabled,
    preset: settings.preset,
    cronExpression: settings.cronExpression,
    timezone: settings.timezone,
    nextRunAt: next,
    label: typeScheduleLabel(settings),
  };
}

export interface TypeScheduleResponse {
  type: string;
  enabled: boolean;
  preset: SchedulePresetId;
  cronExpression: string;
  timezone: string;
  label: string;
  nextRunAt: string | null;
  nextRunLocal: string | null;
  updatedAt: string;
  updatedBy: UserSummary | null;
}

export async function toTypeScheduleResponse(settings: TypeSettingsLean, now = new Date()): Promise<TypeScheduleResponse> {
  const next = settings.enabled ? nextRun(settings.cronExpression, settings.timezone, now) : null;
  const users = settings.updatedBy ? await readUserSummaries([String(settings.updatedBy)]) : new Map<string, UserSummary>();
  return {
    type: settings.type,
    enabled: settings.enabled,
    preset: settings.preset,
    cronExpression: settings.cronExpression,
    timezone: settings.timezone,
    label: scheduleLabel(settings),
    nextRunAt: next ? next.toISOString() : null,
    nextRunLocal: next ? formatSlotLocal(next, settings.timezone) : null,
    updatedAt: settings.updatedAt.toISOString(),
    updatedBy: settings.updatedBy ? (users.get(String(settings.updatedBy)) ?? null) : null,
  };
}

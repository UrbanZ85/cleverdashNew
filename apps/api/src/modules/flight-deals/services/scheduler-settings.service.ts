import { Types } from 'mongoose';
import { badRequest } from '../../../platform/errors/problem.js';
import { readUserSummaries, type UserSummary } from '../../../platform/users/directory.service.js';
import {
  DEFAULT_CRON_EXPRESSION,
  DEFAULT_SCHEDULER_TIMEZONE,
  FlightSchedulerSettingsModel,
  SCHEDULER_SETTINGS_KEY,
} from '../models/flight-scheduler-settings.model.js';
import type { SchedulerPatch } from '../domain/rule-input.js';
import {
  SCHEDULE_PRESETS,
  formatSlotLocal,
  isValidTimezone,
  nextRun,
  presetFor,
  presetForExpression,
  validateCron,
} from '../../../platform/scanner/domain/schedule-slots.js';
import type { SchedulePresetId } from '../domain/types.js';

// Nastavitve urnika (FR-046 do FR-049). En zapis, nastane ob prvem branju. Sprememba velja ob
// naslednjem tiku brez restarta — tik bere ta zapis vsakič (services/tick.ts).

export interface SchedulerSettingsLean {
  _id: Types.ObjectId;
  key: string;
  enabled: boolean;
  preset: SchedulePresetId;
  cronExpression: string;
  timezone: string;
  lastScheduledSlotAt: Date | null;
  updatedBy: Types.ObjectId | null;
  updatedAt: Date;
}

export async function getOrCreateSchedulerSettings(now = new Date()): Promise<SchedulerSettingsLean> {
  const existing = await FlightSchedulerSettingsModel.findOne({ key: SCHEDULER_SETTINGS_KEY }).lean<SchedulerSettingsLean | null>();
  if (existing) return existing;
  // `upsert` + `$setOnInsert`: dva sočasna prva klica ne ustvarita dveh zapisov (unikatni `key`).
  await FlightSchedulerSettingsModel.updateOne(
    { key: SCHEDULER_SETTINGS_KEY },
    {
      $setOnInsert: {
        key: SCHEDULER_SETTINGS_KEY,
        enabled: true,
        preset: 'daily-06-18',
        cronExpression: DEFAULT_CRON_EXPRESSION,
        timezone: DEFAULT_SCHEDULER_TIMEZONE,
        lastScheduledSlotAt: null,
        updatedBy: null,
        updatedAt: now,
      },
    },
    { upsert: true },
  );
  const created = await FlightSchedulerSettingsModel.findOne({ key: SCHEDULER_SETTINGS_KEY }).lean<SchedulerSettingsLean | null>();
  if (!created) throw new Error('Nastavitev urnika ni bilo mogoče ustvariti.');
  return created;
}

/**
 * Posodobi urnik. `preset` ≠ `custom` prepiše izraz s prednastavljenim; pri `custom` je izraz
 * obvezen. Izraz in cona se preverita PRED shranjevanjem (FR-047).
 */
export async function updateSchedulerSettings(patch: SchedulerPatch, actorUserId: string, now = new Date()): Promise<SchedulerSettingsLean> {
  const current = await getOrCreateSchedulerSettings(now);

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

  await FlightSchedulerSettingsModel.updateOne(
    { key: SCHEDULER_SETTINGS_KEY },
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
  return getOrCreateSchedulerSettings(now);
}

/** Po ustvarjenem zagonu: termin je pokrit. */
export async function markSlotScheduled(slot: Date): Promise<void> {
  await FlightSchedulerSettingsModel.updateOne(
    { key: SCHEDULER_SETTINGS_KEY, $or: [{ lastScheduledSlotAt: null }, { lastScheduledSlotAt: { $lt: slot } }] },
    { $set: { lastScheduledSlotAt: slot } },
  );
}

export interface SchedulerResponse {
  enabled: boolean;
  preset: SchedulePresetId;
  cronExpression: string;
  timezone: string;
  nextRunAt: string | null;
  nextRunLocal: string | null;
  presets: Array<{ id: SchedulePresetId; label: string; cronExpression: string }>;
  updatedAt: string;
  updatedBy: UserSummary | null;
}

export async function toSchedulerResponse(settings: SchedulerSettingsLean, now = new Date()): Promise<SchedulerResponse> {
  const next = settings.enabled ? nextRun(settings.cronExpression, settings.timezone, now) : null;
  const users = settings.updatedBy ? await readUserSummaries([String(settings.updatedBy)]) : new Map<string, UserSummary>();
  return {
    enabled: settings.enabled,
    preset: settings.preset,
    cronExpression: settings.cronExpression,
    timezone: settings.timezone,
    nextRunAt: next ? next.toISOString() : null,
    nextRunLocal: next ? formatSlotLocal(next, settings.timezone) : null,
    presets: SCHEDULE_PRESETS.filter((p) => p.cronExpression !== null).map((p) => ({
      id: p.id,
      label: p.label,
      cronExpression: p.cronExpression!,
    })),
    updatedAt: settings.updatedAt.toISOString(),
    updatedBy: settings.updatedBy ? (users.get(String(settings.updatedBy)) ?? null) : null,
  };
}

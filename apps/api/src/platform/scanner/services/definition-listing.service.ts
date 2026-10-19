import { Types } from 'mongoose';
import type { Env } from '../../config/env.js';
import { ScannerDefinitionModel } from '../models/scanner-definition.model.js';
import { formatSlotLocal, nextRun } from '../domain/schedule-slots.js';
import { scheduleLabel } from '../domain/schedule-label.js';
import { findScannerType, listScannerTypes } from '../registry.js';
import type { AnyScannerType, ScannerSummary, ScheduleInfo } from '../types.js';
import { listOwnDefinitions, type DefinitionLean } from './definition-access.service.js';
import { genericResultReader } from './result-store.service.js';
import { callerCovers, scopesOf } from './type-info.service.js';
import { getOrCreateTypeSettings, toTypeScheduleContext } from './type-settings.service.js';

// Seznam skenerjev vseh tipov (FR-008, FR-040, research.md §3): generične definicije iz
// `scannerdefinitions` + vrstice, ki jih prispevajo tipi z lastnimi definicijami (leti), v ISTI
// obliki (`ScannerSummary`). Brez N+1: en `count` na tip, en seznam na tip.

export interface SummaryRow extends ScannerSummary {
  typeLabel: string;
  typeAvailable: boolean;
}

function scheduleInfoOf(def: DefinitionLean, now: Date, runnable: boolean): ScheduleInfo {
  const next = runnable && def.enabled ? nextRun(def.schedule.cronExpression, def.schedule.timezone, now) : null;
  return {
    mode: def.schedule.mode,
    preset: def.schedule.preset,
    cronExpression: def.schedule.cronExpression,
    timezone: def.schedule.timezone,
    label: scheduleLabel(def.schedule),
    nextRunAt: next,
    nextRunLocal: next ? formatSlotLocal(next, def.schedule.timezone) : null,
  };
}

export function toGenericSummary(def: DefinitionLean, type: AnyScannerType | null, env: Env, now: Date, resultCount: number): SummaryRow {
  const typeAvailable = type !== null && type.isEnabled(env);
  return {
    id: String(def._id),
    type: def.type,
    typeLabel: type?.label ?? def.type,
    name: def.name,
    enabled: def.enabled,
    schedule: scheduleInfoOf(def, now, typeAvailable),
    lastRun: def.status.lastRunAt && def.status.lastOutcome ? { at: def.status.lastRunAt, outcome: def.status.lastOutcome, message: def.status.message } : null,
    lastSuccessAt: def.status.lastSuccessAt,
    resultCount,
    typeAvailable,
    links: { edit: `/scanners/${String(def._id)}/edit`, results: `/scanners/${String(def._id)}` },
    createdAt: def.createdAt,
    updatedAt: def.updatedAt,
  };
}

/** Števec rezultatov po definicijah — generična shramba ali bralnik tipa. */
async function countResults(defs: readonly DefinitionLean[]): Promise<Map<string, number>> {
  const byType = new Map<string, DefinitionLean[]>();
  for (const d of defs) byType.set(d.type, [...(byType.get(d.type) ?? []), d]);
  const out = new Map<string, number>();
  for (const [typeId, rows] of byType) {
    const type = findScannerType(typeId);
    const reader = type?.resultReader ?? genericResultReader;
    const counts = await reader.count(rows.map((r) => String(r._id)));
    for (const [id, n] of counts) out.set(id, n);
  }
  return out;
}

export async function listSummariesForUser(userId: string, callerScopes: readonly string[], env: Env, now: Date, typeFilter?: string): Promise<SummaryRow[]> {
  const defs = await listOwnDefinitions(userId, typeFilter);
  const counts = await countResults(defs);
  const rows: SummaryRow[] = defs.map((d) => toGenericSummary(d, findScannerType(d.type), env, now, counts.get(String(d._id)) ?? 0));

  for (const type of listScannerTypes()) {
    if (!type.definitions || !type.isEnabled(env)) continue;
    if (typeFilter && type.type !== typeFilter) continue;
    if (!callerCovers(callerScopes, scopesOf(type).read)) continue;
    const settings = await getOrCreateTypeSettings(type, now);
    const contributed = await type.definitions.listForUser(userId, { env, now, typeSchedule: toTypeScheduleContext(settings, now) });
    for (const s of contributed) rows.push({ ...s, typeLabel: type.label, typeAvailable: true });
  }

  return rows.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}

/** Ena vrstica po id-ju — generična definicija ali tista, ki jo prispeva tip (za rezultate in zagone). */
export async function findSummaryForUser(userId: string, id: string, callerScopes: readonly string[], env: Env, now: Date): Promise<{ row: SummaryRow; type: AnyScannerType | null; generic: DefinitionLean | null } | null> {
  if (!Types.ObjectId.isValid(id)) return null;
  const generic = await ScannerDefinitionModel.findOne({ _id: new Types.ObjectId(id), userId: new Types.ObjectId(userId) }).lean<DefinitionLean | null>();
  if (generic) {
    const type = findScannerType(generic.type);
    const counts = await countResults([generic]);
    return { row: toGenericSummary(generic, type, env, now, counts.get(String(generic._id)) ?? 0), type, generic };
  }
  for (const type of listScannerTypes()) {
    if (!type.definitions || !type.isEnabled(env)) continue;
    if (!callerCovers(callerScopes, scopesOf(type).read)) continue;
    const settings = await getOrCreateTypeSettings(type, now);
    const found = await type.definitions.findForUser(userId, id, { env, now, typeSchedule: toTypeScheduleContext(settings, now) });
    if (found) return { row: { ...found, typeLabel: type.label, typeAvailable: true }, type, generic: null };
  }
  return null;
}

/** `ScannerSummary` iz pogodbe: časi kot ISO. */
export function toSummaryResponse(row: SummaryRow) {
  return {
    ...row,
    schedule: { ...row.schedule, nextRunAt: row.schedule.nextRunAt ? row.schedule.nextRunAt.toISOString() : null },
    lastRun: row.lastRun ? { ...row.lastRun, at: row.lastRun.at.toISOString() } : null,
    lastSuccessAt: row.lastSuccessAt ? row.lastSuccessAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

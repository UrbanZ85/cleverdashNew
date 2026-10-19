import { Types } from 'mongoose';
import type { Env } from '../../config/env.js';
import type { Logger } from '../../logging/logger.js';
import { ProblemError } from '../../errors/problem.js';
import { ScannerDefinitionModel } from '../models/scanner-definition.model.js';
import { ScannerRunModel } from '../models/scanner-run.model.js';
import { latestDueSlot, scopedSlotKey } from '../domain/schedule-slots.js';
import { enabledScannerTypes, findScannerType } from '../registry.js';
import { auditRunInterrupted, auditTypeUnavailable } from '../scanner.audit.js';
import type { RunStatus } from '../types.js';
import { getOrCreateTypeSettings, markTypeSlot } from './type-settings.service.js';

// Termini in zagoni (FR-013, FR-016, FR-018, FR-020) — research.md §4. Vsak tik vpraša bazo:
//  1. kateri `running` zagon je brez utripa → `interrupted`;
//  2. kateri termini so zapadli in nimajo zagona → `queued` z unikatnim `slotKey` (dvojnik med
//     izvodi pade na indeksu). Dva vira terminov: urnik TIPA (batch tipi, `ScannerTypeSettings`)
//     in urnik SKENERJA (single tipi, `ScannerDefinition.schedule`).
// Preseljeno iz 015 `tick.ts`; posplošeno na obseg (tip ali definicija).

export type RunScope = { kind: 'type'; type: string } | { kind: 'definition'; type: string; definitionId: string; ownerId: string };

export interface RunLean {
  _id: Types.ObjectId;
  scannerType: string;
  scope: { kind: 'type' | 'definition'; definitionId: Types.ObjectId | null; ownerId: Types.ObjectId | null };
  slotKey: string;
  trigger: 'schedule' | 'manual';
  requestedBy: Types.ObjectId | null;
  status: RunStatus;
  scheduledFor: Date | null;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  heartbeatAt: Date;
  cancelRequested: boolean;
  counters: Record<string, number>;
  definitions: Array<{ definitionId: Types.ObjectId; ownerId: Types.ObjectId; outcome: 'ok' | 'failed' | 'skipped'; message: string | null }>;
  extras: unknown;
  runErrors: Array<{ at: Date; definitionId?: Types.ObjectId | null; code: string; message: string }>;
}

export const FINISHED_STATUSES: readonly RunStatus[] = ['succeeded', 'partial', 'failed', 'cancelled', 'interrupted'];

export function runExpiry(env: Pick<Env, 'SCANNER_RUN_RETENTION_DAYS'>, now: Date): Date {
  return new Date(now.getTime() + env.SCANNER_RUN_RETENTION_DAYS * 86_400_000);
}

/** Filter, ki ujame vse zagone ISTEGA obsega — en obseg ne sme teči dvakrat. */
export function scopeFilter(scope: RunScope): Record<string, unknown> {
  return scope.kind === 'type'
    ? { scannerType: scope.type, 'scope.kind': 'type' }
    : { 'scope.kind': 'definition', 'scope.definitionId': new Types.ObjectId(scope.definitionId) };
}

function scopeDoc(scope: RunScope) {
  return scope.kind === 'type'
    ? { kind: 'type', definitionId: null, ownerId: null }
    : { kind: 'definition', definitionId: new Types.ObjectId(scope.definitionId), ownerId: new Types.ObjectId(scope.ownerId) };
}

export async function markInterruptedRuns(env: Pick<Env, 'SCANNER_RUN_STALE_MINUTES'>, logger: Logger | undefined, now: Date): Promise<number> {
  const threshold = new Date(now.getTime() - env.SCANNER_RUN_STALE_MINUTES * 60_000);
  const stale = await ScannerRunModel.find({ status: 'running', heartbeatAt: { $lte: threshold } })
    .select('_id scannerType heartbeatAt')
    .lean<Array<{ _id: Types.ObjectId; scannerType: string; heartbeatAt: Date }>>();
  let count = 0;
  for (const run of stale) {
    const res = await ScannerRunModel.updateOne(
      { _id: run._id, status: 'running', heartbeatAt: { $lte: threshold } },
      { $set: { status: 'interrupted', finishedAt: now } },
    );
    if (res.modifiedCount > 0) {
      count += 1;
      auditRunInterrupted(logger, { runId: String(run._id), scannerType: run.scannerType, heartbeatAt: run.heartbeatAt });
    }
  }
  return count;
}

/** Vstavi `queued` zagon za termin; `false`, kadar ga je drug izvod že vstavil (E11000). */
async function insertScheduledRun(env: Env, scope: RunScope, slotKey: string, slot: Date, now: Date): Promise<boolean> {
  try {
    await ScannerRunModel.create({
      scannerType: scope.type,
      scope: scopeDoc(scope),
      slotKey,
      trigger: 'schedule',
      requestedBy: null,
      status: 'queued',
      scheduledFor: slot,
      createdAt: now,
      heartbeatAt: now,
      cancelRequested: false,
      expiresAt: runExpiry(env, now),
    });
    return true;
  } catch (err) {
    // E11000: drug izvod je termin že prevzel — pričakovano, ne napaka (FR-016).
    if ((err as { code?: number })?.code !== 11000) throw err;
    return false;
  }
}

// Tipi, za katere je bilo "ni registriran ali vklopljen" že zabeleženo — enkrat na proces, ne
// ob vsakem tiku (US6, scenarij 2).
const unavailableLogged = new Set<string>();

export function resetUnavailableLogForTests(): void {
  unavailableLogged.clear();
}

/**
 * Ustvari zagone za zapadle termine. Vrne število ustvarjenih. Urnik tipa velja za batch tipe,
 * urnik skenerja za vklopljene definicije single tipov; definicije tipa, ki ni registriran ali
 * vklopljen, se preskočijo.
 */
export async function scheduleDueRuns(env: Env, logger: Logger | undefined, now: Date): Promise<number> {
  let created = 0;
  const enabled = enabledScannerTypes(env);

  for (const type of enabled) {
    if (type.execution !== 'batch') continue;
    const settings = await getOrCreateTypeSettings(type, now);
    if (!settings.enabled) continue;
    const slot = latestDueSlot(settings.cronExpression, settings.timezone, now, settings.lastScheduledSlotAt);
    if (!slot) continue;
    const scope: RunScope = { kind: 'type', type: type.type };
    if (await insertScheduledRun(env, scope, scopedSlotKey(`type:${type.type}`, slot, settings.timezone), slot, now)) created += 1;
    await markTypeSlot(type.type, slot);
  }

  const singleTypes = new Set(enabled.filter((t) => t.execution === 'single').map((t) => t.type));
  const definitions = await ScannerDefinitionModel.find({ enabled: true, 'schedule.mode': 'own' })
    .select('_id userId type schedule')
    .lean<Array<{ _id: Types.ObjectId; userId: Types.ObjectId; type: string; schedule: { cronExpression: string; timezone: string; lastScheduledSlotAt: Date | null } }>>();

  const skippedByType = new Map<string, number>();
  for (const def of definitions) {
    if (!singleTypes.has(def.type)) {
      skippedByType.set(def.type, (skippedByType.get(def.type) ?? 0) + 1);
      continue;
    }
    const slot = latestDueSlot(def.schedule.cronExpression, def.schedule.timezone, now, def.schedule.lastScheduledSlotAt);
    if (!slot) continue;
    const scope: RunScope = { kind: 'definition', type: def.type, definitionId: String(def._id), ownerId: String(def.userId) };
    if (await insertScheduledRun(env, scope, scopedSlotKey(`def:${String(def._id)}`, slot, def.schedule.timezone), slot, now)) created += 1;
    await ScannerDefinitionModel.updateOne(
      { _id: def._id, $or: [{ 'schedule.lastScheduledSlotAt': null }, { 'schedule.lastScheduledSlotAt': { $lt: slot } }] },
      { $set: { 'schedule.lastScheduledSlotAt': slot } },
      { timestamps: false },
    );
  }

  for (const [type, count] of skippedByType) {
    if (unavailableLogged.has(type)) continue;
    unavailableLogged.add(type);
    auditTypeUnavailable(logger, { scannerType: type, definitions: count });
  }

  return created;
}

/** Ročni zagon (FR-020). `409`, kadar zagon ISTEGA obsega že teče ali čaka. */
export async function requestManualRun(env: Env, scope: RunScope, actorUserId: string, now = new Date()): Promise<{ runId: Types.ObjectId }> {
  if (!findScannerType(scope.type)) {
    throw new ProblemError(400, 'Tip skenerja ni na voljo', `Tip "${scope.type}" v tej namestitvi ni registriran.`);
  }
  const active = await ScannerRunModel.findOne({ ...scopeFilter(scope), status: { $in: ['queued', 'running'] } })
    .select('_id status')
    .lean<{ _id: Types.ObjectId; status: string } | null>();
  if (active) {
    throw new ProblemError(409, 'Zagon že teče', `Zagon ${String(active._id)} je v stanju "${active.status}". Počakaj, da se konča, ali ga prekini.`);
  }
  const id = new Types.ObjectId();
  await ScannerRunModel.create({
    _id: id,
    scannerType: scope.type,
    scope: scopeDoc(scope),
    slotKey: `manual:${String(id)}`,
    trigger: 'manual',
    requestedBy: new Types.ObjectId(actorUserId),
    status: 'queued',
    scheduledFor: null,
    createdAt: now,
    heartbeatAt: now,
    cancelRequested: false,
    expiresAt: runExpiry(env, now),
  });
  return { runId: id };
}

/** Zadnji KONČAN zagon tipa — za "zadnje preverjanje" v pregledih tipa. */
export async function latestFinishedRun(type: string): Promise<{ id: string; finishedAt: Date | null; status: RunStatus } | null> {
  const run = await ScannerRunModel.findOne({ scannerType: type, status: { $in: FINISHED_STATUSES } })
    .sort({ createdAt: -1 })
    .select('_id finishedAt status')
    .lean<{ _id: Types.ObjectId; finishedAt: Date | null; status: RunStatus } | null>();
  return run ? { id: String(run._id), finishedAt: run.finishedAt, status: run.status } : null;
}

/** Koliko zagonov TEGA obsega se je že končalo (brez prekinjenih in preklicanih) — za
 * deterministične scenarije tipov (`ctx.previousRunCount`). */
export async function countFinishedRuns(scope: RunScope): Promise<number> {
  return ScannerRunModel.countDocuments({ ...scopeFilter(scope), status: { $in: ['succeeded', 'partial', 'failed'] } });
}

export async function activeRuns(): Promise<RunLean[]> {
  return ScannerRunModel.find({ status: { $in: ['queued', 'running'] } }).sort({ createdAt: -1 }).lean<RunLean[]>();
}

import { Types } from 'mongoose';
import type { Env } from '../../../platform/config/env.js';
import type { Logger } from '../../../platform/logging/logger.js';
import { ProblemError } from '../../../platform/errors/problem.js';
import { FlightSearchRunModel } from '../models/flight-search-run.model.js';
import { latestDueSlot, slotKeyFor } from '../../../platform/scanner/domain/schedule-slots.js';
import { auditRunInterrupted } from '../flight-deals.audit.js';
import { processNotificationOutbox } from './notification-sender.service.js';
import { executeRun, type ExecuteOptions } from './run-executor.service.js';
import { getOrCreateSchedulerSettings, markSlotScheduled } from './scheduler-settings.service.js';

// LASTEN tik modula Leti (research.md §1) — ne scheduler modula 002 (člen I) in ne živ cron
// časovnik (člen V.1). Vsak tik vpraša bazo:
//  1. kateri `running` zagon je brez utripa → `interrupted` (FR-051);
//  2. kateri termin urnika je zapadel in nima zagona → ustvari `queued` z unikatnim `slotKey`
//     (dvojnik med izvodi pade na indeksu, FR-050);
//  3. en `queued` zagon → izvedi;
//  4. outbox dopisov.
//
// Vzorec kot `modules/file-sharing/services/cleanup.service.ts`: `setInterval(...).unref()`, takoj
// prvi tik ob zagonu, v testih se ne zažene (`createApp` preskoči pri NODE_ENV=test), testi
// kličejo `runFlightTick(env, logger, now)` neposredno s podanim časom (člen IX).

export interface TickSummary {
  interrupted: number;
  scheduled: boolean;
  executedRunId: string | null;
  outbox: { sent: number; failed: number; suppressed: number; retried: number };
}

let timer: ReturnType<typeof setInterval> | undefined;
let tickInFlight = false;

export async function markInterruptedRuns(env: Pick<Env, 'FLIGHT_RUN_STALE_MINUTES'>, logger: Logger | undefined, now: Date): Promise<number> {
  const threshold = new Date(now.getTime() - env.FLIGHT_RUN_STALE_MINUTES * 60_000);
  const stale = await FlightSearchRunModel.find({ status: 'running', heartbeatAt: { $lte: threshold } })
    .select('_id heartbeatAt')
    .lean<Array<{ _id: Types.ObjectId; heartbeatAt: Date }>>();
  let count = 0;
  for (const run of stale) {
    const res = await FlightSearchRunModel.updateOne(
      { _id: run._id, status: 'running', heartbeatAt: { $lte: threshold } },
      { $set: { status: 'interrupted', finishedAt: now } },
    );
    if (res.modifiedCount > 0) {
      count += 1;
      auditRunInterrupted(logger, { runId: String(run._id), heartbeatAt: run.heartbeatAt });
    }
  }
  return count;
}

function runExpiry(env: Pick<Env, 'FLIGHT_RUN_RETENTION_DAYS'>, now: Date): Date {
  return new Date(now.getTime() + env.FLIGHT_RUN_RETENTION_DAYS * 86_400_000);
}

/** Ustvari zagon za zapadli termin, če ga še ni. Vrne `true`, kadar je ta izvod zagon ustvaril. */
export async function scheduleDueRun(env: Env, now: Date): Promise<boolean> {
  const settings = await getOrCreateSchedulerSettings(now);
  if (!settings.enabled) return false;
  const slot = latestDueSlot(settings.cronExpression, settings.timezone, now, settings.lastScheduledSlotAt);
  if (!slot) return false;

  let created = false;
  try {
    await FlightSearchRunModel.create({
      slotKey: slotKeyFor(slot, settings.timezone),
      trigger: 'schedule',
      requestedBy: null,
      status: 'queued',
      scheduledFor: slot,
      createdAt: now,
      heartbeatAt: now,
      cancelRequested: false,
      expiresAt: runExpiry(env, now),
    });
    created = true;
  } catch (err) {
    // E11000: drug izvod je termin že prevzel — pričakovano, ne napaka (FR-050).
    if ((err as { code?: number })?.code !== 11000) throw err;
  }
  await markSlotScheduled(slot);
  return created;
}

/** Ročni zagon (FR-046). `409`, kadar eno preverjanje že teče ali čaka. */
export async function requestManualRun(env: Env, actorUserId: string, now = new Date()): Promise<{ runId: Types.ObjectId }> {
  const active = await FlightSearchRunModel.findOne({ status: { $in: ['queued', 'running'] } })
    .select('_id status')
    .lean<{ _id: Types.ObjectId; status: string } | null>();
  if (active) {
    throw new ProblemError(409, 'Preverjanje že teče', `Zagon ${String(active._id)} je v stanju "${active.status}". Počakaj, da se konča, ali ga prekini.`);
  }
  const id = new Types.ObjectId();
  await FlightSearchRunModel.create({
    _id: id,
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

/** Izvede EN čakajoč zagon, če noben ne teče. Vrne id izvedenega ali `null`. */
export async function executeNextQueued(env: Env, logger: Logger | undefined, now: Date, options: ExecuteOptions = {}): Promise<string | null> {
  const running = await FlightSearchRunModel.exists({ status: 'running' });
  if (running) return null;
  const next = await FlightSearchRunModel.findOne({ status: 'queued' }).sort({ createdAt: 1 }).select('_id').lean<{ _id: Types.ObjectId } | null>();
  if (!next) return null;
  const result = await executeRun(next._id, env, logger, now, options);
  return result ? String(next._id) : null;
}

export async function runFlightTick(env: Env, logger: Logger | undefined, now = new Date(), options: ExecuteOptions = {}): Promise<TickSummary | null> {
  if (tickInFlight) {
    logger?.warn({ event: 'flight.tick_skipped' }, 'Prejšnji tik preverjanja letov še teče — ta tik se preskoči');
    return null;
  }
  tickInFlight = true;
  try {
    const interrupted = await markInterruptedRuns(env, logger, now);
    const scheduled = await scheduleDueRun(env, now);
    const executedRunId = await executeNextQueued(env, logger, now, { ...options, processOutbox: false });
    const outbox = await processNotificationOutbox(env, logger, now);
    return { interrupted, scheduled, executedRunId, outbox };
  } catch (err) {
    logger?.error({ err, event: 'flight.tick_failed' }, 'Tik preverjanja letov je spodletel');
    return null;
  } finally {
    tickInFlight = false;
  }
}

export function startFlightDealsScheduler(env: Env, logger: Logger): void {
  if (timer) clearInterval(timer);
  void runFlightTick(env, logger);
  timer = setInterval(() => void runFlightTick(env, logger), env.FLIGHT_SCHEDULER_TICK_SECONDS * 1000);
  timer.unref?.();
  logger.info({ event: 'flight.scheduler.started', tickSeconds: env.FLIGHT_SCHEDULER_TICK_SECONDS }, 'Tik preverjanja letov zagnan');
}

export function stopFlightDealsSchedulerForTests(): void {
  if (timer) clearInterval(timer);
  timer = undefined;
  tickInFlight = false;
}

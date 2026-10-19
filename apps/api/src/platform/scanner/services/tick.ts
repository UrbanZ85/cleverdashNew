import { Types } from 'mongoose';
import type { Env } from '../../config/env.js';
import type { Logger } from '../../logging/logger.js';
import { ScannerRunModel } from '../models/scanner-run.model.js';
import { processNotificationOutbox, type OutboxSummary } from './notification-sender.service.js';
import { executeRun, type ExecuteOptions } from './run-executor.service.js';
import { markInterruptedRuns, scheduleDueRuns } from './scheduler.service.js';

// Tik jedra skenerjev (research.md §12) — LASTEN jedru (ne scheduler modula 002, člen I) in ne
// živ cron časovnik (člen V.1). Vsak tik vpraša bazo:
//  1. kateri `running` zagon je brez utripa → `interrupted` (FR-018);
//  2. kateri termini (tipov in skenerjev) so zapadli in nimajo zagona → `queued` (FR-013);
//  3. čakajoče zagone izvede ZAPOREDNO, dokler jih je in dokler število tekočih (drugih izvodov)
//     ne doseže SCANNER_MAX_CONCURRENT_RUNS; obseg, ki že teče, se preskoči (FR-016);
//  4. outbox dopisov (FR-031).
// Srčni utrip navzven ostane pri 002 oz. `startHeartbeat` (main.ts) — tik ga ne podvaja.
//
// Vzorec kot 015 `tick.ts`: `setInterval(...).unref()`, takoj prvi tik ob zagonu, v testih se ne
// zažene (`createApp` preskoči pri NODE_ENV=test), testi kličejo `runScannerTick(env, logger, now)`
// neposredno s podanim časom (člen IX).

export interface TickSummary {
  interrupted: number;
  scheduled: number;
  executedRunIds: string[];
  outbox: OutboxSummary;
}

let timer: ReturnType<typeof setInterval> | undefined;
let tickBusy = false;

interface QueuedLean {
  _id: Types.ObjectId;
  scannerType: string;
  scope: { kind: 'type' | 'definition'; definitionId: Types.ObjectId | null };
}

function scopeKey(run: QueuedLean): string {
  return run.scope.kind === 'type' ? `type:${run.scannerType}` : `def:${String(run.scope.definitionId)}`;
}

/** Izvede čakajoče zagone, enega za drugim. Vrne id-je izvedenih. */
export async function executeQueuedRuns(env: Env, logger: Logger | undefined, now: Date, options: ExecuteOptions = {}): Promise<string[]> {
  const executed: string[] = [];
  const attempted = new Set<string>();
  for (;;) {
    const running = await ScannerRunModel.find({ status: 'running' }).select('_id scannerType scope').lean<QueuedLean[]>();
    if (running.length >= env.SCANNER_MAX_CONCURRENT_RUNS) break;
    const busy = new Set(running.map(scopeKey));
    const queued = await ScannerRunModel.find({ status: 'queued' }).sort({ createdAt: 1 }).select('_id scannerType scope').lean<QueuedLean[]>();
    const next = queued.find((q) => !busy.has(scopeKey(q)) && !attempted.has(String(q._id)));
    if (!next) break;
    attempted.add(String(next._id));
    try {
      const result = await executeRun(next._id, env, logger, now, { ...options, processOutbox: false });
      if (result) executed.push(String(next._id));
    } catch (err) {
      // Napaka enega zagona ne ustavi zanke — naslednji dobi svojo priložnost (FR-017).
      logger?.error({ err, runId: String(next._id), event: 'scanner.run.crashed' }, 'Izvajanje zagona je vrglo izjemo');
    }
  }
  return executed;
}

export async function runScannerTick(env: Env, logger: Logger | undefined, now = new Date(), options: ExecuteOptions = {}): Promise<TickSummary | null> {
  if (tickBusy) {
    logger?.warn({ event: 'scanner.tick_skipped' }, 'Prejšnji tik skenerjev še teče — ta tik se preskoči');
    return null;
  }
  tickBusy = true;
  try {
    const interrupted = await markInterruptedRuns(env, logger, now);
    const scheduled = await scheduleDueRuns(env, logger, now);
    const executedRunIds = await executeQueuedRuns(env, logger, now, options);
    const outbox = await processNotificationOutbox(env, logger, now);
    return { interrupted, scheduled, executedRunIds, outbox };
  } catch (err) {
    logger?.error({ err, event: 'scanner.tick_failed' }, 'Tik skenerjev je spodletel');
    return null;
  } finally {
    tickBusy = false;
  }
}

export function startScannerScheduler(env: Env, logger: Logger): void {
  if (timer) clearInterval(timer);
  void runScannerTick(env, logger);
  timer = setInterval(() => void runScannerTick(env, logger), env.SCANNER_TICK_SECONDS * 1000);
  timer.unref?.();
  logger.info({ event: 'scanner.scheduler.started', tickSeconds: env.SCANNER_TICK_SECONDS }, 'Tik skenerjev zagnan');
}

export function stopScannerSchedulerForTests(): void {
  if (timer) clearInterval(timer);
  timer = undefined;
  tickBusy = false;
}

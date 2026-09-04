import type { Env } from '../../platform/config/env.js';
import type { Logger } from '../../platform/logging/logger.js';
import { pingOnce, getHeartbeatStatus } from '../../platform/health/heartbeat.js';
import { HeartbeatModel } from '../../platform/health/heartbeat.model.js';
import { registerHealthExtension } from '../../platform/health/extension.js';

// research.md §3, §8: en sam tik na SCHEDULER_TICK_SECONDS, ki namesto ločenega
// 60-sekundnega `startHeartbeat` intervala iz 001 sam pošlje zunanji ping vsakič, ko
// dejansko opravi delo. Koraki spodaj so OZNAČENI mesta razširitve — vsaka naslednja
// zgodba (US2 T052/T053, US3 T066, US4 T072, US8 T096, US10 T107/T108) doda svoj korak v
// isto funkcijo `runTick`, ne novo zanko — člen V.2: en sam vir resnice o tem, "kaj bi
// moralo biti do zdaj narejeno".

export interface TickResult {
  tickAt: Date;
  durationMs: number;
  plansBuilt: number;
  actionsProcessed: number;
  errors: number;
  externalPingOk: boolean;
}

export type TickStep = (ctx: { env: Env; logger: Logger }) => Promise<{
  plansBuilt?: number;
  actionsProcessed?: number;
}>;

/** Koraki tika, v vrstnem redu izvajanja. Foundational faza je prazna — poskrbi samo za
 * srčni utrip. Naslednje zgodbe potisnejo svoje korake sem (`registerTickStep`). */
const tickSteps: TickStep[] = [];

export function registerTickStep(step: TickStep): void {
  tickSteps.push(step);
}

/** Samo za teste: počisti registrirane korake med testnimi primeri. */
export function resetTickStepsForTests(): void {
  tickSteps.length = 0;
}

let lastTick: TickResult | null = null;
let timer: ReturnType<typeof setInterval> | undefined;
let tickInFlight = false;

export async function runTick(env: Env, logger: Logger): Promise<TickResult | null> {
  // Varovalka proti prekrivajočim se tikom: če korak (npr. brskalniška akcija) traja dlje
  // kot SCHEDULER_TICK_SECONDS, naslednji `setInterval` ne sme začeti vzporedne obdelave
  // istih zapadlih akcij — FR-034 velja tudi na tej ravni, ne samo na ravni enega profila.
  if (tickInFlight) {
    logger.warn({ event: 'scheduler.tick_skipped' }, 'Prejšnji tik še teče — ta tik se preskoči');
    return null;
  }
  tickInFlight = true;
  try {
    return await runTickBody(env, logger);
  } finally {
    tickInFlight = false;
  }
}

async function runTickBody(env: Env, logger: Logger): Promise<TickResult> {
  const startedAt = Date.now();
  let plansBuilt = 0;
  let actionsProcessed = 0;
  let errors = 0;

  for (const step of tickSteps) {
    try {
      const result = await step({ env, logger });
      plansBuilt += result.plansBuilt ?? 0;
      actionsProcessed += result.actionsProcessed ?? 0;
    } catch (err) {
      errors += 1;
      logger.error({ err }, 'Korak tika schedulerja je spodletel');
    }
  }

  // Ping gre VEDNO, tudi če je kak korak spodletel — člen VII: alarm mora priti od zunaj
  // neodvisno od notranjega stanja, ne le kadar je vse v redu.
  await pingOnce(env, logger);
  const externalPingOk = getHeartbeatStatus().lastResult === 'ok';

  const result: TickResult = {
    tickAt: new Date(),
    durationMs: Date.now() - startedAt,
    plansBuilt,
    actionsProcessed,
    errors,
    externalPingOk,
  };
  lastTick = result;

  await HeartbeatModel.create(result).catch((err) => logger.warn({ err }, 'Zapis Heartbeat je spodletel'));

  return result;
}

export function startScheduler(env: Env, logger: Logger): void {
  if (!env.SCHEDULER_ENABLED) {
    logger.info({ event: 'scheduler.disabled' }, 'Scheduler je izklopljen (SCHEDULER_ENABLED=false)');
    return;
  }
  if (timer) clearInterval(timer);
  void runTick(env, logger);
  timer = setInterval(() => void runTick(env, logger), env.SCHEDULER_TICK_SECONDS * 1000);
  timer.unref?.();

  registerHealthExtension(async () => {
    const { RemoteSessionModel } = await import('./models/remote-session.model.js');
    const { ActionRecordModel } = await import('./models/action-record.model.js');
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [sessions, failedActionsLast24h, missedActionsLast24h] = await Promise.all([
      RemoteSessionModel.find().lean(),
      ActionRecordModel.countDocuments({ finalOutcome: 'failed', completedAt: { $gte: since } }),
      ActionRecordModel.countDocuments({ finalOutcome: 'missed', completedAt: { $gte: since } }),
    ]);
    return {
      schedulerLastTickAgeSeconds: lastTick ? Math.round((Date.now() - lastTick.tickAt.getTime()) / 1000) : null,
      browser: lastTick ? (lastTick.errors > 0 ? 'failed' : 'ok') : 'unknown',
      remoteSessions: sessions.map((s) => ({
        name: s.name,
        status: s.status,
        daysUntilExpiry: s.expiresAt ? Math.floor((s.expiresAt.getTime() - Date.now()) / 86_400_000) : null,
      })),
      failedActionsLast24h,
      missedActionsLast24h,
    };
  });
}

export function stopSchedulerForTests(): void {
  if (timer) clearInterval(timer);
  timer = undefined;
  lastTick = null;
}

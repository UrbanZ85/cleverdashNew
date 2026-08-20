import type { Env } from '../config/env.js';
import type { Logger } from '../logging/logger.js';

// Člen VII, research.md §5: mrtev proces ne more poklicati notranjega /health, zato je
// odhodni srčni utrip edini pravi alarm. Postavljen je v 001, čeprav ni schedulerja, ki bi
// tikal — namen je dokazati zunanjo alarmno pot, preden se 002 nanjo zanese.

type HeartbeatResult = 'ok' | 'failed' | 'skipped';

let lastSentAt: Date | null = null;
let lastResult: HeartbeatResult = 'skipped';
let timer: ReturnType<typeof setInterval> | undefined;

const INTERVAL_MS = 60_000;

export function getHeartbeatStatus(): {
  configured: boolean;
  lastSentAt: string | null;
  lastResult: HeartbeatResult;
} {
  return {
    configured: lastResult !== 'skipped' || Boolean(process.env['HEALTHCHECK_PING_URL']),
    lastSentAt: lastSentAt ? lastSentAt.toISOString() : null,
    lastResult,
  };
}

async function pingOnce(env: Pick<Env, 'HEALTHCHECK_PING_URL' | 'HEALTHCHECK_PING_TIMEOUT_MS'>, logger: Logger) {
  if (!env.HEALTHCHECK_PING_URL) {
    lastResult = 'skipped';
    return;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.HEALTHCHECK_PING_TIMEOUT_MS);
  try {
    const res = await fetch(env.HEALTHCHECK_PING_URL, { method: 'GET', signal: controller.signal });
    lastResult = res.ok ? 'ok' : 'failed';
    lastSentAt = new Date();
  } catch (err) {
    lastResult = 'failed';
    logger.warn({ err }, 'Odhodni srčni utrip je spodletel');
  } finally {
    clearTimeout(timeout);
  }
}

/** Zažene periodični odhodni srčni utrip. Ob nenastavljeni spremenljivki se tiho
 * preskoči — to je edina namerno tiha pot v sistemu, ker gre za neobvezno zunanjo
 * storitev (research.md §5). */
export function startHeartbeat(env: Env, logger: Logger): void {
  if (timer) clearInterval(timer);
  void pingOnce(env, logger);
  timer = setInterval(() => void pingOnce(env, logger), INTERVAL_MS);
  timer.unref?.();
}

export function stopHeartbeatForTests(): void {
  if (timer) clearInterval(timer);
  timer = undefined;
  lastResult = 'skipped';
  lastSentAt = null;
}

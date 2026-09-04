import pino from 'pino';
import type { Env } from '../config/env.js';

export type Logger = pino.Logger;

/** Strukturiran JSON dnevnik v stdout, z ID-jem korelacije (člen VII). Docker bere stdout
 * neposredno — brez rotacije datotek, ki jo je uporabljal stari sistem (Winston). */
export function createLogger(env: Pick<Env, 'LOG_LEVEL'>): Logger {
  return pino({
    level: env.LOG_LEVEL,
    timestamp: pino.stdTimeFunctions.isoTime,
    base: { service: 'cleverdash-api' },
  });
}

let cached: Logger | undefined;

/** 002: routerji modula `time-tracking` potrebujejo logger zunaj `createApp()` (npr. za
 * `PuppeteerClockPortal`), a ne sme vsak klic ustvariti novega pino primerka. */
export function getLogger(env: Pick<Env, 'LOG_LEVEL'>): Logger {
  if (!cached) cached = createLogger(env);
  return cached;
}

/** Samo za teste. */
export function resetLoggerForTests(): void {
  cached = undefined;
}

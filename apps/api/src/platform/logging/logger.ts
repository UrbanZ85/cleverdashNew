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

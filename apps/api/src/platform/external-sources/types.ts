import type { Env } from '../config/env.js';
import type { Logger } from '../logging/logger.js';

// Skupni tipi zunanjih virov skenerjev (019, research §1). Izvlečeno iz LEGO skenerja, da ga lahko
// uporabljajo vsi tipi, ne da bi se moduli uvažali med sabo (člen I). Tu ni nobenega imena tipa.

export type FailureCode = 'disabled' | 'daily-limit' | 'rate-limited' | 'unauthorized' | 'unreachable' | 'invalid';

export type SourceOutcome<T> = { ok: true; value: T; stale: boolean } | { ok: false; code: FailureCode; message: string };

/** Najmanj, kar skupni prenos potrebuje od izvajalnega okolja tipa. */
export interface SourceRuntimeBase {
  env: Env;
  logger: Logger | undefined;
  now: Date;
  /** Počakaj do naslednjega dovoljenega klica vira; tip sam določi, katere vire pozna. */
  pace(source: never): Promise<void>;
}

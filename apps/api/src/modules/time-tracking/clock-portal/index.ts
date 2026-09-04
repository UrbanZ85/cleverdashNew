import type { Env } from '../../../platform/config/env.js';
import type { Logger } from '../../../platform/logging/logger.js';
import type { ClockPortal } from './clock-portal.interface.js';
import { FakeClockPortal } from './fake-clock-portal.js';
import { PuppeteerClockPortal } from './puppeteer-clock-portal.js';

export type { ClockPortal, ResolvedLocation, StateReading, ActionOutcome, Diagnostics } from './clock-portal.interface.js';
export { FakeClockPortal } from './fake-clock-portal.js';
export { PuppeteerClockPortal } from './puppeteer-clock-portal.js';

let cached: ClockPortal | undefined;

/** Izbere izvedbo `ClockPortal` po `CLOCK_PORTAL` (quickstart.md §2: `fake` za razvoj brez
 * klikanja po pravi strani, `puppeteer` sicer). En sam, ponovno uporabljen primerek na
 * proces — brskalnik naj bo dolgo živeč (research.md §2). */
export function getClockPortal(env: Env, logger: Logger): ClockPortal {
  if (cached) return cached;
  cached = env.CLOCK_PORTAL === 'fake' ? new FakeClockPortal() : new PuppeteerClockPortal(env, logger);
  return cached;
}

/** Samo za teste: pobriše predpomnjeni primerek, da se `getClockPortal` znova ustvari. */
export function resetClockPortalForTests(): void {
  cached = undefined;
}

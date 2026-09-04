// FR-030/FR-031, research.md §9: dušenje poskusov gesla na JAVNI poti.
//
// V tem zaledju danes ni nobenega dušenja — `login-throttle.service.ts` je bil v 004 izbrisan,
// ko je dušenje prijav prevzel Keycloak. Javen endpoint, ki preverja geslo, je prvi, ki ga
// znova potrebuje.
//
// Stanje je ZAPIS (services/throttle.service.ts nad zbirko `fileShareAttempts`), ne
// spremenljivka v pomnilniku: pomnilniški števec se ob vsakem ponovnem zagonu ponastavi, kar
// je za napadalca izhod — in ponovni zagon ni redek dogodek. Isti razlog navaja člen V za
// scheduler.
//
// Člen IX: čiste funkcije, brez baze, omrežja in ure (`now` je vedno argument).

export interface AttemptState {
  windowStartedAt: Date;
  count: number;
  lockedUntil: Date | null;
}

export interface AttemptLimits {
  /** Koliko ZGREŠENIH poskusov v oknu sproži zaklep. */
  limit: number;
  windowMs: number;
  lockMs: number;
}

export function isLocked(state: AttemptState | null | undefined, now: Date): boolean {
  if (!state?.lockedUntil) return false;
  return state.lockedUntil.getTime() > now.getTime();
}

export function retryAfterSeconds(state: AttemptState | null | undefined, now: Date): number {
  if (!isLocked(state, now)) return 0;
  return Math.ceil((state!.lockedUntil!.getTime() - now.getTime()) / 1000);
}

/** Koliko poskusov je še na voljo, preden se zaklene — za sporočilo zakonitemu prejemniku. */
export function remainingAttempts(state: AttemptState | null | undefined, now: Date, limits: AttemptLimits): number {
  if (isLocked(state, now)) return 0;
  if (!state || hasWindowElapsed(state, now, limits)) return limits.limit;
  return Math.max(0, limits.limit - state.count);
}

function hasWindowElapsed(state: AttemptState, now: Date, limits: AttemptLimits): boolean {
  return now.getTime() - state.windowStartedAt.getTime() >= limits.windowMs;
}

/**
 * Zabeleži ZGREŠEN poskus in vrne novo stanje.
 *
 * Ko števec doseže `limit`, se postavi `lockedUntil` — deseti zgrešen poskus je torej še
 * sprejet in obdelan, enajsti je zavrnjen. Med zaklepom je zavrnjeno tudi PRAVILNO geslo
 * (FR-030): drugače bi bil zaklep zgolj upočasnitev, ne ustavitev.
 */
export function registerFailure(state: AttemptState | null | undefined, now: Date, limits: AttemptLimits): AttemptState {
  if (!state || hasWindowElapsed(state, now, limits)) {
    // Poskus tik po izteku okna začne NOVO okno; prejšnje zgrešitve se ne prenesejo.
    return { windowStartedAt: now, count: 1, lockedUntil: null };
  }
  const count = state.count + 1;
  return {
    windowStartedAt: state.windowStartedAt,
    count,
    lockedUntil: count >= limits.limit ? new Date(now.getTime() + limits.lockMs) : state.lockedUntil,
  };
}

/** Uspešna odklenitev pobriše števec — vendar SAMO tistega ključa, na katerem je uspela.
 * Uspeh na eni povezavi ne sme oprati ugibanja, ki teče z istega naslova po drugih. */
export function resetOnSuccess(): AttemptState | null {
  return null;
}

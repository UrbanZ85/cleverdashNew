import { describe, expect, it } from 'vitest';
import {
  isLocked,
  registerFailure,
  remainingAttempts,
  resetOnSuccess,
  retryAfterSeconds,
  type AttemptLimits,
  type AttemptState,
} from '../../src/modules/file-sharing/domain/attempt-window.js';

// 009, research.md §21: nadomešča primere iz kakovostnih vrat, ki v tem modulu nimajo predmeta.

const NOW = new Date('2026-09-02T10:00:00.000Z');
const LIMITS: AttemptLimits = { limit: 10, windowMs: 15 * 60 * 1000, lockMs: 60 * 60 * 1000 };

function failNTimes(n: number, at: Date = NOW): AttemptState {
  let state: AttemptState | null = null;
  for (let i = 0; i < n; i++) state = registerFailure(state, at, LIMITS);
  return state!;
}

describe('registerFailure', () => {
  it('prvi zgrešen poskus odpre okno', () => {
    const state = registerFailure(null, NOW, LIMITS);
    expect(state).toEqual({ windowStartedAt: NOW, count: 1, lockedUntil: null });
  });

  it('deseti poskus v oknu še gre, enajsti ne', () => {
    const nine = failNTimes(9);
    expect(isLocked(nine, NOW)).toBe(false);

    const ten = registerFailure(nine, NOW, LIMITS);
    expect(ten.count).toBe(10);
    expect(isLocked(ten, NOW)).toBe(true);
  });

  it('poskus tik po izteku okna začne NOVO okno s števcem 1', () => {
    const nine = failNTimes(9);
    const justAfter = new Date(NOW.getTime() + LIMITS.windowMs);
    const fresh = registerFailure(nine, justAfter, LIMITS);
    expect(fresh).toEqual({ windowStartedAt: justAfter, count: 1, lockedUntil: null });
    expect(isLocked(fresh, justAfter)).toBe(false);
  });

  it('poskus tik PRED iztekom okna ostane v starem oknu', () => {
    const nine = failNTimes(9);
    const justBefore = new Date(NOW.getTime() + LIMITS.windowMs - 1);
    const tenth = registerFailure(nine, justBefore, LIMITS);
    expect(tenth.count).toBe(10);
    expect(tenth.windowStartedAt).toEqual(NOW);
    expect(isLocked(tenth, justBefore)).toBe(true);
  });
});

describe('isLocked', () => {
  it('zaklep velja do izteka in nato preneha sam', () => {
    const locked = failNTimes(10);
    expect(isLocked(locked, new Date(NOW.getTime() + LIMITS.lockMs - 1))).toBe(true);
    expect(isLocked(locked, new Date(NOW.getTime() + LIMITS.lockMs))).toBe(false);
  });

  it('brez stanja ni zaklepa', () => {
    expect(isLocked(null, NOW)).toBe(false);
    expect(isLocked(undefined, NOW)).toBe(false);
  });
});

describe('retryAfterSeconds', () => {
  it('pove, čez koliko sekund je smiselno poskusiti znova', () => {
    const locked = failNTimes(10);
    expect(retryAfterSeconds(locked, NOW)).toBe(LIMITS.lockMs / 1000);
    expect(retryAfterSeconds(null, NOW)).toBe(0);
  });
});

describe('remainingAttempts', () => {
  it('pove zakonitemu prejemniku, koliko poskusov mu ostane', () => {
    expect(remainingAttempts(null, NOW, LIMITS)).toBe(10);
    expect(remainingAttempts(failNTimes(3), NOW, LIMITS)).toBe(7);
    expect(remainingAttempts(failNTimes(10), NOW, LIMITS)).toBe(0);
  });

  it('po izteku okna je spet polno število', () => {
    const nine = failNTimes(9);
    expect(remainingAttempts(nine, new Date(NOW.getTime() + LIMITS.windowMs), LIMITS)).toBe(10);
  });
});

describe('resetOnSuccess', () => {
  it('uspeh pobriše števec TE povezave', () => {
    expect(resetOnSuccess()).toBeNull();
  });

  it('števec naslova se ob uspehu na eni povezavi NE ponastavi', () => {
    // Ponastavitev je stvar klicatelja, ki jo opravi samo nad ključem `link:` — uspeh na eni
    // povezavi ne sme oprati ugibanja, ki teče z istega naslova po drugih povezavah
    // (services/throttle.service.ts, research.md §9).
    const ipState = failNTimes(5);
    expect(ipState.count).toBe(5);
    expect(remainingAttempts(ipState, NOW, LIMITS)).toBe(5);
  });
});

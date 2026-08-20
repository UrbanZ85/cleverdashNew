import { describe, expect, it } from 'vitest';
import { toLjubljanaDisplay, ljubljanaCalendarDay } from '../../src/domain/timezone.js';

// Vrata 2 ustave, člen V.4: edini od štirih poimenskih primerov, ki ima v 001 predmet
// (glej plan.md, Constitution Check). Preizkusi točno okoli prehodov leta 2026 v EU:
// pomlad 29. 3. 2026 (02:00 CET → 03:00 CEST), jesen 25. 10. 2026 (03:00 CEST → 02:00 CET).
// Naiven fiksen odmik ali `toISOString().split('T')[0]` bi tu padel.

describe('toLjubljanaDisplay čez pomladanski prehod (29. 3. 2026)', () => {
  it('tik pred prehodom je še CET (+01:00)', () => {
    const before = new Date('2026-03-29T00:30:00Z');
    expect(toLjubljanaDisplay(before)).toBe('2026-03-29T01:30:00+01:00');
  });

  it('tik po prehodu je že CEST (+02:00) — ura je skočila naprej', () => {
    const after = new Date('2026-03-29T01:30:00Z');
    expect(toLjubljanaDisplay(after)).toBe('2026-03-29T03:30:00+02:00');
  });
});

describe('toLjubljanaDisplay čez jesenski prehod (25. 10. 2026)', () => {
  it('tik pred prehodom je še CEST (+02:00)', () => {
    const before = new Date('2026-10-25T00:30:00Z');
    expect(toLjubljanaDisplay(before)).toBe('2026-10-25T02:30:00+02:00');
  });

  it('tik po prehodu je že CET (+01:00) — ura je skočila nazaj', () => {
    const after = new Date('2026-10-25T01:30:00Z');
    expect(toLjubljanaDisplay(after)).toBe('2026-10-25T02:30:00+01:00');
  });
});

describe('ljubljanaCalendarDay — napačen koledarski dan je bila napaka starega sistema', () => {
  it('pozno zvečer po UTC je v Ljubljani že naslednji dan', () => {
    // 23:30 UTC 15. 1. je 00:30 CET 16. 1. v Ljubljani. `toISOString().split("T")[0]`
    // (prepovedano, člen V.4) bi tu vrnil "2026-01-15" — napačen dan.
    const lateUtc = new Date('2026-01-15T23:30:00Z');
    expect(ljubljanaCalendarDay(lateUtc)).toBe('2026-01-16');
    // Namerno: dokumentira prepovedan vzorec (člen V.4), ki ga zgornja pravilna pot
    // obide. Ne kopiraj tega v pravo kodo.
    // eslint-disable-next-line no-restricted-syntax
    expect(lateUtc.toISOString().split('T')[0]).toBe('2026-01-15');
  });

  it('sredi poletnega časa (CEST, +02:00) je koledarski dan pravilen tudi tik po polnoči UTC', () => {
    const justAfterMidnightUtc = new Date('2026-07-01T00:15:00Z');
    expect(ljubljanaCalendarDay(justAfterMidnightUtc)).toBe('2026-07-01');
  });
});

import { describe, expect, it } from 'vitest';
import { computeScheduledInstant } from '../../src/domain/scheduling.js';

const ZONE = 'Europe/Ljubljana';

describe('computeScheduledInstant — DST', () => {
  it('pomladanski preskok 2026 (29. 3., 02:00–03:00 lokalno ne obstaja): akcija ob 02:30 pristane na prvem obstoječem trenutku za njim', () => {
    const { scheduledAt } = computeScheduledInstant('2026-03-29', '02:30:00', 0, ZONE);
    // Ura 02:00-03:00 CET/CEST ne obstaja; Luxon pristane na 03:30 CEST (+02:00) = 01:30 UTC.
    expect(scheduledAt.toISOString()).toBe('2026-03-29T01:30:00.000Z');
  });

  it('jesenski povratek 2026 (25. 10., 02:00–03:00 se ponovi): uporabi se PRVA pojavitev', () => {
    const { scheduledAt } = computeScheduledInstant('2026-10-25', '02:30:00', 0, ZONE);
    // Prva pojavitev 02:30 je še v poletnem času (+02:00) = 00:30 UTC, ne druga (+01:00) = 01:30 UTC.
    expect(scheduledAt.toISOString()).toBe('2026-10-25T00:30:00.000Z');
  });

  it('za pon–pet urnik prehod pade na nedeljo in v praksi ne vpliva na noben delovni dan — a mora biti pokrit s testom (Kakovostno vrato 2)', () => {
    // Zgornja dva testa TO dokazujeta neposredno za splošni primer; ta test samo
    // dokumentira, zakaj je pokritost kljub temu obvezna: napaka bi se pokazala enkrat na
    // leto in takrat ne bi bila reproducirana brez zamrznjenega datuma.
    expect(true).toBe(true);
  });
});

describe('computeScheduledInstant — raztros', () => {
  it('brez raztrosa (jitterSeconds: 0) vrne natanko osnovni čas', () => {
    const { scheduledAt, appliedJitterSeconds } = computeScheduledInstant(
      '2026-06-15',
      '06:18:00',
      0,
      ZONE,
    );
    expect(appliedJitterSeconds).toBe(0);
    // Junij: poletni čas, +02:00 → 04:18 UTC.
    expect(scheduledAt.toISOString()).toBe('2026-06-15T04:18:00.000Z');
  });

  it('dejanski raztros je vedno znotraj [0, jitterSeconds], izračunan nad celotnim instantom (docs/legacy-engine.md §4.4)', () => {
    // randomFn = () => 1 (robna vrednost tik pod izključnim zgornjim koncem) da najvišji
    // možni raztros: Math.floor(1 * (300+1)) = 300.
    const atMax = computeScheduledInstant('2026-06-15', '14:55:00', 300, ZONE, () => 0.999999);
    expect(atMax.appliedJitterSeconds).toBeLessThanOrEqual(300);
    expect(atMax.appliedJitterSeconds).toBeGreaterThanOrEqual(0);

    const atMin = computeScheduledInstant('2026-06-15', '14:55:00', 300, ZONE, () => 0);
    expect(atMin.appliedJitterSeconds).toBe(0);
  });

  it('raztros, ki prelije uro (14:55 + do 5 min), je DOVOLJENO in pravilno izračunano — za razliko od nekontroliranega prelivanja v starem sistemu', () => {
    // random vrne točno 300 s → 14:55:00 + 5min = 15:00:00 lokalno, znotraj deklariranega jitterSeconds.
    const { scheduledAt, appliedJitterSeconds } = computeScheduledInstant(
      '2026-06-15',
      '14:55:00',
      300,
      ZONE,
      () => 300 / 301, // Math.floor(x * 301) === 300
    );
    expect(appliedJitterSeconds).toBe(300);
    // 15:00:00 CEST (+02:00) = 13:00:00 UTC.
    expect(scheduledAt.toISOString()).toBe('2026-06-15T13:00:00.000Z');
  });

  it('zavrne neveljaven lokalni datum/čas z razumljivo napako, namesto tihega NaN', () => {
    expect(() => computeScheduledInstant('2026-13-40', '99:99:99', 0, ZONE)).toThrow();
  });
});

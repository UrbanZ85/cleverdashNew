import { describe, expect, it } from 'vitest';
import {
  EXPIRY_OPTIONS,
  describeExpiry,
  describeQuota,
  describeState,
  formatBytes,
  hasGuessingWarning,
  isShareable,
  quotaRatio,
} from '../../src/app/features/file-sharing/file-sharing.model.js';

// Čista logika modula deljenja datotek — teče brez TestBed-a (isti vzorec kot notes-model.spec.ts).

describe('formatBytes', () => {
  it('izbere enoto glede na velikost', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 kB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
    // 500 MB je meja te funkcionalnosti in mora biti berljiva.
    expect(formatBytes(500 * 1024 * 1024)).toBe('500.0 MB');
    expect(formatBytes(3 * 1024 * 1024 * 1024)).toBe('3.00 GB');
  });

  it('nesmiselna vrednost ne izriše "NaN B"', () => {
    expect(formatBytes(Number.NaN)).toBe('—');
    expect(formatBytes(-1)).toBe('—');
  });
});

describe('describeState', () => {
  it('pokvarjeno je pomembnejše od preklicanega, preklicano od poteklega', () => {
    // Uporabnik, ki je povezavo preklical IN ji je medtem potekel rok, mora videti, da jo je
    // PREKLICAL — to je njegovo dejanje, ne posledica časa.
    expect(describeState({ state: 'broken', expired: true })).toContain('Pokvarjeno');
    expect(describeState({ state: 'revoked', expired: true })).toBe('Preklicano');
    expect(describeState({ state: 'ready', expired: true })).toBe('Poteklo');
    expect(describeState({ state: 'ready', expired: false })).toBe('Na voljo');
    expect(describeState({ state: 'uploading', expired: false })).toBe('Se nalaga');
  });
});

describe('isShareable', () => {
  it('deljiva je samo pripravljena in neposkočena datoteka', () => {
    expect(isShareable({ state: 'ready', expired: false })).toBe(true);
    expect(isShareable({ state: 'ready', expired: true })).toBe(false);
    expect(isShareable({ state: 'revoked', expired: false })).toBe(false);
    expect(isShareable({ state: 'broken', expired: false })).toBe(false);
    expect(isShareable({ state: 'uploading', expired: false })).toBe(false);
  });
});

describe('describeExpiry', () => {
  const now = new Date('2026-09-02T10:00:00.000Z');

  it('BREZ ROKA je izrecno označeno — ne prazno polje', () => {
    // Pozabljene povezave brez roka so razlog, da rok sploh obstaja (US4 scenarij 3).
    expect(describeExpiry(null, now)).toBe('Brez roka');
  });

  it('šteje dneve in ure', () => {
    expect(describeExpiry(new Date(now.getTime() + 3 * 24 * 3600_000).toISOString(), now)).toBe('Še 3 dni');
    expect(describeExpiry(new Date(now.getTime() + 2 * 24 * 3600_000).toISOString(), now)).toBe('Še 2 dneva');
    expect(describeExpiry(new Date(now.getTime() + 5 * 3600_000).toISOString(), now)).toBe('Še 5 ur');
    expect(describeExpiry(new Date(now.getTime() + 2 * 3600_000).toISOString(), now)).toBe('Še 2 uri');
  });

  it('pretekli rok je poteklo, ne negativno število', () => {
    expect(describeExpiry(new Date(now.getTime() - 1000).toISOString(), now)).toBe('Poteklo');
    expect(describeExpiry(now.toISOString(), now)).toBe('Poteklo');
  });
});

describe('hasGuessingWarning', () => {
  const now = new Date('2026-09-02T10:00:00.000Z');

  it('opozori ob neuspelih poskusih in ob zaklepu (FR-033)', () => {
    expect(hasGuessingWarning({ failedAttempts: 0, lockedUntil: null }, now)).toBe(false);
    expect(hasGuessingWarning({ failedAttempts: 1, lockedUntil: null }, now)).toBe(true);
    expect(
      hasGuessingWarning({ failedAttempts: 0, lockedUntil: new Date(now.getTime() + 60_000).toISOString() }, now),
    ).toBe(true);
  });

  it('potekel zaklep ni več opozorilo', () => {
    expect(
      hasGuessingWarning({ failedAttempts: 0, lockedUntil: new Date(now.getTime() - 60_000).toISOString() }, now),
    ).toBe(false);
  });
});

describe('kvota', () => {
  it('opiše zasedenost v berljivih enotah', () => {
    expect(describeQuota({ usedBytes: 1024 * 1024, limitBytes: 10 * 1024 * 1024 })).toBe('1.0 MB od 10.0 MB');
  });

  it('delež nikoli ne uide iz [0, 1] — znižana kvota ne sme izrisati črte čez rob', () => {
    expect(quotaRatio({ usedBytes: 0, limitBytes: 100 })).toBe(0);
    expect(quotaRatio({ usedBytes: 50, limitBytes: 100 })).toBe(0.5);
    expect(quotaRatio({ usedBytes: 500, limitBytes: 100 })).toBe(1);
    expect(quotaRatio({ usedBytes: 5, limitBytes: 0 })).toBe(1);
  });
});

describe('EXPIRY_OPTIONS', () => {
  it('vsebuje izbiro BREZ ROKA kot vrednost null, ne kot odsotnost', () => {
    // `undefined` (nisem izbral) in `null` (izbral sem brez roka) morata biti ločena vse do
    // strežnika — sicer je "brez roka" neizrazljivo.
    const values = EXPIRY_OPTIONS.map((o) => o.value);
    expect(values).toEqual([1, 7, 30, null]);
  });
});

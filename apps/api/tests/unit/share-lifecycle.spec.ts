import { describe, expect, it } from 'vitest';
import {
  canReissue,
  canTransition,
  computeExpiresAt,
  isDownloadable,
  isExpired,
  isExpiryChoice,
  isPastRetention,
} from '../../src/modules/file-sharing/domain/share-lifecycle.js';

// 009, research.md §21: nadomešča primere iz kakovostnih vrat, ki v tem modulu nimajo predmeta.

const NOW = new Date('2026-09-02T10:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

describe('computeExpiresAt', () => {
  it('izpuščena izbira uporabi privzetek namestitve', () => {
    expect(computeExpiresAt(undefined, NOW, 7)).toEqual(new Date(NOW.getTime() + 7 * DAY));
    expect(computeExpiresAt(undefined, NOW, 1)).toEqual(new Date(NOW.getTime() + 1 * DAY));
  });

  it('izrecni null pomeni BREZ ROKA — ne "poteklo" in ne "danes"', () => {
    // Razlika med `undefined` (nisem izbral) in `null` (izbral sem brez roka) je edini način,
    // da sta obe izbiri sploh izrazljivi.
    expect(computeExpiresAt(null, NOW, 7)).toBeNull();
    expect(isExpired(computeExpiresAt(null, NOW, 7), new Date(NOW.getTime() + 100 * DAY))).toBe(false);
  });

  it('1, 7 in 30 dni', () => {
    expect(computeExpiresAt(1, NOW, 7)).toEqual(new Date(NOW.getTime() + DAY));
    expect(computeExpiresAt(30, NOW, 7)).toEqual(new Date(NOW.getTime() + 30 * DAY));
  });

  it('isExpiryChoice sprejme samo dokumentirani nabor', () => {
    expect(isExpiryChoice(7)).toBe(true);
    expect(isExpiryChoice(3)).toBe(false);
    expect(isExpiryChoice(0)).toBe(false);
    expect(isExpiryChoice('7')).toBe(false);
    expect(isExpiryChoice(null)).toBe(false);
  });
});

describe('isExpired', () => {
  it('rok, ki je natanko zdaj, je potekel', () => {
    expect(isExpired(NOW, NOW)).toBe(true);
  });

  it('rok v prihodnosti ni potekel, rok v preteklosti je', () => {
    expect(isExpired(new Date(NOW.getTime() + 1000), NOW)).toBe(false);
    expect(isExpired(new Date(NOW.getTime() - 1000), NOW)).toBe(true);
  });

  it('brez roka ni nikoli poteklo', () => {
    expect(isExpired(null, NOW)).toBe(false);
    expect(isExpired(undefined, NOW)).toBe(false);
  });
});

describe('isPastRetention', () => {
  it('rok hrambe teče OD POTEKA, ne od nalaganja', () => {
    const expiresAt = new Date(NOW.getTime() - 3 * DAY);
    expect(isPastRetention(expiresAt, NOW, 7)).toBe(false);
    expect(isPastRetention(expiresAt, new Date(NOW.getTime() + 5 * DAY), 7)).toBe(true);
  });

  it('datoteka brez roka se ne pobriše nikoli sama', () => {
    expect(isPastRetention(null, new Date(NOW.getTime() + 1000 * DAY), 7)).toBe(false);
  });
});

describe('canTransition', () => {
  it('nalaganja ni mogoče preklicati — preklicati ni česa', () => {
    expect(canTransition('uploading', 'revoked')).toBe(false);
    expect(canTransition('uploading', 'ready')).toBe(true);
  });

  it('iz revoked NI neposredne poti nazaj v ready', () => {
    // Preklic se ne "odklene". Edina pot v obtok je izdaja NOVEGA gesla, kar je druga
    // operacija z drugimi posledicami (nov žeton, razveljavljene dovolilnice) — canReissue.
    expect(canTransition('revoked', 'ready')).toBe(false);
    expect(canReissue('revoked')).toBe(true);
  });

  it('iz broken ni poti nikamor', () => {
    expect(canTransition('broken', 'ready')).toBe(false);
    expect(canTransition('broken', 'revoked')).toBe(false);
    expect(canReissue('broken')).toBe(false);
  });

  it('ready se sme preklicati ali pokvariti', () => {
    expect(canTransition('ready', 'revoked')).toBe(true);
    expect(canTransition('ready', 'broken')).toBe(true);
  });

  it('novega gesla ni mogoče izdati za nalaganje, ki še teče', () => {
    expect(canReissue('uploading')).toBe(false);
  });
});

describe('isDownloadable', () => {
  it('samo ready in znotraj roka', () => {
    expect(isDownloadable({ state: 'ready', expiresAt: null }, NOW)).toBe(true);
    expect(isDownloadable({ state: 'ready', expiresAt: new Date(NOW.getTime() + DAY) }, NOW)).toBe(true);
    expect(isDownloadable({ state: 'ready', expiresAt: new Date(NOW.getTime() - 1) }, NOW)).toBe(false);
    expect(isDownloadable({ state: 'revoked', expiresAt: null }, NOW)).toBe(false);
    expect(isDownloadable({ state: 'broken', expiresAt: null }, NOW)).toBe(false);
    expect(isDownloadable({ state: 'uploading', expiresAt: null }, NOW)).toBe(false);
  });
});

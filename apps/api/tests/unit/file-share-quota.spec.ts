import { describe, expect, it } from 'vitest';
import { bytesToMb, checkQuota } from '../../src/modules/file-sharing/domain/quota.js';

// 009, research.md §21: nadomešča primere iz kakovostnih vrat, ki v tem modulu nimajo predmeta.

const MB = 1024 * 1024;

describe('checkQuota', () => {
  it('robna enakost je ŠE dovoljena — kvota je zgornja meja zasedenosti', () => {
    const result = checkQuota(900 * MB, 100 * MB, 1000 * MB);
    expect(result.ok).toBe(true);
  });

  it('en bajt čez ni', () => {
    const result = checkQuota(900 * MB, 100 * MB + 1, 1000 * MB);
    expect(result.ok).toBe(false);
    expect(result.availableBytes).toBe(100 * MB);
  });

  it('prazna kvota sprejme datoteko do meje', () => {
    expect(checkQuota(0, 1000 * MB, 1000 * MB).ok).toBe(true);
    expect(checkQuota(0, 1000 * MB + 1, 1000 * MB).ok).toBe(false);
  });

  it('polna kvota zavrne tudi en bajt', () => {
    const result = checkQuota(1000 * MB, 1, 1000 * MB);
    expect(result.ok).toBe(false);
    expect(result.availableBytes).toBe(0);
  });

  it('availableBytes ni nikoli negativen, tudi če je zasedeno čez mejo (znižana kvota)', () => {
    // Skrbnik lahko FILE_SHARE_QUOTA_MB zniža pod že zasedeno vrednost; sporočilo "na voljo
    // je -300 MB" bi bilo nesmisel.
    const result = checkQuota(1500 * MB, 1, 1000 * MB);
    expect(result.ok).toBe(false);
    expect(result.availableBytes).toBe(0);
  });
});

describe('bytesToMb', () => {
  it('zaokroži NAVZDOL — obljuba ne sme biti večja od resnice', () => {
    expect(bytesToMb(1.9 * MB)).toBe(1);
    expect(bytesToMb(0)).toBe(0);
    expect(bytesToMb(MB)).toBe(1);
  });
});

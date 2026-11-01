import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearTestDb, startTestDb, stopTestDb } from '../../setup/mongo-memory.js';
import { ExternalSourceUsageModel } from '../../../src/platform/external-sources/models/external-source-usage.model.js';
import { readSourceUsage, reserveSourceRequest, usageDay } from '../../../src/platform/external-sources/usage.js';

// 019 (research §1): dnevna poraba virov je skupna vsem tipom skenerjev — meja je na ključ pri ponudniku.

beforeAll(startTestDb);
afterAll(stopTestDb);
beforeEach(clearTestDb);

describe('skupna dnevna poraba virov', () => {
  it('eBay števec je skupen: LEGO in zbirateljski skener si delita eno mejo na dan', async () => {
    const now = new Date('2026-10-21T10:00:00Z');
    // Dva klicatelja z isto mejo 3 (kot da bi bila LEGO in zbirateljski skener): skupaj največ 3.
    const results = [
      await reserveSourceRequest('ebay', now, 3),
      await reserveSourceRequest('ebay', now, 3),
      await reserveSourceRequest('ebay', now, 3),
      await reserveSourceRequest('ebay', now, 3),
    ];
    expect(results).toEqual([true, true, true, false]);
    expect(await readSourceUsage('ebay', now)).toBe(3);
  });

  it('klicatelj z nižjo mejo se ustavi prej, kot bi jo dosegel drugi (nižja meja zmaga)', async () => {
    const now = new Date('2026-10-21T10:00:00Z');
    expect(await reserveSourceRequest('ebay', now, 10)).toBe(true);
    expect(await reserveSourceRequest('ebay', now, 10)).toBe(true);
    expect(await reserveSourceRequest('ebay', now, 2)).toBe(false);
  });

  it('vsak vir ima svoj števec; novi viri (tcgdex, pricecharting) so dovoljeni', async () => {
    const now = new Date('2026-10-21T10:00:00Z');
    expect(await reserveSourceRequest('tcgdex', now, 1)).toBe(true);
    expect(await reserveSourceRequest('tcgdex', now, 1)).toBe(false);
    expect(await reserveSourceRequest('pricecharting', now, 1)).toBe(true);
    expect(await readSourceUsage('ebay', now)).toBe(0);
  });

  it('sočasne rezervacije ne presežejo meje', async () => {
    const now = new Date('2026-10-21T10:00:00Z');
    const results = await Promise.all(Array.from({ length: 12 }, () => reserveSourceRequest('tcgdex', now, 4)));
    expect(results.filter(Boolean)).toHaveLength(4);
  });

  it('prehod na zimski čas (25. 10. 2026): dan je koledarski dan v Ljubljani', () => {
    // CEST (UTC+2) do 25. 10. 01:00 UTC, nato CET (UTC+1).
    expect(usageDay(new Date('2026-10-24T21:59:59Z'))).toBe('2026-10-24');
    expect(usageDay(new Date('2026-10-24T22:00:00Z'))).toBe('2026-10-25');
    expect(usageDay(new Date('2026-10-25T22:59:59Z'))).toBe('2026-10-25');
    expect(usageDay(new Date('2026-10-25T23:00:00Z'))).toBe('2026-10-26');
  });

  it('zapis nima lastnika in ima TTL indeks', () => {
    expect(Object.keys(ExternalSourceUsageModel.schema.paths)).not.toContain('userId');
    const indexes = ExternalSourceUsageModel.schema.indexes();
    expect(indexes.some(([, opts]) => opts?.expireAfterSeconds === 0)).toBe(true);
  });
});

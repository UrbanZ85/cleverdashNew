import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { startTestDb, stopTestDb, clearTestDb } from '../setup/mongo-memory.js';
import { ExternalCacheModel } from '../../src/platform/cache/model.js';
import { getOrRefresh } from '../../src/platform/cache/service.js';

// research.md §13, past iz §4: iztečen zapis se PRIKAŽE z oznako starosti in se NE
// izbriše. Napačna izvedba (npr. Mongo TTL indeks) tega ne pokaže v testu z delujočim
// virom — pokaže se šele v produkciji ob prvem izpadu. Ta test simulira prav to.

beforeAll(startTestDb);
afterAll(stopTestDb);
afterEach(clearTestDb);

describe('iztečen zapis v externalCache', () => {
  it('se ne izbriše, ko osvežitev spodleti — prikaže se z oznako "stale"', async () => {
    // 1. uspešna prva pridobitev
    await getOrRefresh({
      key: 'test:expiry',
      sourceUrl: 'https://example.invalid/vir',
      ttlSeconds: 1,
      fetcher: async () => ({ status: 200, body: { x: 1 }, contentType: 'application/json' }),
    });

    // 2. počakaj, da TTL poteče
    await new Promise((r) => setTimeout(r, 1100));

    // 3. osvežitev spodleti
    const result = await getOrRefresh({
      key: 'test:expiry',
      sourceUrl: 'https://example.invalid/vir',
      ttlSeconds: 1,
      fetcher: async () => {
        throw new Error('vir ne odgovarja');
      },
    });

    expect(result.freshness.kind).toBe('stale');
    expect(result.payload).toEqual({ x: 1 }); // podatek je še vedno tam

    // 4. zapis v bazi MORA še vedno obstajati, z zabeleženo napako (člen VI)
    const record = await ExternalCacheModel.findOne({ key: 'test:expiry' }).lean();
    expect(record).not.toBeNull();
    expect(record?.lastError).toContain('vir ne odgovarja');
    expect(record?.consecutiveFailures).toBe(1);
  });

  it('zaporedni neuspehi povečujejo consecutiveFailures, zapis vztraja', async () => {
    await getOrRefresh({
      key: 'test:expiry-2',
      sourceUrl: 'https://example.invalid/vir',
      ttlSeconds: 0, // takoj "potekel" — vsak klic poskusi osvežitev
      fetcher: async () => ({ status: 200, body: { x: 1 }, contentType: 'application/json' }),
    });

    for (let i = 0; i < 3; i++) {
      await getOrRefresh({
        key: 'test:expiry-2',
        sourceUrl: 'https://example.invalid/vir',
        ttlSeconds: 0,
        fetcher: async () => {
          throw new Error('spodletelo');
        },
      });
    }

    const record = await ExternalCacheModel.findOne({ key: 'test:expiry-2' }).lean();
    expect(record?.consecutiveFailures).toBe(3);
    expect(record?.payload).toEqual({ x: 1 }); // še vedno prisoten
  });
});

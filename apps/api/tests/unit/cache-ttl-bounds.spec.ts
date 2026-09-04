import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { startTestDb, stopTestDb, clearTestDb } from '../setup/mongo-memory.js';
import { getOrRefresh } from '../../src/platform/cache/service.js';
import { ExternalCacheModel } from '../../src/platform/cache/model.js';

// SC-002: radar največ 5 min (300 s), vreme največ 10 min (600 s) star, dokler je vir
// dosegljiv. Preverja MEJO — tik pred TTL se vir ne pokliče, tik po TTL se pokliče.
//
// `expiresAt` premikamo neposredno v bazi namesto z `vi.useFakeTimers()` — Mongo gonilnik
// uporablja lastne časovnike za povezavo, ki bi jih ponarejena ura lahko blokirala.

beforeAll(startTestDb);
afterAll(stopTestDb);
afterEach(clearTestDb);

async function seedAndBackdate(key: string, ttlSeconds: number, expiresInMs: number) {
  const fetcher = vi.fn(async () => ({ status: 200 as const, body: { n: 1 }, contentType: 'application/json' }));
  await getOrRefresh({ key, sourceUrl: 'https://example.invalid', ttlSeconds, fetcher });
  await ExternalCacheModel.updateOne({ key }, { expiresAt: new Date(Date.now() + expiresInMs) });
  return fetcher;
}

describe('meje TTL predpomnilnika (SC-002)', () => {
  it('radar (300 s): tik pred iztekom (expiresAt še v prihodnosti) se vir NE pokliče znova', async () => {
    const fetcher = await seedAndBackdate('bound:radar', 300, 1_000);
    await getOrRefresh({ key: 'bound:radar', sourceUrl: 'https://example.invalid', ttlSeconds: 300, fetcher });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('radar (300 s): takoj po iztekom (expiresAt v preteklosti) se vir pokliče znova', async () => {
    const fetcher = await seedAndBackdate('bound:radar2', 300, -1_000);
    await getOrRefresh({ key: 'bound:radar2', sourceUrl: 'https://example.invalid', ttlSeconds: 300, fetcher });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('vreme (600 s): tik pred iztekom se vir NE pokliče znova', async () => {
    const fetcher = await seedAndBackdate('bound:weather', 600, 1_000);
    await getOrRefresh({ key: 'bound:weather', sourceUrl: 'https://example.invalid', ttlSeconds: 600, fetcher });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('vreme (600 s): takoj po iztekom se vir pokliče znova', async () => {
    const fetcher = await seedAndBackdate('bound:weather2', 600, -1_000);
    await getOrRefresh({ key: 'bound:weather2', sourceUrl: 'https://example.invalid', ttlSeconds: 600, fetcher });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('privzeta TTL v .env.example ustrezata SC-002 (300 / 600)', async () => {
    // Dokumentacijska varovalka: če kdo v prihodnje spremeni privzetka v env.ts brez
    // spremembe SC-002, naj ta test opozori, ne šele produkcija.
    const { loadEnv, resetEnvCacheForTests } = await import('../../src/platform/config/env.js');
    resetEnvCacheForTests();
    const env = loadEnv({
      TZ: 'Europe/Ljubljana',
      PUBLIC_BASE_URL: 'http://localhost',
      MONGO_URI: 'mongodb://unused/test',
      SESSION_COOKIE_SECRET: 'b'.repeat(32),
      KEYCLOAK_ISSUER_URL: 'https://sso.example.com/realms/cleverdash-dev',
      KEYCLOAK_CLIENT_ID: 'cleverdash-api',
      KEYCLOAK_CLIENT_SECRET: 'x'.repeat(12),
      // 003, research.md §14: brez privzetka v shemi.
      CREDENTIALS_ENCRYPTION_KEY: Buffer.alloc(32, 3).toString('base64'),
    });
    expect(env.RADAR_CACHE_SECONDS).toBe(300);
    expect(env.WEATHER_CACHE_SECONDS).toBe(600);
    resetEnvCacheForTests();
  });
});

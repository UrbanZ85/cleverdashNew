import { describe, expect, it, beforeEach } from 'vitest';
import { loadEnv, resetEnvCacheForTests } from '../../src/platform/config/env.js';

// research.md §12 / §13: manjkajoča obvezna spremenljivka MORA zaustaviti zagon z imenom
// spremenljivke, ne pripeljati do `undefined`/`NaN` globoko v izvajanju.

const VALID: NodeJS.ProcessEnv = {
  NODE_ENV: 'production',
  PORT: '3000',
  TZ: 'Europe/Ljubljana',
  PUBLIC_BASE_URL: 'https://app.si',
  MONGO_URI: 'mongodb://user:pass@mongo:27017/cleverdash?authSource=admin',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  ADMIN_EMAIL: 'admin@example.com',
  ADMIN_INITIAL_PASSWORD: 'x'.repeat(12),
};

beforeEach(() => resetEnvCacheForTests());

describe('loadEnv', () => {
  it('sprejme veljavno minimalno konfiguracijo in uveljavi privzetke', () => {
    const env = loadEnv(VALID);
    expect(env.TZ).toBe('Europe/Ljubljana');
    expect(env.ACCESS_TOKEN_TTL).toBe('15m');
    expect(env.RADAR_CACHE_SECONDS).toBe(300);
  });

  it('zavrne manjkajočo obvezno spremenljivko in imenuje jo v sporočilu', () => {
    const { MONGO_URI: _omit, ...rest } = VALID;
    expect(() => loadEnv(rest)).toThrowError(/MONGO_URI/);
  });

  it('zavrne prekratek JWT_ACCESS_SECRET (past: skrivnost, ki je videti veljavna, a je šibka)', () => {
    expect(() => loadEnv({ ...VALID, JWT_ACCESS_SECRET: 'kratek' })).toThrowError(
      /JWT_ACCESS_SECRET/,
    );
  });

  it('zavrne TZ, ki ni Europe/Ljubljana (člen V.4)', () => {
    expect(() => loadEnv({ ...VALID, TZ: 'UTC' })).toThrowError();
  });

  it('ne pusti SALT_ROUNDS/podobne past: neveljavno število v ARSO_RADAR_URL da jasno napako, ne NaN', () => {
    expect(() => loadEnv({ ...VALID, RADAR_CACHE_SECONDS: 'ni-stevilka' })).toThrowError(
      /RADAR_CACHE_SECONDS/,
    );
  });

  it('e-pošta ostane neobvezna: brez SMTP_HOST se konfiguracija vseeno naloži', () => {
    expect(() => loadEnv(VALID)).not.toThrow();
  });
});

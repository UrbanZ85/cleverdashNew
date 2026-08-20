import { resetEnvCacheForTests } from '../../src/platform/config/env.js';

// Minimalno veljavno okolje za teste, ki zaganjajo `createApp()`. `MONGO_URI` se ne
// uporablja neposredno (povezavo vzpostavi startTestDb() na v-pomnilniško bazo), a mora biti
// prisoten, da loadEnv() ne zavrne konfiguracije.
export function setTestEnv(overrides: Partial<NodeJS.ProcessEnv> = {}): void {
  Object.assign(process.env, {
    NODE_ENV: 'test',
    VITEST: 'true',
    TZ: 'Europe/Ljubljana',
    PUBLIC_BASE_URL: 'http://localhost:3000',
    MONGO_URI: 'mongodb://unused-in-tests/cleverdash',
    JWT_ACCESS_SECRET: 'test-access-secret-'.padEnd(32, 'x'),
    JWT_REFRESH_SECRET: 'test-refresh-secret-'.padEnd(32, 'y'),
    ACCESS_TOKEN_TTL: '15m',
    REFRESH_TOKEN_TTL: '30d',
    ADMIN_EMAIL: 'admin@example.com',
    ADMIN_INITIAL_PASSWORD: 'zacetno-geslo-12',
    ...overrides,
  });
  resetEnvCacheForTests();
}

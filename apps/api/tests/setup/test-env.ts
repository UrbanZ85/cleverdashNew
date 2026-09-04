import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resetEnvCacheForTests } from '../../src/platform/config/env.js';
import { fakeKeycloakForTests } from './keycloak-global.js';

// 009: `createApp()` ob zagonu ustvari imenika za deljene datoteke (main.ts). Privzetek sheme
// je `/app/data/files` — pot v vsebniku, ki bi jo test na razvijalčevem računalniku ustvaril
// na disku (na Windowsu `D:\app\data\files`). Vsak zagon testov zato dobi svoj začasen imenik;
// testi, ki disk preverjajo, ga prepišejo prek `overrides`.
const TEST_FILE_SHARE_DIR = mkdtempSync(join(tmpdir(), 'cleverdash-files-'));

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
    // 004, research.md §12: nadomesti JWT_ACCESS_SECRET/JWT_REFRESH_SECRET — dostopni žeton
    // je Keycloakov lasten (relay), ta skrivnost podpiše samo notranji sejni piškotek.
    SESSION_COOKIE_SECRET: 'test-session-secret-'.padEnd(32, 'y'),
    // Vsaka testna datoteka že ima svoj zagnan ponarejen IdP (setupFiles, glej
    // keycloak-global.ts) — noben klicatelj setTestEnv() ga ne rabi ročno prepisovati, tudi
    // tisti, ki setTestEnv() kličejo večkrat sredi testa (actions.spec.ts, idempotency.spec.ts).
    KEYCLOAK_ISSUER_URL: fakeKeycloakForTests.issuerUrl,
    KEYCLOAK_CLIENT_ID: 'cleverdash-api-test',
    KEYCLOAK_CLIENT_SECRET: 'test-client-secret',
    KEYCLOAK_ADMIN_ROLE: 'cleverdash-admin',
    KEYCLOAK_USER_ROLE: 'cleverdash-user',
    KEYCLOAK_INTROSPECTION_CACHE_SECONDS: '5',
    // 002: privzeto izklopljeno v testih, da `createApp()` ne sproži pravega tika
    // (Puppeteer, resnični zapisi Heartbeat) v vsakem testu, ki samo prijavo/dashboard/...
    // preverja. Testi schedulerja/ClockPortal to eksplicitno prepišejo prek `overrides`.
    SCHEDULER_ENABLED: 'false',
    CLOCK_PORTAL: 'fake',
    DRY_RUN: 'true',
    // 003, research.md §14: brez privzetka v shemi, zato ga vsak test, ki zažene
    // createApp(), potrebuje — 32 bajtov base64 (44 znakov), namenoma stalen v testih.
    CREDENTIALS_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64'),
    // 009: glej opombo pri TEST_FILE_SHARE_DIR zgoraj.
    FILE_SHARE_DIR: TEST_FILE_SHARE_DIR,
    ...overrides,
  });
  resetEnvCacheForTests();
}

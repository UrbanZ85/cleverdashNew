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
  // 004, research.md §12: nadomesti JWT_ACCESS_SECRET/JWT_REFRESH_SECRET — dostopni žeton je
  // Keycloakov lasten (relay), notranji piškotek referencira KeycloakSession.
  SESSION_COOKIE_SECRET: 'c'.repeat(32),
  KEYCLOAK_ISSUER_URL: 'https://sso.example.com/realms/cleverdash-dev',
  KEYCLOAK_CLIENT_ID: 'cleverdash-api',
  KEYCLOAK_CLIENT_SECRET: 'test-client-secret',
  // 32 bajtov base64 (44 znakov) — glej research.md §14, secret-box.spec.ts za pravo rabo.
  CREDENTIALS_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
};

beforeEach(() => resetEnvCacheForTests());

describe('loadEnv', () => {
  it('sprejme veljavno minimalno konfiguracijo in uveljavi privzetke', () => {
    const env = loadEnv(VALID);
    expect(env.TZ).toBe('Europe/Ljubljana');
    expect(env.RADAR_CACHE_SECONDS).toBe(300);
  });

  it('zavrne manjkajočo obvezno spremenljivko in imenuje jo v sporočilu', () => {
    const { MONGO_URI: _omit, ...rest } = VALID;
    expect(() => loadEnv(rest)).toThrowError(/MONGO_URI/);
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

  // research.md §14: te spremenljivke je .env.example predvidela za 002, preden jih je
  // shema sploh validirala — brez tega bi se napačna vrednost tiho izgubila.
  it('brskalniške in schedulerske spremenljivke dobijo dokumentirane privzetke', () => {
    const env = loadEnv(VALID);
    expect(env.PUPPETEER_SKIP_DOWNLOAD).toBe(true);
    expect(env.PUPPETEER_EXECUTABLE_PATH).toBe('/usr/bin/chromium');
    expect(env.BROWSER_HEADLESS).toBe(true);
    expect(env.BROWSER_TIMEOUT_MS).toBe(30000);
    expect(env.BROWSER_NO_SANDBOX).toBe(false);
    expect(env.SCHEDULER_ENABLED).toBe(true);
    expect(env.SCHEDULER_TICK_SECONDS).toBe(30);
    expect(env.SCHEDULE_TIMEZONE).toBe('Europe/Ljubljana');
    expect(env.DRY_RUN).toBe(false);
    expect(env.CLOCK_PORTAL).toBe('puppeteer');
    expect(env.SCREENSHOT_DIR).toBe('/app/data/screenshots');
    expect(env.SCREENSHOT_RETENTION_DAYS).toBe(30);
  });

  it('zavrne neveljaven CLOCK_PORTAL namesto tihega padca na privzeto vrednost', () => {
    expect(() => loadEnv({ ...VALID, CLOCK_PORTAL: 'headless-chrome' })).toThrowError(
      /CLOCK_PORTAL/,
    );
  });

  it('zavrne SCHEDULER_TICK_SECONDS, ki ni število (past: SALT_ROUNDS → NaN se ne sme ponoviti)', () => {
    expect(() => loadEnv({ ...VALID, SCHEDULER_TICK_SECONDS: 'ni-stevilka' })).toThrowError(
      /SCHEDULER_TICK_SECONDS/,
    );
  });

  // 003, research.md §13/§14: kamere dobijo privzetke razen za šifrirni ključ.
  it('kamere dobijo dokumentirane privzetke', () => {
    const env = loadEnv(VALID);
    expect(env.CAMERA_ALLOWED_EMBED_HOSTS).toBe('youtube.com,ipcamlive.com,istrastream.com,arso.gov.si');
    expect(env.CAMERA_UNREACHABLE_THRESHOLD).toBe(3);
    expect(env.CAMERA_DEGRADED_REFRESH_MULTIPLIER).toBe(4);
    expect(env.CAMERA_DEFAULT_REFRESH_SECONDS).toBe(30);
  });

  it('zavrne manjkajoč CREDENTIALS_ENCRYPTION_KEY (brez privzetka, glej research.md §14)', () => {
    const { CREDENTIALS_ENCRYPTION_KEY: _omit, ...rest } = VALID;
    expect(() => loadEnv(rest)).toThrowError(/CREDENTIALS_ENCRYPTION_KEY/);
  });

  it('zavrne CREDENTIALS_ENCRYPTION_KEY napačne dolžine (ni 32 bajtov v base64)', () => {
    expect(() => loadEnv({ ...VALID, CREDENTIALS_ENCRYPTION_KEY: 'prekratko' })).toThrowError(
      /CREDENTIALS_ENCRYPTION_KEY/,
    );
  });

  // 004, research.md §12: Keycloak nadomesti lokalno geslo — manjkajoč povezovalni podatek
  // MORA ustaviti zagon z imenom spremenljivke, enako kot vsaka druga obvezna vrednost.
  it('zavrne manjkajoč KEYCLOAK_ISSUER_URL', () => {
    const { KEYCLOAK_ISSUER_URL: _omit, ...rest } = VALID;
    expect(() => loadEnv(rest)).toThrowError(/KEYCLOAK_ISSUER_URL/);
  });

  it('zavrne KEYCLOAK_ISSUER_URL, ki ni veljaven URL', () => {
    expect(() => loadEnv({ ...VALID, KEYCLOAK_ISSUER_URL: 'ni-url' })).toThrowError(
      /KEYCLOAK_ISSUER_URL/,
    );
  });

  it('zavrne manjkajoč KEYCLOAK_CLIENT_ID', () => {
    const { KEYCLOAK_CLIENT_ID: _omit, ...rest } = VALID;
    expect(() => loadEnv(rest)).toThrowError(/KEYCLOAK_CLIENT_ID/);
  });

  it('zavrne manjkajoč KEYCLOAK_CLIENT_SECRET', () => {
    const { KEYCLOAK_CLIENT_SECRET: _omit, ...rest } = VALID;
    expect(() => loadEnv(rest)).toThrowError(/KEYCLOAK_CLIENT_SECRET/);
  });

  it('zavrne manjkajoč SESSION_COOKIE_SECRET', () => {
    const { SESSION_COOKIE_SECRET: _omit, ...rest } = VALID;
    expect(() => loadEnv(rest)).toThrowError(/SESSION_COOKIE_SECRET/);
  });

  it('zavrne prekratek SESSION_COOKIE_SECRET', () => {
    expect(() => loadEnv({ ...VALID, SESSION_COOKIE_SECRET: 'kratek' })).toThrowError(
      /SESSION_COOKIE_SECRET/,
    );
  });

  it('KEYCLOAK_ADMIN_ROLE, KEYCLOAK_USER_ROLE in KEYCLOAK_INTROSPECTION_CACHE_SECONDS dobijo dokumentirane privzetke', () => {
    const env = loadEnv(VALID);
    expect(env.KEYCLOAK_ADMIN_ROLE).toBe('cleverdash-admin');
    expect(env.KEYCLOAK_USER_ROLE).toBe('cleverdash-user');
    expect(env.KEYCLOAK_INTROSPECTION_CACHE_SECONDS).toBe(5);
  });

  it('zavrne KEYCLOAK_INTROSPECTION_CACHE_SECONDS, ki ni število', () => {
    expect(() =>
      loadEnv({ ...VALID, KEYCLOAK_INTROSPECTION_CACHE_SECONDS: 'ni-stevilka' }),
    ).toThrowError(/KEYCLOAK_INTROSPECTION_CACHE_SECONDS/);
  });

  // ── Deljenje datotek (009) ────────────────────────────────────────────────────────────
  // Vseh enajst spremenljivk je NEOBVEZNIH; namestitev iz čiste kopije ne sme zahtevati
  // dopolnjevanja `.env` (kakovostna vrata, točka 4).

  it('009: brez vpisa v .env veljajo dokumentirani privzetki', () => {
    const env = loadEnv(VALID);
    expect(env.FILE_SHARE_DIR).toBe('/app/data/files');
    expect(env.FILE_SHARE_MAX_MB).toBe(500);
    expect(env.FILE_SHARE_QUOTA_MB).toBe(5000);
    expect(env.FILE_SHARE_DEFAULT_EXPIRY_DAYS).toBe(7);
    expect(env.FILE_SHARE_RETENTION_DAYS).toBe(7);
    expect(env.FILE_SHARE_GRANT_MINUTES).toBe(10);
    expect(env.FILE_SHARE_ATTEMPT_LIMIT).toBe(10);
    expect(env.FILE_SHARE_ATTEMPT_WINDOW_MINUTES).toBe(15);
    expect(env.FILE_SHARE_LOCK_MINUTES).toBe(60);
    expect(env.FILE_SHARE_CLEANUP_INTERVAL_MINUTES).toBe(60);
    expect(env.FILE_SHARE_UPLOAD_TIMEOUT_MINUTES).toBe(360);
  });

  it('009: vpisana vrednost prepiše privzetek', () => {
    const env = loadEnv({ ...VALID, FILE_SHARE_MAX_MB: '2000', FILE_SHARE_DIR: '/data/deljeno' });
    expect(env.FILE_SHARE_MAX_MB).toBe(2000);
    expect(env.FILE_SHARE_DIR).toBe('/data/deljeno');
  });

  it('009: FILE_SHARE_MAX_MB ne sprejme ničle ne negativne vrednosti — meja 0 bi tiho ustavila ves modul', () => {
    expect(() => loadEnv({ ...VALID, FILE_SHARE_MAX_MB: '0' })).toThrowError(/FILE_SHARE_MAX_MB/);
    resetEnvCacheForTests();
    expect(() => loadEnv({ ...VALID, FILE_SHARE_MAX_MB: '-1' })).toThrowError(/FILE_SHARE_MAX_MB/);
  });

  it('009: nešteviln FILE_SHARE_ATTEMPT_LIMIT da jasno napako, ne NaN (past SALT_ROUNDS)', () => {
    expect(() => loadEnv({ ...VALID, FILE_SHARE_ATTEMPT_LIMIT: 'ni-stevilka' })).toThrowError(
      /FILE_SHARE_ATTEMPT_LIMIT/,
    );
  });
});

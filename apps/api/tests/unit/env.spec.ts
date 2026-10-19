import { describe, expect, it, beforeEach } from 'vitest';
import { deprecatedEnvNames, loadEnv, resetEnvCacheForTests } from '../../src/platform/config/env.js';

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
    // 009b: stropi za sprejemne predale.
    expect(env.FILE_SHARE_INBOX_MAX_FILES).toBe(10);
    expect(env.FILE_SHARE_INBOX_MAX_MB).toBe(1000);
    // Dovolilnica za ODDAJO je bistveno daljša od tiste za prevzem: prevzem se sproži z
    // navigacijo takoj, oddaja pa mora zdržati, dokler nekdo izbira in pošilja datoteke.
    expect(env.FILE_SHARE_INBOX_TICKET_MINUTES).toBe(60);
    expect(env.FILE_SHARE_INBOX_TICKET_MINUTES).toBeGreaterThan(env.FILE_SHARE_GRANT_MINUTES);
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

  it('009b: meja predala 0 je zavrnjena — predal, ki ne sprejme ničesar, bi bil tiho pokvarjen', () => {
    expect(() => loadEnv({ ...VALID, FILE_SHARE_INBOX_MAX_FILES: '0' })).toThrowError(
      /FILE_SHARE_INBOX_MAX_FILES/,
    );
    expect(() => loadEnv({ ...VALID, FILE_SHARE_INBOX_MAX_MB: '-5' })).toThrowError(/FILE_SHARE_INBOX_MAX_MB/);
  });

  it('009: nešteviln FILE_SHARE_ATTEMPT_LIMIT da jasno napako, ne NaN (past SALT_ROUNDS)', () => {
    expect(() => loadEnv({ ...VALID, FILE_SHARE_ATTEMPT_LIMIT: 'ni-stevilka' })).toThrowError(
      /FILE_SHARE_ATTEMPT_LIMIT/,
    );
  });

  // ── Shranjeni linki (008) ─────────────────────────────────────────────────────────────
  // Vse tri so NEOBVEZNE (quickstart.md §2: "Nič ni treba dodati") — namestitev iz čiste
  // kopije ne sme zahtevati dopolnjevanja `.env`.

  it('008: brez vpisa v .env veljajo dokumentirani privzetki', () => {
    const env = loadEnv(VALID);
    expect(env.SAVED_LINKS_METADATA_TIMEOUT_MS).toBe(2500);
    expect(env.SAVED_LINKS_METADATA_MAX_BYTES).toBe(131_072);
    expect(env.SAVED_LINKS_FAVICON_TTL_SECONDS).toBe(604_800);
  });

  it('008: vpisana vrednost prepiše privzetek', () => {
    const env = loadEnv({
      ...VALID,
      SAVED_LINKS_METADATA_TIMEOUT_MS: '900',
      SAVED_LINKS_FAVICON_TTL_SECONDS: '3600',
    });
    expect(env.SAVED_LINKS_METADATA_TIMEOUT_MS).toBe(900);
    expect(env.SAVED_LINKS_FAVICON_TTL_SECONDS).toBe(3600);
  });

  it('008: proračun 0 je zavrnjen — meja 0 bi tiho pomenila, da se ime strani ne prebere nikoli', () => {
    expect(() => loadEnv({ ...VALID, SAVED_LINKS_METADATA_TIMEOUT_MS: '0' })).toThrowError(
      /SAVED_LINKS_METADATA_TIMEOUT_MS/,
    );
    resetEnvCacheForTests();
    expect(() => loadEnv({ ...VALID, SAVED_LINKS_METADATA_MAX_BYTES: '-1' })).toThrowError(
      /SAVED_LINKS_METADATA_MAX_BYTES/,
    );
  });

  it('008: nešteviln SAVED_LINKS_FAVICON_TTL_SECONDS da jasno napako, ne NaN (past SALT_ROUNDS)', () => {
    expect(() => loadEnv({ ...VALID, SAVED_LINKS_FAVICON_TTL_SECONDS: 'teden' })).toThrowError(
      /SAVED_LINKS_FAVICON_TTL_SECONDS/,
    );
  });

  // 015: spremenljivke modula Leti imajo privzetke (vrata 4), testni vir pa v produkciji ne sme
  // obstajati — izmišljena ponudba ne sme nikoli priti v dopis (FR-022, FR-039).
  describe('Leti (015)', () => {
    it('ima privzetke za tik, neuradni vir in SMTP_SECURE', () => {
      const env = loadEnv(VALID);
      expect(env.FLIGHT_SCHEDULER_TICK_SECONDS).toBe(60);
      expect(env.FLIGHT_RYANAIR_ENABLED).toBe(false);
      expect(env.FLIGHT_FAKE_PROVIDER_ENABLED).toBe(false);
      expect(env.FLIGHT_PROVIDER_CACHE_SECONDS).toBe(3600);
      expect(env.SMTP_SECURE).toBe(false);
      expect(env.FLIGHT_TRAVELPAYOUTS_TOKEN ?? '').toBe('');
    });

    it('zavrne testni vir v produkciji in imenuje spremenljivko', () => {
      expect(() => loadEnv({ ...VALID, NODE_ENV: 'production', FLIGHT_FAKE_PROVIDER_ENABLED: 'true' })).toThrowError(
        /FLIGHT_FAKE_PROVIDER_ENABLED/,
      );
    });

    it('dovoli testni vir v razvoju in testih', () => {
      expect(loadEnv({ ...VALID, NODE_ENV: 'test', FLIGHT_FAKE_PROVIDER_ENABLED: 'true' }).FLIGHT_FAKE_PROVIDER_ENABLED).toBe(
        true,
      );
    });
  });

  // 016: jedro skenerjev je nasledilo tri spremenljivke modula Leti. Stara imena so REZERVA z
  // opozorilom (research.md §9), da obstoječa namestitev ob nadgradnji ne odpove; testni tip
  // "echo" v produkciji ne sme obstajati (FR-047), enako kot testni vir letov.
  describe('Skenerji (016)', () => {
    it('ima privzetke za tik, prekinitev, hrambo, sočasnost, mejo in testni tip', () => {
      const env = loadEnv(VALID);
      expect(env.SCANNER_TICK_SECONDS).toBe(60);
      expect(env.SCANNER_RUN_STALE_MINUTES).toBe(30);
      expect(env.SCANNER_RUN_RETENTION_DAYS).toBe(90);
      expect(env.SCANNER_HISTORY_RETENTION_DAYS).toBe(180);
      expect(env.SCANNER_MAX_CONCURRENT_RUNS).toBe(1);
      expect(env.SCANNER_MAX_DEFINITIONS_PER_USER).toBe(20);
      expect(env.SCANNER_ECHO_ENABLED).toBe(false);
      expect(deprecatedEnvNames()).toEqual([]);
    });

    it('staro ime iz 015 velja kot rezerva, kadar novo ni nastavljeno, in se zabeleži', () => {
      const env = loadEnv({ ...VALID, FLIGHT_RUN_STALE_MINUTES: '45' });
      expect(env.SCANNER_RUN_STALE_MINUTES).toBe(45);
      expect(deprecatedEnvNames()).toEqual([{ oldName: 'FLIGHT_RUN_STALE_MINUTES', newName: 'SCANNER_RUN_STALE_MINUTES' }]);
    });

    it('novo ime ima prednost, kadar sta nastavljeni obe', () => {
      const env = loadEnv({ ...VALID, FLIGHT_RUN_STALE_MINUTES: '45', SCANNER_RUN_STALE_MINUTES: '12' });
      expect(env.SCANNER_RUN_STALE_MINUTES).toBe(12);
      expect(deprecatedEnvNames()).toEqual([]);
    });

    it('zavrne testni tip echo v produkciji in imenuje spremenljivko', () => {
      expect(() => loadEnv({ ...VALID, NODE_ENV: 'production', SCANNER_ECHO_ENABLED: 'true' })).toThrowError(/SCANNER_ECHO_ENABLED/);
    });

    it('dovoli testni tip echo v razvoju in testih', () => {
      expect(loadEnv({ ...VALID, NODE_ENV: 'test', SCANNER_ECHO_ENABLED: 'true' }).SCANNER_ECHO_ENABLED).toBe(true);
    });
  });

  // 017: analiza z umetno inteligenco je neobvezna — brez ključa ni na voljo, vse ostalo ima privzetek.
  describe('Analiza z umetno inteligenco (017)', () => {
    it('brez ključa: model gpt-6.1-sol, uradna osnova, meje in izklopljene slike', () => {
      const env = loadEnv(VALID);
      expect(env.OPENAI_API_KEY ?? '').toBe('');
      expect(env.OPENAI_MODEL).toBe('gpt-6.1-sol');
      expect(env.OPENAI_BASE_URL).toBe('https://api.openai.com/v1');
      expect(env.OPENAI_TIMEOUT_MS).toBe(30_000);
      expect(env.SCANNER_AI_MAX_ITEMS_PER_RUN).toBe(25);
      expect(env.SCANNER_AI_DAILY_REQUEST_LIMIT).toBe(300);
      expect(env.SCANNER_AI_CACHE_DAYS).toBe(30);
      expect(env.SCANNER_AI_IMAGES).toBe(false);
      expect(env.SCANNER_AI_MAX_INPUT_CHARS).toBe(6_000);
    });

    it('sprejme ključ, drug model in drugo osnovo; neveljavna osnova je zavrnjena z imenom spremenljivke', () => {
      const env = loadEnv({ ...VALID, OPENAI_API_KEY: 'sk-test', OPENAI_MODEL: 'gpt-x', OPENAI_BASE_URL: 'http://localhost:1234/v1' });
      expect(env.OPENAI_API_KEY).toBe('sk-test');
      expect(env.OPENAI_MODEL).toBe('gpt-x');
      resetEnvCacheForTests();
      expect(() => loadEnv({ ...VALID, OPENAI_BASE_URL: 'ni-url' })).toThrowError(/OPENAI_BASE_URL/);
    });
  });
});

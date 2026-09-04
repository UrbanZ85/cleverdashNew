import { z } from 'zod';

// research.md §12: manjkajoča obvezna spremenljivka MORA zaustaviti zagon z imenom
// spremenljivke, ne pripeljati do `undefined` globoko v izvajanju (docs/env-reference.md §6:
// `SALT_ROUNDS` je manjkal v .env in dal `NaN`; vrstice z `:` namesto `=` so bile tiho
// prezrte). Zato je shema strogo, brez privzetkov na mestu uporabe.

const boolFromString = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true');

const envSchema = z.object({
  // Osnovno
  NODE_ENV: z.enum(['production', 'development', 'test']).default('production'),
  PORT: z.coerce.number().int().positive().default(3000),
  TZ: z.literal('Europe/Ljubljana'),
  PUBLIC_BASE_URL: z.string().url(),
  APP_NAME: z.string().default('CleverDash'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // Baza
  MONGO_URI: z.string().min(1, 'MONGO_URI je obvezen'),

  // Avtentikacija — 004: Keycloak (OIDC, backend-for-frontend) nadomesti e-pošto/geslo.
  // research.md §12. Dostopni žeton, ki ga CleverDash vrne SPA, je Keycloakov LASTEN
  // `access_token`, posredovan naprej (relay) — ne podpisujemo/izdajamo lastnega JWT-ja zanj,
  // zato `JWT_ACCESS_SECRET`/`ACCESS_TOKEN_TTL` odpadeta (popravek med implementacijo, glej
  // research.md §2: Keycloakov `expires_in` pove veljavnost). `SESSION_COOKIE_SECRET`
  // podpiše LOČEN notranji sejni piškotek, ki samo referencira `KeycloakSession`
  // (nadomešča prejšnji `JWT_REFRESH_SECRET`) — glej platform/keycloak/session.service.ts.
  SESSION_COOKIE_SECRET: z.string().min(32, 'SESSION_COOKIE_SECRET mora imeti vsaj 32 znakov'),
  KEYCLOAK_ISSUER_URL: z.string().url('KEYCLOAK_ISSUER_URL mora biti veljaven URL'),
  KEYCLOAK_CLIENT_ID: z.string().min(1, 'KEYCLOAK_CLIENT_ID je obvezen'),
  KEYCLOAK_CLIENT_SECRET: z.string().min(1, 'KEYCLOAK_CLIENT_SECRET je obvezen'),
  KEYCLOAK_ADMIN_ROLE: z.string().default('cleverdash-admin'),
  // FR-007/FR-008: sam obstoj veljavnega Keycloak računa NE zadošča — brez te ALI admin
  // vloge/skupine je oseba zavrnjena z jasnim sporočilom (role-mapping.ts, popravek med
  // implementacijo: prvotni research.md §6 je razlikoval samo admin/ni-admin, manjkala je
  // osnovna vloga za "ima sploh dostop").
  KEYCLOAK_USER_ROLE: z.string().default('cleverdash-user'),
  KEYCLOAK_INTROSPECTION_CACHE_SECONDS: z.coerce.number().int().positive().default(5),

  // Obvestila
  GOOGLE_APPLICATION_CREDENTIALS: z.string().optional(),
  FCM_KEY_FILE: z.string().optional(),
  NOTIFY_ON_SUCCESS: boolFromString.default('false'),

  // Zdravje — člen VII: zunanji dead man's switch. Neobvezen, a njegova odsotnost je vidna
  // v /health (glej platform/health), ne samo tiho izpuščena.
  HEALTHCHECK_PING_URL: z.string().url().optional().or(z.literal('')),
  HEALTHCHECK_PING_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),

  // ARSO (001)
  ARSO_RADAR_URL: z
    .string()
    .url()
    .default('https://meteo.arso.gov.si/uploads/probase/www/observ/radar/si0-rm-anim.gif'),
  ARSO_WEATHER_URL: z.string().url().default('https://vreme.arso.gov.si/api/1.0/location/'),
  // 003, FR-037: `webcam[].image` v ARSO odgovoru je RELATIVNA pot (npr.
  // "LJUBL-ANA_BEZIGRAD_dir/siwc_....jpg"). Prva domneva (vreme.arso.gov.si/webcam/) je
  // vrnila 200 z HTML (SPA "catch-all", ne prava slika) — napačna past enakega vzorca, ki
  // ga ima naša lastna Caddy `try_files`. Pravi naslov (razviden iz JS svežnja SPA,
  // "/uploads/probase/www/observ/webcam/", in preverjen z resnično 800×600 JPEG sliko
  // 21. 8. 2026) je na ISTEM gostitelju in po ISTEM vzorcu kot ARSO_RADAR_URL — samo
  // "webcam" namesto "radar" (docs/acceptance-003.md).
  ARSO_WEBCAM_BASE_URL: z
    .string()
    .url()
    .default('https://meteo.arso.gov.si/uploads/probase/www/observ/webcam/'),
  ARSO_DEFAULT_LOCATION: z.string().default('Ljubljana'),
  RADAR_CACHE_SECONDS: z.coerce.number().int().positive().default(300),
  WEATHER_CACHE_SECONDS: z.coerce.number().int().positive().default(600),

  // Pot (ploščica "Pot" na nadzorni plošči) — Google Routes API za čas poti in zamudo
  // zaradi prometa.
  //
  // DVA LOČENA KLJUČA in to ni podvajanje:
  //  - `GOOGLE_MAPS_SERVER_KEY` kliče Routes API in ostane IZKLJUČNO na strežniku (člen IV).
  //    Omeji ga po naslovu IP strežnika in samo na "Routes API".
  //  - `GOOGLE_MAPS_EMBED_KEY` je NEOBVEZEN in konča v naslovu `<iframe>`, torej ga vidi
  //    vsak, ki odpre nadzorno ploščo. Zato MORA biti drug ključ, omejen po napotitelju
  //    (HTTP referrer) na `PUBLIC_BASE_URL` in samo na "Maps Embed API". Brez njega se
  //    zemljevid izriše prek klasične oblike `output=embed`, ki ključa ne potrebuje.
  //
  // Brez `GOOGLE_MAPS_SERVER_KEY` ploščica deluje naprej: pokaže zemljevida, čas poti pa
  // pove, da ni nastavljen ključ (nikoli tiho prazno polje, člen VII).
  GOOGLE_MAPS_SERVER_KEY: z.string().optional().or(z.literal('')),
  GOOGLE_MAPS_EMBED_KEY: z.string().optional().or(z.literal('')),
  GOOGLE_ROUTES_URL: z.string().url().default('https://routes.googleapis.com/directions/v2:computeRoutes'),
  // Vsaka osvežitev je ENA plačljiva zahteva na smer. 300 s je kompromis: zamuda zaradi
  // prometa se v petih minutah opazno spremeni, hkrati pa odprta nadzorna plošča cel dan
  // pomeni ~24 zahtev na uro za obe smeri skupaj. Višja vrednost = manj stroškov.
  COMMUTE_CACHE_SECONDS: z.coerce.number().int().positive().default(300),
  COMMUTE_ROUTES_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),

  // E-pošta — neobvezna (research.md §1.2): če SMTP_HOST manjka, pošiljanje se preskoči.
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  NOTIFY_EMAIL_TO: z.string().optional(),

  // Brskalnik (002, research.md §2/§14) — .env.example jih je 001 predvidela, a shema jih
  // do zdaj ni validirala, kar je natanko past iz docs/env-reference.md §6 (SALT_ROUNDS → NaN).
  PUPPETEER_SKIP_DOWNLOAD: boolFromString.default('true'),
  PUPPETEER_EXECUTABLE_PATH: z.string().default('/usr/bin/chromium'),
  BROWSER_HEADLESS: boolFromString.default('true'),
  BROWSER_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  BROWSER_PROTOCOL_TIMEOUT_MS: z.coerce.number().int().positive().default(60000),
  BROWSER_NO_SANDBOX: boolFromString.default('false'),
  BROWSER_USER_AGENT: z
    .string()
    .default(
      'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36',
    ),

  // Scheduler (002, research.md §3/§8) — SCHEDULE_TIMEZONE je namenoma ločena od TZ, da je
  // domenska odločitev eksplicitna, ne zgolj podedovana od vsebnika.
  SCHEDULER_ENABLED: boolFromString.default('true'),
  SCHEDULER_TICK_SECONDS: z.coerce.number().int().positive().default(30),
  SCHEDULE_TIMEZONE: z.literal('Europe/Ljubljana').default('Europe/Ljubljana'),
  DRY_RUN: boolFromString.default('false'),
  CLOCK_PORTAL: z.enum(['puppeteer', 'fake']).default('puppeteer'),

  // Datoteke (002) — posnetki zaslona ob napaki (člen VI).
  SCREENSHOT_DIR: z.string().default('/app/data/screenshots'),
  SCREENSHOT_RETENTION_DAYS: z.coerce.number().int().positive().default(30),

  // Kamere (003, research.md §13/§14) — osnovni seznam dovoljenih gostiteljev za vdelavo
  // (FR-022), razširjen prek `cameraEmbedAllowlist` (research.md §6); prag in množitelj za
  // izpeljavo zdravja kamere (FR-011, data-model.md).
  CAMERA_ALLOWED_EMBED_HOSTS: z.string().default('youtube.com,ipcamlive.com,istrastream.com,arso.gov.si'),
  CAMERA_UNREACHABLE_THRESHOLD: z.coerce.number().int().positive().default(3),
  CAMERA_DEGRADED_REFRESH_MULTIPLIER: z.coerce.number().positive().default(4),
  CAMERA_DEFAULT_REFRESH_SECONDS: z.coerce.number().int().positive().default(30),
  // Brez privzetka — obvezen, kadar koli je vsaj ena kamera s poverilnicami (research.md
  // §14); ker shema ne loči pogojno, je obvezen vedno, enako kot SESSION_COOKIE_SECRET.
  CREDENTIALS_ENCRYPTION_KEY: z
    .string()
    .length(44, 'CREDENTIALS_ENCRYPTION_KEY mora biti 32 bajtov v base64 (44 znakov)'),

  // Beležke (007) — zgornja meja za en zvočni posnetek in NEOBVEZNA storitev za prepis
  // govora. Brez `NOTES_TRANSCRIPTION_URL` in `NOTES_TRANSCRIPTION_API_KEY` prepis na
  // strežniku ne obstaja: modul deluje naprej, narekovanje pa teče v brskalniku (Web Speech
  // API) in posnetek nikoli ne zapusti tega strežnika. Sam ključ še NE pomeni, da se posnetki
  // pošiljajo ven — potrebna je še osebna privolitev v nastavitvah, glej
  // modules/notes/domain/transcription-gate.ts.
  NOTES_AUDIO_MAX_MB: z.coerce.number().int().positive().max(100).default(10),
  NOTES_TRANSCRIPTION_URL: z.string().url().optional().or(z.literal('')),
  NOTES_TRANSCRIPTION_API_KEY: z.string().optional().or(z.literal('')),
  NOTES_TRANSCRIPTION_MODEL: z.string().default('whisper-1'),
  NOTES_TRANSCRIPTION_LANGUAGE: z.string().default('sl'),
  NOTES_TRANSCRIPTION_TIMEOUT_MS: z.coerce.number().int().positive().default(120_000),

  // Deljenje datotek (009) — vse s privzetki v kodi, da `docker compose up` iz čiste kopije
  // deluje brez dopolnjevanja `.env` (kakovostna vrata, točka 4). `FILE_SHARE_DIR` sledi
  // vzorcu `SCREENSHOT_DIR` zgoraj: pot v vsebniku, ki je montirana kot trajen nosilec
  // (infra/docker-compose.yml, `shared-files`) — brez njega naložene datoteke izginejo ob
  // prvi posodobitvi slike.
  //
  // OPOZORILO iz iste datoteke: `SCREENSHOT_RETENTION_DAYS` je razglašen in ga nihče ne
  // bere — čiščenja posnetkov ni. `FILE_SHARE_RETENTION_DAYS` te napake ne sme ponoviti in
  // ga MORA brati `modules/file-sharing/services/cleanup.service.ts` (research.md §15).
  FILE_SHARE_DIR: z.string().default('/app/data/files'),
  FILE_SHARE_MAX_MB: z.coerce.number().int().positive().default(500),
  FILE_SHARE_QUOTA_MB: z.coerce.number().int().positive().default(5000),
  FILE_SHARE_DEFAULT_EXPIRY_DAYS: z.coerce.number().int().positive().default(7),
  FILE_SHARE_RETENTION_DAYS: z.coerce.number().int().positive().default(7),
  FILE_SHARE_GRANT_MINUTES: z.coerce.number().int().positive().default(10),
  FILE_SHARE_ATTEMPT_LIMIT: z.coerce.number().int().positive().default(10),
  FILE_SHARE_ATTEMPT_WINDOW_MINUTES: z.coerce.number().int().positive().default(15),
  FILE_SHARE_LOCK_MINUTES: z.coerce.number().int().positive().default(60),
  FILE_SHARE_CLEANUP_INTERVAL_MINUTES: z.coerce.number().int().positive().default(60),
  FILE_SHARE_UPLOAD_TIMEOUT_MINUTES: z.coerce.number().int().positive().default(360),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

/**
 * Prebere in validira `process.env`. Ob manjkajoči ali neveljavni obvezni vrednosti vrže
 * napako z imenom spremenljivke in razlogom — zagon se MORA ustaviti tukaj, ne kasneje.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(
      `Neveljavna ali manjkajoča konfiguracija okolja:\n${lines.join('\n')}\n` +
        'Zagon se ustavlja — glej docs/env-reference.md in .env.example.',
    );
  }
  cached = parsed.data;
  return cached;
}

/** Samo za teste: pobriše predpomnjeno vrednost, da se `loadEnv` znova prebere. */
export function resetEnvCacheForTests(): void {
  cached = undefined;
}

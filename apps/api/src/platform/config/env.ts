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

  // Avtentikacija
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET mora imeti vsaj 32 znakov'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET mora imeti vsaj 32 znakov'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL: z.string().default('30d'),
  PASSWORD_HASH_ALGO: z.literal('argon2id').default('argon2id'),
  ADMIN_EMAIL: z.string().email('ADMIN_EMAIL mora biti veljaven e-poštni naslov'),
  ADMIN_INITIAL_PASSWORD: z.string().min(12, 'ADMIN_INITIAL_PASSWORD mora imeti vsaj 12 znakov'),

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
  ARSO_DEFAULT_LOCATION: z.string().default('Ljubljana'),
  RADAR_CACHE_SECONDS: z.coerce.number().int().positive().default(300),
  WEATHER_CACHE_SECONDS: z.coerce.number().int().positive().default(600),

  // E-pošta — neobvezna (research.md §1.2): če SMTP_HOST manjka, pošiljanje se preskoči.
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  NOTIFY_EMAIL_TO: z.string().optional(),
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

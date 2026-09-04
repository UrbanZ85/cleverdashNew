import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

// FR-010/FR-012/FR-013, research.md §7: geslo za prevzem generira SISTEM, prikaže se natanko
// enkrat in se NIKOLI ne shrani v berljivi obliki.
//
// Zakaj scrypt in ne platform/crypto/secret-box.ts: `secret-box` je AES-256-GCM in obstaja za
// poverilnice kamer (003), ki jih mora strežnik znati PREBRATI NAZAJ. Geslo za prevzem se ne
// bere nazaj, ampak preverja — šifrirano geslo bi pomenilo, da ga ključ iz `.env` razkrije,
// kar FR-012 izrecno prepoveduje.
//
// Člen IX: čista funkcija (razen vira naključja), brez baze, omrežja in datotečnega sistema.

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/** 32 znakov: velike črke brez `I` in `O`, števke brez `0` in `1` — geslo je pogosto treba
 * prebrati po telefonu, `l/1/I` in `0/O` pa so tam neločljivi. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PASSWORD_LENGTH = 16; // 16 × 5 bitov = 80 bitov
const GROUP_SIZE = 4;

/** scrypt parametri. `N=32768, r=8` porabi 128·N·r = 32 MiB, kar je NATANKO privzeti `maxmem`
 * Node.js — brez dvignjenega `maxmem` klic spodleti z "Invalid scrypt params". */
const SCRYPT = { N: 32768, r: 8, p: 1, keylen: 64, maxmem: 64 * 1024 * 1024 } as const;
const SALT_BYTES = 16;

/**
 * Novo geslo iz kriptografsko varnega vira.
 *
 * Zavrnitve ostanka ni in ni potrebna: 256 je večkratnik 32, zato je `bajt % 32` enakomerno
 * porazdeljen po abecedi. Pri abecedi, ki ni delitelj 256, bi bila zavrnitev obvezna.
 */
export function generatePassword(): string {
  const bytes = randomBytes(PASSWORD_LENGTH);
  let out = '';
  for (const byte of bytes) out += ALPHABET[byte % ALPHABET.length];
  return out;
}

/** `H7K2-9MTX-4RQP-VN63` — po štiri, ker se tako narekuje in prepisuje. */
export function formatForDisplay(password: string): string {
  const groups: string[] = [];
  for (let i = 0; i < password.length; i += GROUP_SIZE) groups.push(password.slice(i, i + GROUP_SIZE));
  return groups.join('-');
}

/**
 * Vnos prejemnika v obliko, v kateri je bilo geslo generirano.
 *
 * Velike črke se uveljavijo: abeceda malih črk sploh ne vsebuje, zato dve različni gesli ne
 * moreta biti enaki "do velikosti črk" — normalizacija ne zmanjša prostora gesel, prepreči pa
 * zavrnitev nekoga, ki je geslo prepisal z malimi črkami.
 */
export function normalizePasswordInput(raw: string): string {
  return String(raw ?? '')
    .replace(/[\s-]/g, '')
    .toUpperCase();
}

/** `scrypt$N$r$p$sol$povzetek` — parametri so DEL zapisa, da jih je mogoče kasneje dvigniti
 * brez migracije obstoječih gesel. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derived = await scrypt(normalizePasswordInput(password), salt, SCRYPT.keylen, SCRYPT);
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), derived.toString('base64')].join('$');
}

interface ParsedHash {
  N: number;
  r: number;
  p: number;
  salt: Buffer;
  derived: Buffer;
}

function parseHash(stored: string): ParsedHash | null {
  const parts = String(stored ?? '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return null;
  const [, rawN, rawR, rawP, rawSalt, rawDerived] = parts as [string, string, string, string, string, string];
  const N = Number(rawN);
  const r = Number(rawR);
  const p = Number(rawP);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return null;
  const salt = Buffer.from(rawSalt, 'base64');
  const derived = Buffer.from(rawDerived, 'base64');
  if (salt.length === 0 || derived.length === 0) return null;
  return { N, r, p, salt, derived };
}

/**
 * Preveri geslo proti shranjenemu zapisu.
 *
 * Primerjava gre prek `timingSafeEqual` nad IZHODOMA scrypta (oba enake dolžine), ne nad
 * geslema: čas odgovora ne sme izdati, koliko uvodnih znakov se ujema. Pokvarjen ali tuj
 * zapis vrne `false` in ne vrže — napačna oblika v bazi ne sme pomeniti 500 na javni poti.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parsed = parseHash(stored);
  if (!parsed) return false;
  const derived = await scrypt(normalizePasswordInput(password), parsed.salt, parsed.derived.length, {
    N: parsed.N,
    r: parsed.r,
    p: parsed.p,
    maxmem: SCRYPT.maxmem,
  });
  return timingSafeEqual(derived, parsed.derived);
}

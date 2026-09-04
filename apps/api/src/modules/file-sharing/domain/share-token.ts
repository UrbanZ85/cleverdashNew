import { randomBytes } from 'node:crypto';

// FR-014, research.md §6: žeton v javni povezavi.
//
// 16 naključnih bajtov (128 bitov) v `base64url` = 22 znakov. NI izpeljan iz identifikatorja
// zapisa, imena datoteke, lastnika ne zaporedne številke — iz ene povezave ni mogoče izpeljati
// druge.
//
// Zakaj ne Mongo `_id`: `ObjectId` nosi časovni žig in števec, zato se dva zaporedno naložena
// zapisa razlikujeta v nekaj bitih. Povezava mora biti neuganljiva tudi za nekoga, ki že ima
// eno svojo.

const TOKEN_BYTES = 16;
export const SHARE_TOKEN_LENGTH = 22;

export function generateShareToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

export function isShareTokenShaped(value: unknown): boolean {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{22}$/.test(value);
}

/** Dovolilnica za prevzem — 32 bajtov, ker potuje v piškotku in ne v naslovu (research.md §8). */
export function generateGrant(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Javna povezava, kakršno lastnik pošlje prejemniku.
 *
 * Sestavlja se ob branju iz `PUBLIC_BASE_URL` in se NE shranjuje: naslov namestitve je
 * nastavitev okolja in bi se ob selitvi domene tiho pokvaril v vsakem starem zapisu.
 */
export function buildShareUrl(publicBaseUrl: string, token: string): string {
  return `${publicBaseUrl.replace(/\/+$/, '')}/d/${token}`;
}

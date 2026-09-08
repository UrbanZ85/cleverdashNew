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

const GRANT_BYTES = 32;
/** 32 bajtov v base64url. */
const GRANT_LENGTH = 43;

export function generateShareToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

export function isShareTokenShaped(value: unknown): boolean {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{22}$/.test(value);
}

/** Dovolilnica za prevzem — 32 bajtov, ker potuje v piškotku in ne v naslovu (research.md §8). */
export function generateGrant(): string {
  return randomBytes(GRANT_BYTES).toString('base64url');
}

/**
 * Ali je vrednost SPLOH videti kot dovolilnica.
 *
 * Nastalo iz najdbe varnostnega pregleda 009b, ki pa je zadevala 009: `cookie-parser` na vsak
 * piškotek uporabi `JSONCookies`, zato vrednost, ki se začne z `j:`, v `req.cookies` NI niz,
 * ampak razčlenjen objekt. `cd_share=j:{"$ne":null}` je tako prišel v pogoj poizvedbe kot
 * OPERATOR, Mongoose pa ga je ubogal: pogoj se je prevedel v "katera koli živa dovolilnica za to
 * datoteko". Kdor je imel naslov, je vsebino dobil brez gesla, brez enega samega poskusa ugibanja
 * — dokler je bila v obtoku ena zakonita odklenitev.
 *
 * Zato oblika PRED poizvedbo, ne za njo, in enako kot `isTicketShaped` za oddajo. Globalni
 * `mongoose.set('sanitizeFilter', true)` bi bil videti kot krajša pot, a bi zahteval
 * `mongoose.trusted()` pri vsakem legitimnem `$gt`/`$ne`/`$in` v vsem zaledju — torej desetine
 * mest, kjer je pozabljen ovoj tiha okvara poizvedbe.
 */
export function isGrantShaped(value: unknown): value is string {
  return typeof value === 'string' && new RegExp(`^[A-Za-z0-9_-]{${GRANT_LENGTH}}$`).test(value);
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

/**
 * Javni naslov SPREJEMNEGA PREDALA (009b, FR-081), kakršnega lastnik pošlje pošiljatelju.
 *
 * Isti žeton kot pri deljenju (`generateShareToken`) in isti razlog: 128 bitov naključja, nič
 * izpeljanega iz zapisa. Različna je samo pot — `/u/` (upload) proti `/d/` (download) — ker sta
 * to dva različna zaslona z dvema različnima nevarnostma, in nihče, ki bere dnevnik ali naslov v
 * pogovoru, ne sme biti v dvomu, katera smer je bila v igri.
 */
export function buildDropUrl(publicBaseUrl: string, token: string): string {
  return `${publicBaseUrl.replace(/\/+$/, '')}/u/${token}`;
}

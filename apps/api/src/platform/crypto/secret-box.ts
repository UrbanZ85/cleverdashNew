import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// research.md §14, plan.md Complexity Tracking: člen IV zahteva, da skrivnosti niso v kodi
// ali gitu; spec.md FR-005 (003) zahteva več — da so poverilnice kamer ŠIFRIRANE na disku,
// ne le izpuščene iz API odgovorov (v nasprotju z 002-ovim `remoteSessions.cookieValue`,
// ki je v bazi golo besedilo). Ta modul je skupna storitev v `platform/`, ne last modula
// `cameras`, ker jo bo verjetno potrebovala tudi katera prihodnja funkcionalnost s
// poverilnicami (člen I — moduli ne podvajajo skupnih storitev).
//
// AES-256-GCM: `iv` (12 bajtov, naključen na vsak klic) + `tag` (GCM avtentikacijska
// značka, 16 bajtov) + šifrirano besedilo, vsi trije base64, ločeni z `:`. Napačen ključ ali
// popačen zapis `decrypt()` zavrne (GCM tag se ne ujema), ne vrne tihe napačne vrednosti.

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

function resolveKey(base64Key: string): Buffer {
  const key = Buffer.from(base64Key, 'base64');
  if (key.length !== 32) {
    throw new Error(`CREDENTIALS_ENCRYPTION_KEY mora biti 32 bajtov po dekodiranju (je ${key.length}).`);
  }
  return key;
}

export function encrypt(plaintext: string, base64Key: string): string {
  const key = resolveKey(base64Key);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join(':');
}

export function decrypt(sealed: string, base64Key: string): string {
  const key = resolveKey(base64Key);
  const parts = sealed.split(':');
  if (parts.length !== 3) {
    throw new Error('Šifriran zapis ima nepričakovano obliko (pričakovana so 3 polja, ločena z ":").');
  }
  const [ivPart, tagPart, ciphertextPart] = parts as [string, string, string];
  const iv = Buffer.from(ivPart, 'base64');
  const tag = Buffer.from(tagPart, 'base64');
  const ciphertext = Buffer.from(ciphertextPart, 'base64');

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}

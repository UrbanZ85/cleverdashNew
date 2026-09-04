import { describe, expect, it } from 'vitest';
import { encrypt, decrypt } from '../../src/platform/crypto/secret-box.js';

const KEY = Buffer.alloc(32, 42).toString('base64');
const OTHER_KEY = Buffer.alloc(32, 7).toString('base64');

describe('secret-box — AES-256-GCM (research.md §14)', () => {
  it('round-trip: dešifrirano besedilo je enako izvirniku', () => {
    const sealed = encrypt('uporabnik:geslo123', KEY);
    expect(decrypt(sealed, KEY)).toBe('uporabnik:geslo123');
  });

  it('dva klica encrypt() z istim besedilom vrneta različen zapis (naključen IV)', () => {
    const a = encrypt('isto besedilo', KEY);
    const b = encrypt('isto besedilo', KEY);
    expect(a).not.toBe(b);
  });

  it('dešifriranje z napačnim ključem zavrže (GCM tag se ne ujema)', () => {
    const sealed = encrypt('tajno', KEY);
    expect(() => decrypt(sealed, OTHER_KEY)).toThrow();
  });

  it('popačen zapis (spremenjen zadnji znak) zavrne dešifriranje', () => {
    const sealed = encrypt('tajno', KEY);
    const tampered = sealed.slice(0, -1) + (sealed.at(-1) === 'A' ? 'B' : 'A');
    expect(() => decrypt(tampered, KEY)).toThrow();
  });

  it('zapis brez treh delov (":" ločenih) zavrne dešifriranje', () => {
    expect(() => decrypt('samo-en-del', KEY)).toThrow();
  });

  it('ključ, ki po dekodiranju ni 32 bajtov, zavrne enkripcijo', () => {
    expect(() => encrypt('tajno', Buffer.alloc(16).toString('base64'))).toThrow();
  });
});

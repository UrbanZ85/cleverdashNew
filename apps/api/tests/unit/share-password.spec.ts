import { describe, expect, it } from 'vitest';
import {
  formatForDisplay,
  generatePassword,
  hashPassword,
  normalizePasswordInput,
  verifyPassword,
} from '../../src/modules/file-sharing/domain/share-password.js';

// 009, research.md §21: nadomešča primere iz kakovostnih vrat, ki v tem modulu nimajo predmeta.

describe('generatePassword', () => {
  it('je 16 znakov iz abecede brez dvoumnih znakov', () => {
    for (let i = 0; i < 50; i++) {
      const password = generatePassword();
      expect(password).toHaveLength(16);
      expect(password).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{16}$/);
      // 0/O in 1/l/I so po telefonu neločljivi — v abecedi jih ni.
      expect(password).not.toMatch(/[01IO]/);
    }
  });

  it('dve zaporedni gesli nista enaki (naključje ni izpeljano iz časa)', () => {
    const passwords = new Set(Array.from({ length: 200 }, () => generatePassword()));
    expect(passwords.size).toBe(200);
  });

  it('prikaz je v štirih četvorkah', () => {
    expect(formatForDisplay('H7K2') + '').toBe('H7K2');
    expect(formatForDisplay('ABCDEFGHJKLMNPQR')).toBe('ABCD-EFGH-JKLM-NPQR');
  });
});

describe('normalizePasswordInput', () => {
  it('odstrani vezaje in presledke iz prikaza', () => {
    expect(normalizePasswordInput('ABCD-EFGH-JKLM-NPQR')).toBe('ABCDEFGHJKLMNPQR');
    expect(normalizePasswordInput('  ABCD EFGH  ')).toBe('ABCDEFGH');
  });

  it('uveljavi velike črke — abeceda malih sploh ne vsebuje, zato se prostor gesel ne zmanjša', () => {
    expect(normalizePasswordInput('abcd-efgh')).toBe('ABCDEFGH');
  });
});

describe('hashPassword / verifyPassword', () => {
  it('shranjeni zapis ne vsebuje gesla in nosi parametre', async () => {
    const password = generatePassword();
    const stored = await hashPassword(password);
    expect(stored).not.toContain(password);
    expect(stored.startsWith('scrypt$32768$8$1$')).toBe(true);
    expect(stored.split('$')).toHaveLength(6);
  });

  it('isto geslo dvakrat da RAZLIČEN zapis (naključna sol)', async () => {
    const password = generatePassword();
    expect(await hashPassword(password)).not.toBe(await hashPassword(password));
  });

  it('sprejme pravilno geslo, tudi prepisano z vezaji ali malimi črkami', async () => {
    const password = generatePassword();
    const stored = await hashPassword(password);
    expect(await verifyPassword(password, stored)).toBe(true);
    expect(await verifyPassword(formatForDisplay(password), stored)).toBe(true);
    expect(await verifyPassword(password.toLowerCase(), stored)).toBe(true);
  });

  it('zavrne napačno geslo ENAKE dolžine — obe poti sta enaki do primerjave', async () => {
    // Bistvo ni izid (ta je očiten), ampak da pravilno in napačno geslo enake dolžine
    // preideta isto pot: izpeljavo scrypta in `timingSafeEqual` nad izhodoma enake dolžine.
    // Primerjava nad surovima geslama bi se lahko končala na prvem različnem znaku.
    const stored = await hashPassword('ABCDEFGHJKLMNPQR');
    expect(await verifyPassword('ABCDEFGHJKLMNPQS', stored)).toBe(false);
    expect(await verifyPassword('ZBCDEFGHJKLMNPQR', stored)).toBe(false);
  });

  it('geslo, ki odklepa DRUGO datoteko, tu ne odklene ničesar', async () => {
    const [prva, druga] = [generatePassword(), generatePassword()];
    const stored = await hashPassword(prva);
    expect(await verifyPassword(druga, stored)).toBe(false);
  });

  it('povzetek z DRUGIMI parametri se še vedno preveri — parametri so del zapisa', async () => {
    // Dvig parametrov v prihodnosti ne sme razveljaviti obstoječih gesel: preverjanje bere
    // N/r/p iz zapisa, ne iz trenutne konstante.
    const stored = await hashPassword('ABCDEFGHJKLMNPQR');
    const [, , r, p, salt, derived] = stored.split('$');
    const lower = ['scrypt', '16384', r, p, salt, derived].join('$');
    // Z drugimi parametri se izpeljava ne ujema — a klic ne sme vreči in ne sme reči "da".
    expect(await verifyPassword('ABCDEFGHJKLMNPQR', lower)).toBe(false);
  });

  it('pokvarjen ali tuj zapis vrne false in NE vrže — javna pot ne sme dati 500', async () => {
    for (const stored of ['', 'ni-zapis', 'scrypt$a$b$c$d$e', 'bcrypt$32768$8$1$c29s$cG92', 'scrypt$32768$8$1$$']) {
      await expect(verifyPassword('karkoli', stored)).resolves.toBe(false);
    }
  });
});

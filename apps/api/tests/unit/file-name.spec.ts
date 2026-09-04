import { describe, expect, it } from 'vitest';
import { sanitizeFileName } from '../../src/modules/file-sharing/domain/file-name.js';

// 009, research.md §21: nadomešča primere iz kakovostnih vrat, ki v tem modulu nimajo predmeta
// (poletni/zimski čas, praznik, dopust, ponovljen klik).

describe('sanitizeFileName', () => {
  it('iz poti vzame samo ime datoteke — `..` in ločila poti ne preživijo', () => {
    expect(sanitizeFileName('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFileName('C:\\pot\\ime.txt')).toBe('ime.txt');
    expect(sanitizeFileName('/absolutna/pot/porocilo.pdf')).toBe('porocilo.pdf');
  });

  it('ime iz samih pik ni ime, ampak pot — nadomesti se', () => {
    expect(sanitizeFileName('..')).toBe('datoteka');
    expect(sanitizeFileName('.')).toBe('datoteka');
    expect(sanitizeFileName('../')).toBe('datoteka');
  });

  it('vodilna pika OSTANE — skrita datoteka je legitimno ime', () => {
    expect(sanitizeFileName('.env.example')).toBe('.env.example');
    expect(sanitizeFileName('.pdf')).toBe('.pdf');
  });

  it('odstrani znake za novo vrstico — ime konča v glavi Content-Disposition', () => {
    // Brez tega bi bilo ime datoteke vbrizg v glave odgovora, tudi kadar ni nikoli pot.
    const injected = 'racun.pdf\r\nX-Podtaknjena-Glava: da';
    const result = sanitizeFileName(injected);
    expect(result).not.toContain('\r');
    expect(result).not.toContain('\n');
    expect(result).toBe('racun.pdfX-Podtaknjena-Glava: da');
  });

  it('odstrani krmilne in nevidne znake', () => {
    expect(sanitizeFileName('ime\u0000\u200B.txt')).toBe('ime.txt');
  });

  it('prazno ime in ime iz samih presledkov postaneta nadomestek', () => {
    expect(sanitizeFileName('')).toBe('datoteka');
    expect(sanitizeFileName('   ')).toBe('datoteka');
    expect(sanitizeFileName(null)).toBe('datoteka');
    expect(sanitizeFileName(undefined)).toBe('datoteka');
  });

  it('skrajša predolgo ime, končnico pa ohrani', () => {
    const long = `${'a'.repeat(300)}.tar.gz`;
    const result = sanitizeFileName(long);
    expect(result).toHaveLength(200);
    expect(result.endsWith('.gz')).toBe(true);
  });

  it('šumniki in presledki preživijo — ime je za človeka, ne za datotečni sistem', () => {
    expect(sanitizeFileName('  Letno poročilo — čistopis.docx  ')).toBe('Letno poročilo — čistopis.docx');
  });

  it('nikoli ne vrne praznega niza in nikoli ne vsebuje ločila poti', () => {
    for (const input of ['', '/', '\\', '..', './../', 'a/b/c/', '   /  ']) {
      const result = sanitizeFileName(input);
      expect(result.length).toBeGreaterThan(0);
      expect(result).not.toContain('/');
      expect(result).not.toContain('\\');
    }
  });
});

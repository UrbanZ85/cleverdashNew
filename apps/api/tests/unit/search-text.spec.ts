import { describe, expect, it } from 'vitest';
import {
  buildSearchText,
  escapeRegExp,
  foldForSearch,
} from '../../src/modules/saved-links/domain/search-text.js';

// 008, quickstart.md §4 — drugi nadomestek za poimenske primere iz kakovostnih vrat
// (research.md §13): ujemanje pri iskanju, neobčutljivo na velike črke in na diakritiko.
//
// ISTI nabor primerov ima `apps/web/tests/unit/fold-text.spec.ts` nad odjemalčevo kopijo
// funkcije — podvojitev je zavestna (plan.md, Complexity Tracking) in oba testa jo držita
// skupaj: če se pravili razideta, se iskanje na zaslonu in iskanje prek HTTP ne ujemata več.

describe('foldForSearch', () => {
  it('odstrani šumnike in zniža velike črke — `cas` mora najti "časa"', () => {
    expect(foldForSearch('Beleženje časa')).toBe('belezenje casa');
    expect(foldForSearch('Beleženje časa')).toContain('casa');
  });

  it('velike črke niso ovira v nobeni smeri', () => {
    expect(foldForSearch('SLO')).toBe('slo');
    expect(foldForSearch('slo')).toBe('slo');
  });

  it('pokrije vse tri slovenske pare, ne le enega', () => {
    expect(foldForSearch('ČŠŽ čšž')).toBe('csz csz');
  });

  it('diakritika drugih jezikov pride z isto potjo, brez tabele preslikav', () => {
    // `ü` in `ï` sta črka + diakritika, zato ju NFD razstavi. `ß` NI diakritika, ampak svoja
    // črka, in ostane — to je meja tega pristopa in ne napaka: nemški zapis bi za `ss`
    // potreboval tabelo preslikav, ki je za slovenski vmesnik nočemo (research.md §6).
    expect(foldForSearch('Grüße naïve')).toBe('gruße naive');
  });

  it('naslov strani ostane uporaben — pike in poševnice se ne odstranijo', () => {
    expect(foldForSearch('https://www.ARSO.gov.si/x')).toBe('https://www.arso.gov.si/x');
  });
});

describe('buildSearchText', () => {
  it('zajame ime, naslov IN komentar (FR-030)', () => {
    const text = buildSearchText({
      title: 'Beleženje časa',
      url: 'https://www.arso.gov.si/vreme',
      comment: 'Za jutranjo napoved',
    });
    expect(text).toContain('belezenje casa');
    // `arso` je samo v naslovu — quickstart.md §3.2, primer 2.
    expect(text).toContain('arso.gov.si');
    // `napoved` je samo v komentarju.
    expect(text).toContain('jutranjo napoved');
  });

  it('deluje brez komentarja — `null` ne sme pripeljati do niza "null"', () => {
    const text = buildSearchText({ title: 'Doma', url: 'https://primer.si/', comment: null });
    expect(text).not.toContain('null');
    expect(text).toContain('doma');
  });
});

describe('escapeRegExp', () => {
  it('pika ostane dobesedna pika, ne "poljuben znak"', () => {
    const pattern = new RegExp(escapeRegExp('.'));
    expect(pattern.test('kaltaj')).toBe(false);
    expect(pattern.test('arso.gov.si')).toBe(true);
  });

  it('`...` ne vrne vsega — quickstart.md §3.2, primer 3', () => {
    const pattern = new RegExp(escapeRegExp('...'));
    expect(pattern.test('belezenje casa')).toBe(false);
  });

  it('oklepaji in plusi ne vržejo napake regularnega izraza', () => {
    expect(() => new RegExp(escapeRegExp('c++ ('))).not.toThrow();
    expect(new RegExp(escapeRegExp('c++')).test('vodnik za c++')).toBe(true);
  });
});

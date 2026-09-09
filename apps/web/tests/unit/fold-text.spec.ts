import { describe, expect, it } from 'vitest';
import { foldForSearch, matchesQuery } from '../../src/app/core/search/fold-text.js';

// ISTI nabor primerov kot `apps/api/tests/unit/search-text.spec.ts` nad strežniško kopijo
// funkcije. Podvojitev je zavestna (plan.md, Complexity Tracking) in ta dvojica testov je
// edino, kar drži obe kopiji skupaj: če se pravili razideta, isto iskanje na zaslonu in prek
// HTTP ne dasta istega izida.

describe('foldForSearch', () => {
  it('odstrani šumnike in zniža velike črke — `cas` mora najti "časa"', () => {
    expect(foldForSearch('Beleženje časa')).toBe('belezenje casa');
  });

  it('velike črke niso ovira v nobeni smeri', () => {
    expect(foldForSearch('SLO')).toBe('slo');
    expect(foldForSearch('slo')).toBe('slo');
  });

  it('pokrije vse tri slovenske pare', () => {
    expect(foldForSearch('ČŠŽ čšž')).toBe('csz csz');
  });

  it('naslov strani ostane uporaben — pike in poševnice se ne odstranijo', () => {
    expect(foldForSearch('https://www.ARSO.gov.si/x')).toBe('https://www.arso.gov.si/x');
  });
});

describe('matchesQuery', () => {
  const link = {
    title: 'Beleženje časa',
    url: 'https://www.arso.gov.si/vreme',
    comment: 'Za jutranjo napoved',
  };

  it('najde po delu imena, ne glede na šumnike (US2, scenarij 3)', () => {
    expect(matchesQuery(link, 'cas')).toBe(true);
    expect(matchesQuery(link, 'ČAS')).toBe(true);
  });

  it('najde po delu NASLOVA, tudi kadar niza v imenu ni (US2, scenarij 2)', () => {
    expect(matchesQuery(link, 'arso')).toBe(true);
  });

  it('najde po komentarju', () => {
    expect(matchesQuery(link, 'napoved')).toBe(true);
  });

  it('prazna poizvedba pomeni "vse" — sicer bi prazno polje skrilo seznam', () => {
    expect(matchesQuery(link, '')).toBe(true);
    expect(matchesQuery(link, '   ')).toBe(true);
  });

  it('poizvedba je DOBESEDNA: pika ni "poljuben znak" (US2, quickstart §3.2)', () => {
    expect(matchesQuery({ title: 'Doma', url: 'https://primer' }, '.')).toBe(false);
    expect(matchesQuery({ title: 'Doma', url: 'https://primer' }, '...')).toBe(false);
    // Prava pika se seveda najde.
    expect(matchesQuery(link, 'arso.gov')).toBe(true);
  });

  it('kar se ne ujema, se ne najde', () => {
    expect(matchesQuery(link, 'recepti')).toBe(false);
  });

  it('manjkajoč komentar ne vpliva na ujemanje', () => {
    expect(matchesQuery({ title: 'Doma', url: 'https://a.si/', comment: null }, 'doma')).toBe(true);
  });
});

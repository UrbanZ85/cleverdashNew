import { describe, expect, it } from 'vitest';
import {
  describeSourceStatus,
  formatDuration,
  formatLastCooked,
  ROLE_HINTS,
  ROLE_LABELS,
  MEMBER_ROLES,
  splitLines,
} from '../../src/app/features/recipes/recipes.model.js';

// 013: čiste funkcije vmesnika. Izris komponent ni pokrit tu — pokrite so odločitve, ki jih je
// mogoče pokvariti tiho.

describe('formatDuration', () => {
  it('pokaže ure in minute', () => {
    expect(formatDuration(45)).toBe('45 min');
    expect(formatDuration(90)).toBe('1 h 30 min');
    expect(formatDuration(120)).toBe('2 h');
  });

  it('brez podatka vrne PRAZNO in ne "0 min"', () => {
    // "0 min" bi bila trditev, ki je nihče ni vpisal; prazno pomeni "ni podatka".
    expect(formatDuration(null)).toBe('');
    expect(formatDuration(0)).toBe('');
  });
});

describe('formatLastCooked', () => {
  it('"Še nikoli" je POUDAREK, ne pomanjkljivost', () => {
    // Razvrstitev "Že dolgo ne" postavi prav te na vrh: recept, ki ga človek shrani in nikoli ne
    // skuha, je natanko tisti, ki ga je vredno predlagati.
    expect(formatLastCooked(null)).toBe('Še nikoli');
  });

  it('stopnjuje od dni prek tednov in mesecev do let', () => {
    const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
    expect(formatLastCooked(daysAgo(0))).toBe('Danes');
    expect(formatLastCooked(daysAgo(1))).toBe('Včeraj');
    expect(formatLastCooked(daysAgo(3))).toBe('Pred 3 dnevi');
    expect(formatLastCooked(daysAgo(8))).toBe('Pred tednom');
    expect(formatLastCooked(daysAgo(40))).toBe('Pred mesecem');
    expect(formatLastCooked(daysAgo(400))).toBe('Pred letom');
  });
});

describe('splitLines', () => {
  it('se ujema s pravilom na strežniku — odstrani oznake seznama in prazne vrstice', () => {
    // Odjemalčeva različica je udobje (urejevalnik pokaže, kaj bo shranjeno), strežnik pravilo
    // vseeno uveljavi znova. Razhajanje bi pomenilo, da uporabnik vidi drugo, kot se shrani.
    expect(splitLines('- 400 g buče\n\n* 1 čebula\n1. sol\n   ')).toEqual(['400 g buče', '1 čebula', 'sol']);
  });
});

describe('describeSourceStatus', () => {
  it('molči, kadar ni česa povedati', () => {
    // `none` pomeni "recept nima naslova" in ni napaka; `ok` pomeni, da je vse teklo.
    expect(describeSourceStatus('none')).toBeNull();
    expect(describeSourceStatus('ok')).toBeNull();
  });

  it('pri skipped in failed pove RAZLOG in kaj storiti (člen VI)', () => {
    expect(describeSourceStatus('skipped')).toContain('https');
    expect(describeSourceStatus('failed')).toContain('ročno');
  });
});

describe('besedila vlog', () => {
  it('ima ime in pojasnilo za vsako vlogo', () => {
    for (const role of MEMBER_ROLES) {
      expect(ROLE_LABELS[role]?.length).toBeGreaterThan(0);
      expect(ROLE_HINTS[role]?.length).toBeGreaterThan(0);
    }
  });

  it('pojasnilo pove, kaj vloga DA — ne le kako se imenuje', () => {
    // "Ogled" in "urejanje" sama po sebi ne povesta, ali sme soudeleženec označiti recept za
    // skuhanega; prav to je najpogostejše vprašanje pri deljenju.
    expect(ROLE_HINTS.view).toContain('ne more');
    expect(ROLE_HINTS.edit).toContain('skuhano');
  });
});

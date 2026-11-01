import { describe, expect, it } from 'vitest';
import { parseCardTitle } from '../../../src/modules/collectibles-scanner/domain/card-parse.js';

// 019 (FR-014, FR-016): razčlenitev naslova — samo kar piše; kar ne piše, ostane null.

describe('parseCardTitle — številka', () => {
  it.each([
    ['Pokemon Charizard 4/102 Base Set', '4', '102'],
    ['Pokemon Charizard 004/102', '4', '102'],
    ['Charizard #4/102 holo', '4', '102'],
    ['Charizard ex 125 / 197 Obsidian Flames', '125', '197'],
  ])('%s', (title, number, total) => {
    const p = parseCardTitle(title);
    expect(p.number).toBe(number);
    expect(p.printedTotal).toBe(total);
  });

  it('brez številke je null', () => {
    expect(parseCardTitle('Pokemon Charizard Holo Rare').number).toBeNull();
  });

  it('samo #N brez skupnega števila', () => {
    const p = parseCardTitle('Pikachu #63');
    expect(p.number).toBe('63');
    expect(p.printedTotal).toBeNull();
  });
});

describe('parseCardTitle — ocenjevanje', () => {
  it.each([
    ['Charizard PSA 9', 'PSA', '9'],
    ['Charizard PSA9', 'PSA', '9'],
    ['Charizard PSA 10 Gem Mint', 'PSA', '10'],
    ['Charizard BGS 9.5', 'BGS', '9.5'],
    ['Charizard Beckett 9,5', 'BGS', '9.5'],
    ['Charizard CGC 10', 'CGC', '10'],
    ['Charizard SGC 8', 'SGC', '8'],
    ['Charizard PSA Gem Mint 10', 'PSA', '10'],
  ])('%s', (title, company, grade) => {
    const p = parseCardTitle(title);
    expect(p.grading).toEqual({ company, grade });
    expect(p.gradedMention).toBe(true);
  });

  it('PSA 9 in PSA 10 sta različni oceni', () => {
    expect(parseCardTitle('Charizard PSA 9').grading).not.toEqual(parseCardTitle('Charizard PSA 10').grading);
  });

  it('omenjeno ocenjevanje brez ocene: gradedMention, grading null', () => {
    const p = parseCardTitle('Charizard PSA graded slab');
    expect(p.grading).toBeNull();
    expect(p.gradedMention).toBe(true);
  });

  it('brez omembe ocenjevanja: ni ocenjena, ni neocenjena izrecno', () => {
    const p = parseCardTitle('Pokemon Charizard 4/102');
    expect(p.grading).toBeNull();
    expect(p.gradedMention).toBe(false);
    expect(p.ungradedMention).toBe(false);
  });

  it('izrecno neocenjena', () => {
    expect(parseCardTitle('Charizard raw ungraded NM').ungradedMention).toBe(true);
  });
});

describe('parseCardTitle — izdaja in površina', () => {
  it('prva izdaja v več zapisih', () => {
    for (const t of ['Charizard 1st Edition', 'Charizard First Edition', 'Charizard 1. Edition', 'Charizard 1st Ed']) expect(parseCardTitle(t).firstEdition).toBe(true);
  });
  it('unlimited in shadowless sta ločena od prve izdaje', () => {
    expect(parseCardTitle('Charizard Unlimited').unlimited).toBe(true);
    expect(parseCardTitle('Charizard Unlimited').firstEdition).toBe(false);
    expect(parseCardTitle('Charizard Shadowless').shadowless).toBe(true);
  });
  it('izdaja ni navedena: nič ni nastavljeno', () => {
    const p = parseCardTitle('Charizard 4/102 Base Set');
    expect([p.firstEdition, p.unlimited, p.shadowless]).toEqual([false, false, false]);
  });
  it('reverse holo ni holo', () => {
    const r = parseCardTitle('Pikachu Reverse Holo');
    expect(r.reverseHolo).toBe(true);
    expect(r.holo).toBe(false);
    const h = parseCardTitle('Pikachu Holo');
    expect(h.holo).toBe(true);
    expect(h.reverseHolo).toBe(false);
  });
});

describe('parseCardTitle — jezik', () => {
  it.each([
    ['Charizard Japanese', 'ja'],
    ['Charizard japanisch', 'ja'],
    ['Charizard English NM', 'en'],
    ['Charizard Deutsch', 'de'],
    ['Charizard French', 'fr'],
    ['Charizard Italiano', 'it'],
    ['Charizard Spanish', 'es'],
  ])('%s → %s', (title, lang) => {
    expect(parseCardTitle(title).language).toBe(lang);
  });

  it('jezik ni naveden: null (ne angleščina)', () => {
    expect(parseCardTitle('Pokemon Charizard 4/102 Base Set').language).toBeNull();
  });

  it('več jezikov v enem naslovu: ni enega jezika', () => {
    expect(parseCardTitle('Charizard English German').language).toBeNull();
  });

  it('nepodprt jezik', () => {
    const p = parseCardTitle('Charizard Korean');
    expect(p.unsupportedLanguage).toBe(true);
    expect(p.language).toBeNull();
  });
});

describe('parseCardTitle — izdelki, paketi, proxy', () => {
  it('zapečatenost', () => {
    expect(parseCardTitle('Pokemon Obsidian Flames Booster Box sealed').sealed).toBe(true);
    expect(parseCardTitle('Pokemon Elite Trainer Box ETB').sealed).toBe(true);
  });
  it('paket kartic', () => {
    for (const t of ['Pokemon Lot 50 cards', 'Pokemon Konvolut Karten', 'Pokemon Sammlung 100 Karten', 'Pokemon bundle x20']) expect(parseCardTitle(t).lot).toBe(true);
    expect(parseCardTitle('Pokemon Charizard 4/102').lot).toBe(false);
  });
  it('proxy in reprodukcije', () => {
    for (const t of ['Charizard proxy', 'Charizard custom card', 'Charizard Replica metal', 'Charizard fan made', 'Charizard Nachdruck']) expect(parseCardTitle(t).proxy).toBe(true);
    expect(parseCardTitle('Charizard 4/102 Base Set').proxy).toBe(false);
  });
  it('opis dopolni oznake, ne ime', () => {
    const p = parseCardTitle('Charizard 4/102', 'PSA 9 graded, English');
    expect(p.grading).toEqual({ company: 'PSA', grade: '9' });
    expect(p.language).toBe('en');
  });
});

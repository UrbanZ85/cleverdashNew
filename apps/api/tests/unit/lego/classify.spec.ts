import { describe, expect, it } from 'vitest';
import { classifyListing } from '../../../src/modules/lego-scanner/domain/classify.js';
import { classifyCondition } from '../../../src/modules/lego-scanner/domain/condition.js';

// 018, FR-004 in FR-012: set ni paket, deli, minifigura ali prazna škatla; stanje se ne ugiba.

describe('classifyListing — vrsta oglasa', () => {
  const cases: Array<[string, string]> = [
    // prazna škatla (prej kot številka seta)
    ['Leere Box LEGO 75192 Karton', 'EMPTY_BOX'],
    ['LEGO 75192 nur die Verpackung leer', 'EMPTY_BOX'],
    ['LEGO 75192 nur leere Verpackung', 'EMPTY_BOX'],
    ['LEGO 75192 empty box only', 'EMPTY_BOX'],
    ['LEGO 75192 scatola vuota', 'EMPTY_BOX'],
    ['LEGO 75192 prazna škatla', 'EMPTY_BOX'],
    ['LEGO 75192 Falcon ohne Inhalt', 'EMPTY_BOX'],
    // paketi
    ['LEGO Star Wars Konvolut 10179 und 75192 Sets', 'BUNDLE'],
    ['LEGO 10179 + 75192', 'BUNDLE'],
    ['LEGO Sammlung Star Wars Sets', 'BUNDLE'],
    ['LEGO Star Wars Bundle', 'BUNDLE'],
    ['2x LEGO 75192', 'BUNDLE'],
    ['LEGO collezione Star Wars', 'BUNDLE'],
    // deli
    ['LEGO Teile Konvolut Star Wars 1kg', 'PARTS'],
    ['LEGO Ersatzteile für 75192', 'PARTS'],
    ['LEGO loose bricks bulk', 'PARTS'],
    ['LEGO mattoncini sfusi', 'PARTS'],
    ['LEGO 75192 for parts', 'PARTS'],
    // minifigure
    ['LEGO Minifigur Han Solo sw0123', 'MINIFIG'],
    ['LEGO Star Wars Figur Chewbacca', 'MINIFIG'],
    ['LEGO nur Figuren aus 75192', 'MINIFIG'],
    // pravi kandidati za set (vključno s štetjem kock v naslovu)
    ['LEGO Star Wars 75192 Millennium Falcon NEU OVP', 'CANDIDATE'],
    ['LEGO Star Wars 75192 Falcon 7541 Teile', 'CANDIDATE'],
    ['LEGO Technic 42115 Lamborghini Sián komplett', 'CANDIDATE'],
    ['LEGO Millennium Falcon neu', 'CANDIDATE'],
    ['LEGO Star Wars 75192 mit Minifiguren', 'CANDIDATE'],
  ];

  it.each(cases)('%s → %s', (title, kind) => {
    expect(classifyListing(title).kind).toBe(kind);
  });

  it('več različnih številk je paket z razlogom in seznamom', () => {
    const c = classifyListing('LEGO 10179 und 75192 zusammen');
    expect(c).toMatchObject({ kind: 'BUNDLE', numbers: ['10179-1', '75192-1'] });
    expect(c.reason).toContain('10179-1');
  });

  it('opis oglasa se upošteva (prazna škatla v opisu)', () => {
    expect(classifyListing('LEGO 75192 Falcon', 'Achtung: nur leere Box, ohne Steine').kind).toBe('EMPTY_BOX');
  });
});

describe('classifyCondition — stanje brez domnev o kompletnosti', () => {
  const run = (conditionId: string | null, text: string, conditionText: string | null = null) => classifyCondition({ conditionId, conditionText, text });

  it('eBay "Nov" (1000) = zapečatano; "Nov drugo" (1500) = odprta škatla; 7000 = deli', () => {
    expect(run('1000', 'LEGO 75192').condition).toBe('NEW_SEALED');
    expect(run('1500', 'LEGO 75192').condition).toBe('NEW_OPEN_BOX');
    expect(run('7000', 'LEGO 75192').condition).toBe('PARTS_ONLY');
  });

  it('novo z besedilom o odprti škatli ni zapečatano', () => {
    expect(run('1000', 'LEGO 75192 Box geöffnet').condition).toBe('NEW_OPEN_BOX');
  });

  it('rabljeno BREZ navedbe kompletnosti je UNKNOWN in ni "completenessVerified"', () => {
    const r = run('3000', 'LEGO 75192 Millennium Falcon gebraucht');
    expect(r.condition).toBe('UNKNOWN');
    expect(r.completenessVerified).toBeUndefined();
  });

  it('rabljeno z izrecno navedbo kompletnosti je USED_COMPLETE (preverjeno samo po besedilu)', () => {
    const r = run('3000', 'LEGO Technic 42115 komplett gebraucht');
    expect(r).toMatchObject({ condition: 'USED_COMPLETE', completenessVerified: true });
    expect(run('4000', 'LEGO 75192 used complete with box').condition).toBe('USED_COMPLETE');
  });

  it('"nicht komplett"/"fehlt" je nekompletno, tudi če vsebuje besedo komplett', () => {
    expect(run('3000', 'LEGO 75192 nicht komplett').condition).toBe('USED_INCOMPLETE');
    expect(run('3000', 'LEGO 75192 komplett bis auf 3 Teile, ein Stein fehlt').condition).toBe('USED_INCOMPLETE');
    expect(run('3000', 'LEGO 75192 manca un pezzo').condition).toBe('USED_INCOMPLETE');
  });

  it('nasprotujoča si signala (nov v kategoriji, rabljen v besedilu) = UNKNOWN', () => {
    expect(run('1000', 'LEGO 75192 gebraucht').condition).toBe('UNKNOWN');
    expect(run('3000', 'LEGO 75192 originalverpackt versiegelt').condition).toBe('UNKNOWN');
  });

  it('brez eBay stanja samo besedilo, previdno', () => {
    expect(run(null, 'LEGO 75192 sealed').condition).toBe('NEW_SEALED');
    expect(run(null, 'LEGO 75192 gebraucht komplett').condition).toBe('USED_COMPLETE');
    expect(run(null, 'LEGO 75192 komplett').condition).toBe('UNKNOWN');
    expect(run(null, 'LEGO 75192').condition).toBe('UNKNOWN');
  });

  it('škatla in navodila: samo ob izrecni navedbi', () => {
    expect(run('3000', 'LEGO 75192 mit OVP und Bauanleitung')).toMatchObject({ boxIncluded: true, instructionsIncluded: true });
    expect(run('3000', 'LEGO 75192 ohne OVP ohne Anleitung')).toMatchObject({ boxIncluded: false, instructionsIncluded: false });
    const unknown = run('3000', 'LEGO 75192 gebraucht');
    expect(unknown.boxIncluded).toBeUndefined();
    expect(unknown.instructionsIncluded).toBeUndefined();
  });
});

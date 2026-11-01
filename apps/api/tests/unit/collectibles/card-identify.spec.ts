import { describe, expect, it } from 'vitest';
import { candidateNameTokens, identifyCard } from '../../../src/modules/collectibles-scanner/domain/card-identify.js';
import { parseCardTitle } from '../../../src/modules/collectibles-scanner/domain/card-parse.js';
import { canValue } from '../../../src/modules/collectibles-scanner/domain/identification.js';
import { CHARIZARD_BASE, CHARIZARD_BASE2, CHARIZARD_EX, CHARIZARD_PLAIN_125, PIKACHU } from './fixtures.js';

// 019 (FR-013 do FR-016): prepoznava kartice nad katalogom. Različice se nikoli ne zamenjujejo.

const CATALOG = [CHARIZARD_BASE, CHARIZARD_BASE2, CHARIZARD_EX, CHARIZARD_PLAIN_125, PIKACHU];

function id(title: string, catalog = CATALOG, description?: string) {
  return identifyCard({ title, description: description ?? null, catalog });
}

describe('identifyCard — visoko zaupanje', () => {
  it('ime + številka + skupno število → ena kartica', () => {
    const r = id('Pokemon Charizard 4/102 Base Set Unlimited Holo English');
    expect(r.identification).toMatchObject({ kind: 'CARD', confidence: 'high', needsReview: false });
    expect(r.card?.id).toBe('base1-4');
    expect(r.identification.catalog?.setName).toBe('Base Set');
  });

  it('skupno število razloči set z isto številko (4/130 je Base Set 2)', () => {
    expect(id('Pokemon Charizard 4/130 Holo English').card?.id).toBe('base4-4');
    expect(id('Pokemon Charizard 4/102 Holo English').card?.id).toBe('base1-4');
  });

  it('ime "Charizard ex" ne ujame navadnega Charizarda in obratno', () => {
    expect(id('Pokemon Charizard ex 125/197 Obsidian Flames English').card?.id).toBe('sv3-125');
    expect(id('Pokemon Charizard 125/197 English').card?.name).toBe('Charizard');
  });
});

describe('identifyCard — različice se ne mešajo', () => {
  const key = (title: string) => id(title).identification.variantKey;

  it('PSA 9 ≠ PSA 10 ≠ neocenjena', () => {
    const a = key('Charizard ex 125/197 Obsidian Flames English PSA 9');
    const b = key('Charizard ex 125/197 Obsidian Flames English PSA 10');
    const raw = key('Charizard ex 125/197 Obsidian Flames English');
    expect(a).not.toBeNull();
    expect(new Set([a, b, raw]).size).toBe(3);
  });

  it('različni ocenjevalci z isto oceno so različni', () => {
    expect(key('Charizard ex 125/197 Obsidian Flames English PSA 9')).not.toBe(key('Charizard ex 125/197 Obsidian Flames English CGC 9'));
  });

  it('prva izdaja ≠ unlimited ≠ shadowless', () => {
    const first = key('Pokemon Charizard 4/102 Base Set 1st Edition English Holo');
    const unlimited = key('Pokemon Charizard 4/102 Base Set Unlimited English Holo');
    const shadowless = key('Pokemon Charizard 4/102 Base Set Shadowless English Holo');
    expect(new Set([first, unlimited, shadowless]).size).toBe(3);
    expect(first).not.toBeNull();
  });

  it('japonska ≠ angleška (isti naslov, različen jezik kataloga)', () => {
    const en = id('Pokemon Charizard ex 125/197 English');
    const ja = id('Pokemon Charizard ex 125/197 Japanese');
    expect(en.identification.variantKey).not.toBeNull();
    // Japonski oglas se ne ujema z angleškim katalogom: ni ključa, ni ugibanja.
    expect(ja.identification.variantKey).toBeNull();
    expect(ja.identification.ambiguities).toContain('language');
    expect(canValue(ja.identification)).toBe(false);
  });

  it('reverse holo ≠ holo (kartica z več površinami)', () => {
    const reverse = key('Pokemon Pikachu 63/198 Reverse Holo English');
    const normal = key('Pokemon Pikachu 63/198 Holo English');
    expect(reverse).not.toBeNull();
    // Katalog nima "holo" za Pikachu: izrecna površina, ki je katalog ne pozna, gre v ročni pregled.
    expect(normal).toBeNull();
    expect(id('Pokemon Pikachu 63/198 Holo English').identification.needsReview).toBe(true);
  });

  it('ista kartica brez navedene izdaje, ki obstaja kot prva izdaja: dvoumnost in ročni pregled', () => {
    const r = id('Pokemon Charizard 4/102 Base Set Holo English');
    expect(r.identification.ambiguities).toContain('edition');
    expect(r.identification.needsReview).toBe(true);
    expect(r.identification.variantKey).toBeNull();
    expect(canValue(r.identification)).toBe(false);
  });

  it('prva izdaja za kartico, ki je katalog ne pozna kot prvo izdajo: ročni pregled', () => {
    const r = id('Pokemon Charizard ex 125/197 1st Edition English');
    expect(r.identification.needsReview).toBe(true);
    expect(r.identification.variantKey).toBeNull();
  });
});

describe('identifyCard — dvoumnosti ostanejo neznane', () => {
  it('jezik ni naveden: ključa ni, ampak ni ročnega pregleda', () => {
    const r = id('Pokemon Charizard ex 125/197 Obsidian Flames');
    expect(r.identification.ambiguities).toContain('language');
    expect(r.identification.variantKey).toBeNull();
    expect(canValue(r.identification)).toBe(false);
    expect(r.identification.confidence).not.toBe('high');
  });

  it('površina ni navedena pri kartici z navadno in reverse različico', () => {
    const r = id('Pokemon Pikachu 63/198 English');
    expect(r.identification.ambiguities).toContain('finish');
    expect(r.identification.variantKey).toBeNull();
  });

  it('ocena omenjena brez številke', () => {
    const r = id('Pokemon Charizard ex 125/197 Obsidian Flames English PSA graded');
    expect(r.identification.ambiguities).toContain('grade');
    expect(r.identification.needsReview).toBe(true);
  });

  it('brez številke: več kandidatov → ročni pregled, nizko zaupanje', () => {
    const r = id('Pokemon Charizard holo rare English');
    expect(r.identification.confidence).toBe('low');
    expect(r.identification.needsReview).toBe(true);
    expect(canValue(r.identification)).toBe(false);
  });

  it('kartice ni v katalogu', () => {
    const r = id('Pokemon Mewtwo 10/102 English');
    expect(r.identification.kind).toBe('UNIDENTIFIED');
    expect(r.identification.needsReview).toBe(true);
  });

  it('številka se ne ujema z nobeno kartico', () => {
    expect(id('Pokemon Charizard 99/102 English').identification.needsReview).toBe(true);
  });

  it('katalog ni na voljo: ni potrjeno, ročni pregled', () => {
    const r = id('Pokemon Charizard 4/102', null as never);
    expect(r.identification).toMatchObject({ confidence: 'low', needsReview: true, variantKey: null });
    expect(r.identification.ambiguities).toContain('catalog');
  });
});

describe('identifyCard — kar ni ena kartica', () => {
  it('proxy', () => expect(id('Charizard ex 125/197 proxy custom').identification).toMatchObject({ kind: 'PROXY', needsReview: false, variantKey: null }));
  it('paket', () => expect(id('Pokemon Charizard lot 50 cards').identification.kind).toBe('LOT'));
  it('zapečatni izdelek', () => expect(id('Pokemon Obsidian Flames Booster Box sealed').identification.kind).toBe('SEALED'));
  it('nepodprt jezik', () => expect(id('Pokemon Charizard Korean 4/102').identification.needsReview).toBe(true));
  it('nobeden od teh ni vreden vrednotenja', () => {
    for (const t of ['Charizard proxy', 'Pokemon lot 50 cards', 'Pokemon Booster Box sealed']) expect(canValue(id(t).identification)).toBe(false);
  });
});

describe('candidateNameTokens', () => {
  it('šum in številke niso ime', () => {
    expect(candidateNameTokens(parseCardTitle('Pokemon Charizard ex 125/197 PSA 9 Holo English'))).toEqual(['charizard']);
  });
  it('več kandidatov, največ 3', () => {
    expect(candidateNameTokens(parseCardTitle('Obsidian Flames Charizard Dragon Rare')).length).toBeLessThanOrEqual(3);
  });
});

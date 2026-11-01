import { describe, expect, it } from 'vitest';
import { canValue } from '../../../src/modules/collectibles-scanner/domain/identification.js';
import { identifyRetro, retroSearchText, retroTitleKey, type RetroProduct } from '../../../src/modules/collectibles-scanner/domain/retro-identify.js';
import { parseRetroTitle } from '../../../src/modules/collectibles-scanner/domain/retro-parse.js';
import { cardVariantKey, retroVariantKey, sameVariant } from '../../../src/modules/collectibles-scanner/domain/variant-key.js';

// 019 (FR-014, FR-015): retro igre in konzole. Loose ≠ CIB, PAL ≠ NTSC, original ≠ reprodukcija, okvarjeno ≠ delujoče.

const PAL: RetroProduct = { id: 'rp1', name: 'Super Mario Land', platform: 'gb', region: 'PAL' };
const NTSC: RetroProduct = { id: 'rp2', name: 'Super Mario Land', platform: 'gb', region: 'NTSC-U' };

describe('parseRetroTitle', () => {
  it.each([
    ['Super Mario Land Game Boy', 'gb'],
    ['Super Mario World SNES PAL', 'snes'],
    ['Zelda Ocarina of Time N64', 'n64'],
    ['Pokemon Gold Game Boy Color', 'gbc'],
    ['Sonic Mega Drive', 'md'],
    ['Metal Gear Solid PS1', 'ps1'],
  ])('%s → %s', (title, platform) => expect(parseRetroTitle(title).platform).toBe(platform));

  it('daljša oznaka platforme zmaga (Game Boy Advance ni Game Boy)', () => {
    expect(parseRetroTitle('Mario Kart Super Circuit Game Boy Advance').platform).toBe('gba');
  });

  it('regija: PAL, NTSC-U, NTSC-J; samo "NTSC" in neomenjena sta neznana', () => {
    expect(parseRetroTitle('Zelda SNES PAL').region).toBe('PAL');
    expect(parseRetroTitle('Zelda SNES NTSC-U').region).toBe('NTSC-U');
    expect(parseRetroTitle('Zelda SNES USA').region).toBe('NTSC-U');
    expect(parseRetroTitle('Zelda SNES NTSC-J Japan').region).toBe('NTSC-J');
    expect(parseRetroTitle('Zelda SNES NTSC').region).toBeNull();
    expect(parseRetroTitle('Zelda SNES').region).toBeNull();
    expect(parseRetroTitle('Zelda SNES PAL USA').region).toBeNull(); // nasprotujoče: ni ene regije
  });

  it('popolnost: loose, CIB, zapečateno; "NEU" ni zapečateno', () => {
    expect(parseRetroTitle('Zelda N64 cartridge only').completeness).toBe('loose');
    expect(parseRetroTitle('Zelda N64 loose').completeness).toBe('loose');
    expect(parseRetroTitle('Zelda N64 CIB').completeness).toBe('cib');
    expect(parseRetroTitle('Zelda N64 komplett').completeness).toBe('cib');
    expect(parseRetroTitle('Zelda N64 factory sealed').completeness).toBe('sealed');
    expect(parseRetroTitle('Zelda N64 NEU OVP').completeness).toBeNull();
    expect(parseRetroTitle('Zelda N64').completeness).toBeNull();
  });

  it('delovanje', () => {
    expect(parseRetroTitle('Game Boy defekt').working).toBe('not-working');
    expect(parseRetroTitle('Game Boy for parts').working).toBe('not-working');
    expect(parseRetroTitle('Game Boy untested').working).toBe('untested');
    expect(parseRetroTitle('Game Boy tested working').working).toBe('working');
    expect(parseRetroTitle('Game Boy').working).toBeNull();
    expect(parseRetroTitle('Game Boy not working').working).toBe('not-working');
  });

  it('reprodukcija in paketi', () => {
    for (const t of ['Zelda N64 repro cartridge', 'Zelda N64 reproduction', 'Zelda N64 bootleg', 'Zelda N64 custom label']) expect(parseRetroTitle(t).reproduction).toBe(true);
    expect(parseRetroTitle('Zelda N64').reproduction).toBe(false);
    for (const t of ['N64 games lot', 'N64 Konvolut', 'N64 bundle 10 games']) expect(parseRetroTitle(t).lot).toBe(true);
  });

  it('vrsta: dodatek, konzola, igra', () => {
    expect(parseRetroTitle('N64 controller').kind).toBe('accessory');
    expect(parseRetroTitle('N64 console grey').kind).toBe('console');
    expect(parseRetroTitle('Zelda N64 game').kind).toBe('game');
  });
});

describe('identifyRetro — brez kataloga', () => {
  const id = (title: string) => identifyRetro({ title, catalog: null });

  it('igra z vsemi podatki: srednje zaupanje (brez kataloga ni višje), ključ je določen', () => {
    const r = id('Super Mario Land Game Boy PAL CIB');
    expect(r.identification).toMatchObject({ kind: 'GAME', confidence: 'medium', needsReview: false, ambiguities: [] });
    expect(r.identification.variantKey).toBe('retro|gb|land-mario-super|PAL|cib|-');
    expect(canValue(r.identification)).toBe(true);
  });

  it('loose ≠ CIB', () => {
    expect(id('Super Mario Land Game Boy PAL loose').identification.variantKey).not.toBe(id('Super Mario Land Game Boy PAL CIB').identification.variantKey);
  });

  it('PAL ≠ NTSC', () => {
    expect(id('Super Mario Land Game Boy PAL loose').identification.variantKey).not.toBe(id('Super Mario Land Game Boy NTSC-U loose').identification.variantKey);
  });

  it('regija ali popolnost nista navedeni: dvoumnost, ključa ni', () => {
    const r = id('Super Mario Land Game Boy');
    expect(r.identification.ambiguities).toEqual(expect.arrayContaining(['region', 'completeness']));
    expect(r.identification.variantKey).toBeNull();
    expect(canValue(r.identification)).toBe(false);
  });

  it('reprodukcija, paket, dodatek: brez ključa in brez vrednosti', () => {
    expect(id('Super Mario Land Game Boy repro cartridge').identification.kind).toBe('REPRODUCTION');
    expect(id('Game Boy games lot').identification.kind).toBe('LOT');
    expect(id('Game Boy controller adapter').identification.kind).toBe('ACCESSORY');
    for (const t of ['Super Mario Land Game Boy repro', 'Game Boy games lot', 'Game Boy cable']) expect(canValue(id(t).identification)).toBe(false);
  });

  it('konzola: delovanje je del ključa; okvarjena ≠ delujoča', () => {
    const ok = id('Game Boy Color console Atomic Purple PAL working loose');
    const broken = id('Game Boy Color console Atomic Purple PAL defekt loose');
    expect(ok.identification.kind).toBe('CONSOLE');
    expect(ok.identification.variantKey).not.toBeNull();
    expect(ok.identification.variantKey).not.toBe(broken.identification.variantKey);
  });

  it('konzola brez navedenega delovanja: dvoumnost', () => {
    expect(id('Game Boy Color console PAL loose').identification.ambiguities).toContain('working');
  });

  it('platforma ni prepoznana: ročni pregled', () => {
    const r = id('Super Mario Land cartridge');
    expect(r.identification).toMatchObject({ needsReview: true, kind: 'UNIDENTIFIED' });
  });
});

describe('identifyRetro — s katalogom', () => {
  it('katalog potrdi ime in dvigne zaupanje; regija iz naslova razloči izdelke', () => {
    const r = identifyRetro({ title: 'Super Mario Land Game Boy PAL CIB', catalog: [PAL, NTSC] });
    expect(r.identification).toMatchObject({ confidence: 'high', catalog: { id: 'rp1' } });
  });

  it('brez regije v naslovu sta oba izdelka kandidata: ni enolično, ostane besedilna prepoznava', () => {
    const r = identifyRetro({ title: 'Super Mario Land Game Boy CIB', catalog: [PAL, NTSC] });
    expect(r.identification.catalog).toBeNull();
    expect(r.identification.ambiguities).toContain('region');
  });

  it('platforma kataloga se mora ujemati', () => {
    const r = identifyRetro({ title: 'Super Mario Land SNES PAL CIB', catalog: [PAL] });
    expect(r.identification.catalog).toBeNull();
  });
});

describe('besedilni ključi', () => {
  it('retroTitleKey odstrani platformo, regijo in popolnost; vrstni red besed ni pomemben', () => {
    expect(retroTitleKey('Super Mario Land Game Boy PAL CIB')).toBe(retroTitleKey('PAL Game Boy Mario Super Land loose'));
  });
  it('retroSearchText ohrani vrstni red', () => {
    expect(retroSearchText('Super Mario Land Game Boy PAL CIB')).toBe('super mario land');
  });
});

describe('variant-key', () => {
  it('kartice: vsak del ključa loči različico', () => {
    const base = { catalogId: 'sv3-125', language: 'en' as const, edition: 'standard' as const, finish: 'holo' as const, grading: null };
    const k = cardVariantKey(base);
    expect(k).toBe('card|sv3-125|en|standard|holo|raw');
    expect(cardVariantKey({ ...base, language: 'ja' })).not.toBe(k);
    expect(cardVariantKey({ ...base, finish: 'reverse' })).not.toBe(k);
    expect(cardVariantKey({ ...base, grading: { company: 'PSA', grade: '10' } })).not.toBe(cardVariantKey({ ...base, grading: { company: 'PSA', grade: '9' } }));
  });
  it('retro', () => {
    const p = { platform: 'gb', title: 'x', region: 'PAL' as const, completeness: 'loose' as const, working: null };
    expect(retroVariantKey({ ...p, completeness: 'cib' })).not.toBe(retroVariantKey(p));
    expect(retroVariantKey({ ...p, region: 'NTSC-U' })).not.toBe(retroVariantKey(p));
  });
  it('sameVariant: null ni nikoli enak', () => {
    expect(sameVariant(null, null)).toBe(false);
    expect(sameVariant('a', 'a')).toBe(true);
    expect(sameVariant('a', 'b')).toBe(false);
  });
});

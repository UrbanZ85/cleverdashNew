import { describe, expect, it } from 'vitest';
import { canValue, identifyListing, type CatalogLookup } from '../../../src/modules/lego-scanner/domain/identify.js';
import type { CatalogSet } from '../../../src/modules/lego-scanner/domain/types.js';

// 018, FR-011/FR-012 (SC-002): identifikacija z zaupanjem; samo zanesljiv set sme naprej k vrednotenju.

const set = (setNumber: string, name: string, extra: Partial<CatalogSet> = {}): CatalogSet => ({
  setNumber,
  name,
  year: 2017,
  themeId: 158,
  theme: 'Star Wars',
  subtheme: null,
  pieces: 1000,
  imageUrl: null,
  url: null,
  ...extra,
});
const FALCON_UCS = set('75192-1', 'Millennium Falcon', { subtheme: 'Ultimate Collector Series', pieces: 7541 });
const FALCON_2019 = set('75257-1', 'Millennium Falcon', { year: 2019, pieces: 1351 });
const LAMBO = set('42115-1', 'Lamborghini Sián FKP 37', { theme: 'Technic' });

function identify(title: string, numbers: Array<[string, CatalogLookup]> = [], names: CatalogSet[] = [], nameSearched = names.length > 0, description: string | null = null) {
  return identifyListing({ title, description, catalogByNumber: new Map(numbers), nameCandidates: names, nameSearched });
}

describe('številka v naslovu', () => {
  it('v katalogu → SET, visoko zaupanje, brez ročnega pregleda', () => {
    const id = identify('LEGO Star Wars 75192 Millennium Falcon NEU OVP', [['75192-1', FALCON_UCS]]);
    expect(id).toMatchObject({ kind: 'SET', confidence: 'high', needsReview: false });
    expect(id.catalog).toMatchObject({ setNumber: '75192-1', name: 'Millennium Falcon', pieces: 7541 });
    expect(canValue(id)).toBe(true);
  });

  it('katalog ne pozna številke → ni set, nizko zaupanje, ročni pregled', () => {
    const id = identify('LEGO Teil 99999 Stein', [['99999-1', null]]);
    expect(id).toMatchObject({ kind: 'UNIDENTIFIED', confidence: 'low', needsReview: true, catalog: null });
    expect(canValue(id)).toBe(false);
  });

  it('katalog ni na voljo (ni iskanja) → SET s srednjim zaupanjem in razlogom, katalog null', () => {
    const id = identify('LEGO 75192 Falcon', []);
    expect(id).toMatchObject({ kind: 'SET', confidence: 'medium', needsReview: false, catalog: null });
    expect(id.reason).toContain('ni potrjena');
    expect(canValue(id)).toBe(true);
  });
});

describe('ni set (SC-002)', () => {
  it.each([
    ['Leere Box LEGO 75192 Karton', 'EMPTY_BOX'],
    ['LEGO Star Wars Konvolut 10179 und 75192 Sets', 'BUNDLE'],
    ['LEGO Teile Konvolut Star Wars 1kg', 'PARTS'],
    ['LEGO Minifigur Han Solo sw0123', 'MINIFIG'],
  ])('%s → %s brez identitete seta in brez možnosti vrednotenja', (title, kind) => {
    const id = identify(title, [['75192-1', FALCON_UCS], ['10179-1', FALCON_UCS]]);
    expect(id.kind).toBe(kind);
    expect(id.catalog).toBeNull();
    expect(id.confidence).toBe('none');
    expect(canValue(id)).toBe(false);
  });
});

describe('brez številke', () => {
  it('en sam kandidat z istim imenom → SET, srednje', () => {
    const id = identify('LEGO Technic Lamborghini Sián FKP 37 neu', [], [LAMBO]);
    expect(id).toMatchObject({ kind: 'SET', confidence: 'medium', needsReview: false });
    expect(id.catalog?.setNumber).toBe('42115-1');
    expect(canValue(id)).toBe(true);
  });

  it('več setov z istim imenom (dva Falconova) → ročni pregled, brez identitete', () => {
    const id = identify('LEGO Millennium Falcon neu', [], [FALCON_UCS, FALCON_2019]);
    expect(id).toMatchObject({ kind: 'UNIDENTIFIED', confidence: 'low', needsReview: true, catalog: null });
    expect(id.reason).toContain('75192-1');
    expect(canValue(id)).toBe(false);
  });

  it('približno ujemanje besed z enim kandidatom → nizko zaupanje + pregled (ne vrednoti)', () => {
    const id = identify('Lamborghini Sian FKP Auto', [], [set('42115-1', 'Lamborghini Sian FKP 37', { theme: 'Technic' })]);
    expect(id).toMatchObject({ kind: 'SET', confidence: 'low', needsReview: true });
    expect(canValue(id)).toBe(false);
  });

  it('brez kandidatov: ni prepoznano; razlog pove, ali je bilo iskanje opravljeno', () => {
    expect(identify('LEGO Star Wars Raumschiff', [], [], true)).toMatchObject({ kind: 'UNIDENTIFIED', confidence: 'none', needsReview: true });
    expect(identify('LEGO Star Wars Raumschiff', [], [], false).reason).toContain('ni bilo mogoče preveriti');
  });
});

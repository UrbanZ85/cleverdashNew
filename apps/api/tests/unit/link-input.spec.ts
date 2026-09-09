import { describe, expect, it } from 'vitest';
import {
  UNGROUPED,
  buildLinksFilter,
  deriveLinkTitle,
  linkWriteSchema,
  linksQuerySchema,
  parseGroupIdParam,
} from '../../src/modules/saved-links/domain/link-input.js';

// 008, po vzoru tests/unit/note-input.spec.ts (research.md §15).

describe('linkWriteSchema', () => {
  it('sprejme samo naslov — ime ni obvezno (SC-001)', () => {
    const parsed = linkWriteSchema.parse({ url: 'https://primer.si/' });
    expect(parsed.url).toBe('https://primer.si/');
    expect(parsed.title).toBeUndefined();
  });

  it('zavrne telo brez naslova', () => {
    expect(() => linkWriteSchema.parse({ title: 'Brez naslova' })).toThrow();
  });

  it('zavrne predolgo ime in predolg komentar (FR-007)', () => {
    expect(() => linkWriteSchema.parse({ url: 'https://a.si/', title: 'x'.repeat(201) })).toThrow();
    expect(() => linkWriteSchema.parse({ url: 'https://a.si/', comment: 'x'.repeat(1001) })).toThrow();
  });

  it('`null` je veljavna vrednost za komentar, ikono in mapo — "brez" je stanje, ne manjkajoč podatek', () => {
    const parsed = linkWriteSchema.parse({
      url: 'https://a.si/',
      comment: null,
      icon: null,
      groupId: null,
    });
    expect(parsed.comment).toBeNull();
    expect(parsed.groupId).toBeNull();
  });
});

describe('linksQuerySchema', () => {
  it('privzeta razvrstitev je uporabnikov vrstni red', () => {
    expect(linksQuerySchema.parse({}).sort).toBe('manual');
  });

  it('sprejme `recent` za ploščico na nadzorni plošči in zavrne izmišljeno razvrstitev', () => {
    expect(linksQuerySchema.parse({ sort: 'recent' }).sort).toBe('recent');
    expect(() => linksQuerySchema.parse({ sort: 'abecedno' })).toThrow();
  });

  it('limit pride kot niz iz naslova in se pretvori v število', () => {
    expect(linksQuerySchema.parse({ limit: '6' }).limit).toBe(6);
    expect(() => linksQuerySchema.parse({ limit: '0' })).toThrow();
  });
});

describe('buildLinksFilter', () => {
  it('userId je vedno del filtra — brez njega poizvedba ni sestavljiva', () => {
    // Ta test je o TIPU, ne o vrednosti: `buildLinksFilter({})` se ne prevede, ker je
    // `userId` obvezen. Tu se preverja, da ga funkcija res vedno vgradi.
    expect(buildLinksFilter({ userId: 'u1' })).toEqual({ userId: 'u1' });
  });

  it('iskalni niz teče nad zloženim searchText, ne nad posameznimi polji', () => {
    const filter = buildLinksFilter({ userId: 'u1', query: 'Časa' });
    expect(filter.searchText).toEqual({ $regex: 'casa' });
  });

  it('poizvedba je ubrana — pika ne pomeni "poljuben znak"', () => {
    const filter = buildLinksFilter({ userId: 'u1', query: '.' });
    expect(filter.searchText).toEqual({ $regex: '\\.' });
  });

  it('izpuščena mapa pomeni VSE mape (FR-031), ne nerazvrščenih', () => {
    expect('groupId' in buildLinksFilter({ userId: 'u1', query: 'a' })).toBe(false);
  });

  it('groupId: null omeji na nerazvrščene', () => {
    expect(buildLinksFilter({ userId: 'u1', groupId: null }).groupId).toBeNull();
  });

  it('prazna poizvedba ne doda filtra — sicer bi prazno iskalno polje skrilo vse', () => {
    expect(buildLinksFilter({ userId: 'u1', query: '   ' })).toEqual({ userId: 'u1' });
  });
});

describe('parseGroupIdParam', () => {
  it('`none` pomeni nerazvrščene (null)', () => {
    expect(parseGroupIdParam(UNGROUPED)).toBeNull();
  });

  it('izpuščen ali prazen parameter pomeni vse mape (undefined)', () => {
    expect(parseGroupIdParam(undefined)).toBeUndefined();
    expect(parseGroupIdParam('')).toBeUndefined();
  });

  it('ID mape se prenese naprej nespremenjen', () => {
    expect(parseGroupIdParam('abc123')).toBe('abc123');
  });
});

describe('deriveLinkTitle', () => {
  it('nadomestek je gostitelj naslova brez www.', () => {
    expect(deriveLinkTitle('', 'https://www.arso.gov.si/x')).toBe('arso.gov.si');
  });

  it('vpisano ime ima prednost in se obreže', () => {
    expect(deriveLinkTitle('  Vreme  ', 'https://www.arso.gov.si/')).toBe('Vreme');
    expect(deriveLinkTitle('x'.repeat(300), 'https://a.si/')).toHaveLength(200);
  });

  it('`null` ime je isto kot prazno', () => {
    expect(deriveLinkTitle(null, 'https://primer.si/pot')).toBe('primer.si');
  });

  it('naslov, ki ni URL, se vrne kot ime — prazno ime bi bilo v seznamu neprepoznavno', () => {
    expect(deriveLinkTitle('', 'ni-naslov')).toBe('ni-naslov');
  });
});

import { describe, expect, it } from 'vitest';
import {
  MAX_TILE_WIDTH_PX,
  MIN_TILE_WIDTH_PX,
  PLUGIN_KINDS,
  PLUGIN_KIND_TITLES,
  emptyDraft,
  fetchesThroughServer,
  validateDraft,
  type PluginDraft,
} from '../../src/app/core/plugins/plugin.model.js';

function draft(overrides: Partial<PluginDraft> = {}): PluginDraft {
  return { ...emptyDraft(), name: 'Vir', url: 'https://example.com/a', ...overrides };
}

describe('fetchesThroughServer', () => {
  it('samo image in json gresta prek strežnika (člen VIII)', () => {
    // link in iframe naslov odpre brskalnik sam — zanju prenosa prek strežnika ni.
    expect(fetchesThroughServer('image')).toBe(true);
    expect(fetchesThroughServer('json')).toBe(true);
    expect(fetchesThroughServer('link')).toBe(false);
    expect(fetchesThroughServer('iframe')).toBe(false);
  });
});

describe('PLUGIN_KIND_TITLES', () => {
  it('vsaka vrsta ima slovenski naslov (člen X)', () => {
    for (const kind of PLUGIN_KINDS) {
      expect(PLUGIN_KIND_TITLES[kind]).toBeTruthy();
      expect(PLUGIN_KIND_TITLES[kind]).not.toBe(kind);
    }
  });
});

describe('validateDraft', () => {
  it('sprejme veljaven osnutek povezave', () => {
    expect(validateDraft(draft())).toBeNull();
  });

  it('zahteva ime in naslov', () => {
    expect(validateDraft(draft({ name: '  ' }))).toMatch(/ime/i);
    expect(validateDraft(draft({ url: '' }))).toMatch(/naslov/i);
  });

  it('zavrne naslov, ki ni https', () => {
    expect(validateDraft(draft({ url: 'http://example.com/a' }))).toMatch(/https/i);
    expect(validateDraft(draft({ url: 'example.com' }))).toMatch(/https/i);
  });

  it('vrsta json brez polj ni veljavna', () => {
    expect(validateDraft(draft({ kind: 'json', fields: [] }))).toMatch(/polje/i);
  });

  it('vrsta json zahteva oznako in pot pri vsakem polju', () => {
    expect(
      validateDraft(draft({ kind: 'json', fields: [{ label: 'T', path: '  ', unit: null }] })),
    ).toMatch(/oznako in pot/i);
    expect(
      validateDraft(draft({ kind: 'json', fields: [{ label: '', path: 'a.b', unit: null }] })),
    ).toMatch(/oznako in pot/i);
  });

  it('veljavna definicija json je sprejeta', () => {
    expect(
      validateDraft(draft({ kind: 'json', fields: [{ label: 'T', path: 'observation.t', unit: '°C' }] })),
    ).toBeNull();
  });

  it('interval pod 30 s je zavrnjen samo za vrsti, ki ju prenaša strežnik', () => {
    expect(validateDraft(draft({ kind: 'image', refreshSeconds: 5 }))).toMatch(/30/);
    // Za povezavo interval nima pomena in ne sme blokirati shranjevanja.
    expect(validateDraft(draft({ kind: 'link', refreshSeconds: 5 }))).toBeNull();
  });
});

describe('validateDraft — širina ploščice', () => {
  it('sprejme širino znotraj meja', () => {
    expect(validateDraft(draft({ widthPx: MIN_TILE_WIDTH_PX }))).toBeNull();
    expect(validateDraft(draft({ widthPx: 480 }))).toBeNull();
    expect(validateDraft(draft({ widthPx: MAX_TILE_WIDTH_PX }))).toBeNull();
  });

  it('zavrne širino izven meja in vrednost, ki ni število', () => {
    expect(validateDraft(draft({ widthPx: MIN_TILE_WIDTH_PX - 1 }))).toMatch(/širina/i);
    expect(validateDraft(draft({ widthPx: MAX_TILE_WIDTH_PX + 1 }))).toMatch(/širina/i);
    // Prazno številsko polje v obrazcu se pretvori v NaN — sporočilo mora biti isto,
    // ne pa da napako prvi opazi strežnik.
    expect(validateDraft(draft({ widthPx: Number.NaN }))).toMatch(/širina/i);
  });
});

describe('emptyDraft', () => {
  it('je veljaven, ko dobi ime in naslov — privzetki ne smejo skrivati napake', () => {
    expect(validateDraft({ ...emptyDraft(), name: 'X', url: 'https://example.com' })).toBeNull();
  });
});

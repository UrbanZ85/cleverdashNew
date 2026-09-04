import { describe, expect, it } from 'vitest';
import { buildDirectionsEmbedUrl, placeToMapQuery } from '../../src/domain/map-embed.js';
import type { CommutePlace } from '../../src/domain/commute-route.js';

// Zemljevid v ploščici je `<iframe>`, in Google navadne povezave do poti v tujem okvirju ne
// dovoli — naslov mora biti eden od dveh, ki ju dovoli. Ta test drži oboje: da se izbere
// uradna oblika, kadar je ključ za vdelavo na voljo, in klasična, kadar ga ni.

const home: CommutePlace = { label: 'Doma', address: null, latitude: 46.062382, longitude: 14.560178 };
const work: CommutePlace = { label: 'Služba', address: 'Dunajska cesta 1, Ljubljana', latitude: null, longitude: null };
const empty: CommutePlace = { label: 'Doma', address: null, latitude: null, longitude: null };

describe('placeToMapQuery', () => {
  it('koordinati zapiše kot "širina,dolžina"', () => {
    expect(placeToMapQuery(home)).toBe('46.062382,14.560178');
  });

  it('brez koordinat uporabi naslov', () => {
    expect(placeToMapQuery(work)).toBe('Dunajska cesta 1, Ljubljana');
  });

  it('nedoločen kraj vrne null', () => {
    expect(placeToMapQuery(empty)).toBeNull();
  });
});

describe('buildDirectionsEmbedUrl — brez ključa za vdelavo (klasična oblika)', () => {
  it('sestavi naslov z output=embed, ki ključa ne potrebuje', () => {
    const url = new URL(buildDirectionsEmbedUrl(home, work)!);
    expect(url.host).toBe('maps.google.com');
    expect(url.searchParams.get('saddr')).toBe('46.062382,14.560178');
    expect(url.searchParams.get('daddr')).toBe('Dunajska cesta 1, Ljubljana');
    expect(url.searchParams.get('output')).toBe('embed');
    expect(url.searchParams.get('hl')).toBe('sl');
    // Ključ v tej obliki ne nastopa — in ne sme, ker naslov vidi vsak obiskovalec.
    expect(url.searchParams.get('key')).toBeNull();
  });

  it('prazen ključ šteje kot "ni ključa"', () => {
    const url = new URL(buildDirectionsEmbedUrl(home, work, { embedApiKey: '   ' })!);
    expect(url.host).toBe('maps.google.com');
  });
});

describe('buildDirectionsEmbedUrl — s ključem (uradni Maps Embed API)', () => {
  it('uporabi dokumentirano pot /maps/embed/v1/directions', () => {
    const url = new URL(buildDirectionsEmbedUrl(home, work, { embedApiKey: 'embed-key-123' })!);
    expect(url.host).toBe('www.google.com');
    expect(url.pathname).toBe('/maps/embed/v1/directions');
    expect(url.searchParams.get('key')).toBe('embed-key-123');
    expect(url.searchParams.get('origin')).toBe('46.062382,14.560178');
    expect(url.searchParams.get('destination')).toBe('Dunajska cesta 1, Ljubljana');
    expect(url.searchParams.get('mode')).toBe('driving');
    expect(url.searchParams.get('language')).toBe('sl');
  });
});

describe('buildDirectionsEmbedUrl — nedoločena kraja', () => {
  it.each([
    [empty, work],
    [home, empty],
    [empty, empty],
  ])('%#: vrne null, da ploščica ne izriše praznega okvirja', (from, to) => {
    expect(buildDirectionsEmbedUrl(from as CommutePlace, to as CommutePlace)).toBeNull();
  });
});

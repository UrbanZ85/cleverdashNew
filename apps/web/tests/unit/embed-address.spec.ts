import { describe, expect, it } from 'vitest';
import {
  extractIframeSrc,
  isEmbedOnlyAddress,
  normalizeEmbedAddress,
  youtubeVideoId,
} from '../../src/app/core/embeds/embed-address.js';

// Vhodi so pravi izpisi YouTube gumbov "Deli" in "Vdelaj" (preverjeno na posnetku
// vwQyhU-5_7U) — prav ti dve obliki sta bili tisti "ni delovalo".

const SHARE_EMBED_HTML =
  '<iframe width="953" height="536" src="https://www.youtube.com/embed/vwQyhU-5_7U" ' +
  'title="TZ Rabac Ptz" frameborder="0" allow="accelerometer; autoplay; clipboard-write" ' +
  'referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>';

describe('extractIframeSrc', () => {
  it('vzame src iz prilepljene oznake iframe', () => {
    expect(extractIframeSrc(SHARE_EMBED_HTML)).toBe('https://www.youtube.com/embed/vwQyhU-5_7U');
  });

  it('prepozna tudi enojne narekovaje', () => {
    expect(extractIframeSrc("<iframe src='https://example.com/a'></iframe>")).toBe('https://example.com/a');
  });

  it('razveže &amp; v parametrih', () => {
    const html = '<iframe src="https://www.youtube.com/embed/ID?autoplay=1&amp;mute=1"></iframe>';
    expect(extractIframeSrc(html)).toBe('https://www.youtube.com/embed/ID?autoplay=1&mute=1');
  });

  it('vrne null za navaden naslov', () => {
    expect(extractIframeSrc('https://www.youtube.com/embed/vwQyhU-5_7U')).toBeNull();
  });
});

describe('youtubeVideoId', () => {
  it.each([
    ['https://www.youtube.com/watch?v=vwQyhU-5_7U', 'vwQyhU-5_7U'],
    ['https://www.youtube.com/watch?v=vwQyhU-5_7U&t=42s', 'vwQyhU-5_7U'],
    ['https://youtu.be/vwQyhU-5_7U?si=abc', 'vwQyhU-5_7U'],
    ['https://www.youtube.com/live/vwQyhU-5_7U', 'vwQyhU-5_7U'],
    ['https://www.youtube.com/shorts/vwQyhU-5_7U', 'vwQyhU-5_7U'],
    ['https://www.youtube.com/embed/vwQyhU-5_7U', 'vwQyhU-5_7U'],
  ])('%s → %s', (input, expected) => {
    expect(youtubeVideoId(new URL(input))).toBe(expected);
  });

  it('vrne null za tuj gostitelj', () => {
    expect(youtubeVideoId(new URL('https://ipcamlive.com/player/player.php?alias=x'))).toBeNull();
  });

  it('vrne null za YouTube stran, ki ni posnetek', () => {
    expect(youtubeVideoId(new URL('https://www.youtube.com/feed/subscriptions'))).toBeNull();
  });
});

describe('normalizeEmbedAddress', () => {
  it('iz prilepljene oznake iframe dobi naslov za vdelavo', () => {
    const result = normalizeEmbedAddress(SHARE_EMBED_HTML);
    expect(result.url).toBe('https://www.youtube.com/embed/vwQyhU-5_7U');
    expect(result.notes).toEqual(['extracted-from-iframe']);
  });

  it('naslov za gledanje pretvori v naslov za vdelavo', () => {
    const result = normalizeEmbedAddress('https://www.youtube.com/watch?v=vwQyhU-5_7U');
    expect(result.url).toBe('https://www.youtube.com/embed/vwQyhU-5_7U');
    expect(result.notes).toEqual(['youtube-to-embed']);
  });

  it('kratki youtu.be naslov dobi tudi domeno, ki vdelavo streže', () => {
    expect(normalizeEmbedAddress('https://youtu.be/vwQyhU-5_7U?si=abc123').url).toBe(
      'https://www.youtube.com/embed/vwQyhU-5_7U',
    );
  });

  it('ohrani uporabne parametre, zavrže v in si', () => {
    const result = normalizeEmbedAddress('https://www.youtube.com/watch?v=vwQyhU-5_7U&si=x&autoplay=1');
    expect(result.url).toBe('https://www.youtube.com/embed/vwQyhU-5_7U?autoplay=1');
  });

  it('naslova, ki je že za vdelavo, ne šteje za spremembo', () => {
    const result = normalizeEmbedAddress('https://www.youtube.com/embed/vwQyhU-5_7U');
    expect(result.url).toBe('https://www.youtube.com/embed/vwQyhU-5_7U');
    expect(result.notes).toEqual([]);
  });

  it('ohrani youtube-nocookie domeno, ki jo je uporabnik izbral namenoma', () => {
    expect(normalizeEmbedAddress('https://www.youtube-nocookie.com/watch?v=vwQyhU-5_7U').url).toBe(
      'https://www.youtube-nocookie.com/embed/vwQyhU-5_7U',
    );
  });

  it('tujega naslova ne spremeni, samo obreže', () => {
    const result = normalizeEmbedAddress('  https://kamera.example.com/snapshot.jpg  ');
    expect(result.url).toBe('https://kamera.example.com/snapshot.jpg');
    expect(result.notes).toEqual([]);
  });

  it('neveljavnega vhoda ne popravlja na silo — strežnik naj pove, kaj je narobe', () => {
    const result = normalizeEmbedAddress('kar tako');
    expect(result.url).toBe('kar tako');
    expect(result.notes).toEqual([]);
  });

  it('iz oznake iframe s tujim virom prav tako vzame samo src', () => {
    const result = normalizeEmbedAddress('<iframe src="https://ipcamlive.com/player/x" width="600"></iframe>');
    expect(result.url).toBe('https://ipcamlive.com/player/x');
    expect(result.notes).toEqual(['extracted-from-iframe']);
  });
});

describe('isEmbedOnlyAddress', () => {
  it.each([
    'https://www.youtube.com/embed/vwQyhU-5_7U',
    'https://youtu.be/vwQyhU-5_7U',
    'https://www.youtube-nocookie.com/embed/x',
  ])('%s je samo za vdelavo', (url) => {
    expect(isEmbedOnlyAddress(url)).toBe(true);
  });

  it.each(['https://kamera.example.com/snapshot.jpg', 'ni naslov', ''])('%s ni samo za vdelavo', (url) => {
    expect(isEmbedOnlyAddress(url)).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import {
  buildNotesFilter,
  deriveTitle,
  escapeRegExp,
  normalizeAudioMimeType,
  normalizeTags,
} from '../../src/modules/notes/domain/note-input.js';
import {
  audioFileName,
  describeTranscriptionBlock,
  transcriptionBlockReason,
} from '../../src/modules/notes/domain/transcription-gate.js';

// Čista domenska plast modula beležk — brez baze in brez strežnika (člen IX).

describe('normalizeTags', () => {
  it('poreže, poenoti velikost črk in odvrže podvojitve', () => {
    expect(normalizeTags([' Delo ', 'delo', 'DELO', 'dom'])).toEqual(['delo', 'dom']);
  });

  it('ohrani vrstni red prvega pojava', () => {
    expect(normalizeTags(['zadnja', 'prva'])).toEqual(['zadnja', 'prva']);
  });

  it('odvrže prazne vnose', () => {
    expect(normalizeTags(['', '   ', 'delo'])).toEqual(['delo']);
  });

  it('omeji število oznak na dvajset', () => {
    const many = Array.from({ length: 30 }, (_, i) => `oznaka-${i}`);
    expect(normalizeTags(many)).toHaveLength(20);
  });
});

describe('deriveTitle', () => {
  it('uporabi vpisan naslov, kadar obstaja', () => {
    expect(deriveTitle('  Sestanek  ', 'karkoli')).toBe('Sestanek');
  });

  it('brez naslova vzame prvo NEPRAZNO vrstico vsebine', () => {
    expect(deriveTitle('', '\n\n  Prva prava vrstica\nDruga')).toBe('Prva prava vrstica');
  });

  it('vrne prazen niz, kadar ni ne naslova ne vsebine', () => {
    expect(deriveTitle('   ', '\n \n')).toBe('');
  });
});

describe('escapeRegExp in buildNotesFilter', () => {
  it('ubeži znake, ki bi drugače pomenili vzorec', () => {
    expect(escapeRegExp('c++ (test) .*')).toBe('c\\+\\+ \\(test\\) \\.\\*');
  });

  it('filter vedno vsebuje userId', () => {
    expect(buildNotesFilter({ userId: 'u1' })).toEqual({ userId: 'u1' });
  });

  it('iskanje išče po naslovu in vsebini brez razlikovanja velikosti črk', () => {
    const filter = buildNotesFilter({ userId: 'u1', query: 'sestanek' }) as {
      $or: Array<Record<string, { $regex: string; $options: string }>>;
    };
    expect(filter.$or).toHaveLength(2);
    expect(filter.$or[0]!.title!.$options).toBe('i');
    expect(filter.$or[1]!.body!.$regex).toBe('sestanek');
  });

  it('oznaka v filtru je normalizirana', () => {
    expect(buildNotesFilter({ userId: 'u1', tag: ' DELO ' })).toMatchObject({ tags: 'delo' });
  });
});

describe('normalizeAudioMimeType', () => {
  it('odreže parameter kodeka, kot ga pošlje MediaRecorder', () => {
    expect(normalizeAudioMimeType('audio/webm;codecs=opus')).toBe('audio/webm');
  });

  it('sprejme oblike, ki jih posnamejo brskalniki', () => {
    expect(normalizeAudioMimeType('audio/mp4')).toBe('audio/mp4');
    expect(normalizeAudioMimeType('AUDIO/OGG')).toBe('audio/ogg');
  });

  it('zavrne vse, kar ni zvok, in manjkajočo glavo', () => {
    expect(normalizeAudioMimeType('application/pdf')).toBeNull();
    expect(normalizeAudioMimeType(undefined)).toBeNull();
  });
});

describe('transcriptionBlockReason — dvojna ključavnica', () => {
  it('brez ključa v okolju: not-configured', () => {
    expect(transcriptionBlockReason({ configured: false, enabled: true })).toBe('not-configured');
  });

  it('s ključem, brez privolitve: not-enabled', () => {
    // To je zahteva, zaradi katere ta funkcija obstaja: prisotnost ključa v .env SAMA
    // po sebi ne dovoli pošiljanja posnetkov ven.
    expect(transcriptionBlockReason({ configured: true, enabled: false })).toBe('not-enabled');
  });

  it('oboje: dovoljeno', () => {
    expect(transcriptionBlockReason({ configured: true, enabled: true })).toBeNull();
  });

  it('razlog pove, kaj mora kdo narediti', () => {
    expect(describeTranscriptionBlock('not-configured')).toContain('NOTES_TRANSCRIPTION_URL');
    expect(describeTranscriptionBlock('not-enabled')).toContain('Nastavitve');
  });
});

describe('audioFileName', () => {
  it('pripona sledi vrsti vsebine — storitve za prepis obliko berejo iz nje', () => {
    expect(audioFileName('audio/webm')).toBe('posnetek.webm');
    expect(audioFileName('audio/mp4')).toBe('posnetek.m4a');
    expect(audioFileName('audio/mpeg')).toBe('posnetek.mp3');
  });

  it('neznana vrsta dobi webm, ne pa praznega imena', () => {
    expect(audioFileName('audio/kdo-ve')).toBe('posnetek.webm');
  });
});

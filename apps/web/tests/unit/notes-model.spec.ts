import { describe, expect, it } from 'vitest';
import {
  appendDictation,
  describeTranscript,
  formatBytes,
  formatDuration,
  formatTagInput,
  notePreview,
  parseTagInput,
  type NoteAudio,
} from '../../src/app/features/notes/notes.model.js';

// Čista logika modula beležk — teče brez TestBed-a (isti vzorec kot settings-store.spec.ts).

describe('parseTagInput / formatTagInput', () => {
  it('loči po vejicah, poreže presledke in poenoti velikost črk', () => {
    expect(parseTagInput(' Delo, ideje ,DELO ')).toEqual(['delo', 'ideje']);
  });

  it('dovoli dvobesedno oznako — ločilo je vejica, ne presledek', () => {
    expect(parseTagInput('odprta vprašanja, delo')).toEqual(['odprta vprašanja', 'delo']);
  });

  it('prazen vnos da prazen seznam', () => {
    expect(parseTagInput('   ,  ,')).toEqual([]);
  });

  it('izpis je obraten vnosu', () => {
    expect(formatTagInput(['delo', 'ideje'])).toBe('delo, ideje');
    expect(parseTagInput(formatTagInput(['delo', 'ideje']))).toEqual(['delo', 'ideje']);
  });
});

describe('appendDictation', () => {
  it('doda presledek med prejšnjo vsebino in narekovanim delom', () => {
    // Brez tega bi se zadnja beseda zlila s prvo novo ("koncanovo") — najpogostejša okvara
    // narekovanega besedila.
    expect(appendDictation('Konec stavka.', 'Nov stavek.')).toBe('Konec stavka. Nov stavek.');
  });

  it('ohrani obstoječi prelom vrstice', () => {
    expect(appendDictation('Prva vrstica\n', 'Druga')).toBe('Prva vrstica\nDruga');
  });

  it('v prazno vsebino zapiše samo narekovano besedilo', () => {
    expect(appendDictation('', '  Zdravo  ')).toBe('Zdravo');
  });

  it('prazno narekovanje ne spremeni ničesar', () => {
    expect(appendDictation('Obstoječe', '   ')).toBe('Obstoječe');
  });
});

describe('formatDuration', () => {
  it('izpiše minute in sekunde', () => {
    expect(formatDuration(7000)).toBe('0:07');
    expect(formatDuration(102_000)).toBe('1:42');
  });

  it('neznano trajanje ni "0:00", ampak pomišljaj', () => {
    // `0:00` bi trdil, da je posnetek prazen; trajanja ne izračunavamo na strežniku, zato je
    // "neznano" resnično stanje in mora biti videti kot tako.
    expect(formatDuration(null)).toBe('—');
  });
});

describe('formatBytes', () => {
  it('izbere enoto po velikosti', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 kB');
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB');
  });
});

describe('notePreview', () => {
  it('zloži prelome v presledke', () => {
    expect(notePreview('Prva\n\nDruga   vrstica')).toBe('Prva Druga vrstica');
  });

  it('skrajša predolgo vsebino s tropičjem', () => {
    const preview = notePreview('a'.repeat(300), 20);
    expect(preview).toHaveLength(20);
    expect(preview.endsWith('…')).toBe(true);
  });
});

describe('describeTranscript', () => {
  const base: NoteAudio = {
    id: 'a1',
    mimeType: 'audio/webm',
    byteSize: 1000,
    durationMs: 5000,
    transcript: null,
    transcriptSource: null,
    transcriptStatus: 'none',
    transcriptError: null,
    createdAt: '2026-08-28T10:00:00.000Z',
  };

  it('pove, kdo je prepisal', () => {
    expect(describeTranscript({ ...base, transcriptStatus: 'done', transcriptSource: 'server' })).toContain('strežniku');
    expect(describeTranscript({ ...base, transcriptStatus: 'done', transcriptSource: 'browser' })).toContain('brskalniku');
  });

  it('spodletel prepis pokaže razlog, ne le "brez prepisa"', () => {
    expect(
      describeTranscript({ ...base, transcriptStatus: 'failed', transcriptError: 'Storitev ni odgovorila.' }),
    ).toBe('Storitev ni odgovorila.');
  });

  it('brez prepisa to izrecno pove', () => {
    expect(describeTranscript(base)).toBe('Brez prepisa');
  });
});

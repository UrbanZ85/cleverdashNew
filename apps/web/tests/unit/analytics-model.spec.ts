import { describe, expect, it } from 'vitest';
import {
  coverageNotice,
  findingLabel,
  formatBytes,
  formatMoment,
  percentOf,
} from '../../src/app/features/analytics/analytics.model.js';
import { tabIdForUrl } from '../../src/app/core/usage/tab-for-url.js';

// 014: čiste funkcije vmesnika in preslikava naslova v zavihek. Izris komponent ni pokrit — pokrite
// so odločitve, ki jih je mogoče pokvariti tiho.

describe('formatBytes', () => {
  it('izbere enoto in uporabi slovensko decimalno vejico', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 kB');
    expect(formatBytes(1024 * 1024 * 1.5)).toBe('1,5 MB');
    expect(formatBytes(1024 ** 3 * 2)).toBe('2 GB');
  });

  it('bajtov in kilobajtov ne prikaže z decimalkami', () => {
    // "1,0 kB" je natančnost, ki je ni.
    expect(formatBytes(1500)).toBe('1 kB');
  });

  it('nič je "0 B" in NE prazen niz', () => {
    // Prazna celica v tabeli porabe je videti kot manjkajoč podatek; ničla je odgovor (FR-008).
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(-5)).toBe('0 B');
    expect(formatBytes(Number.NaN)).toBe('0 B');
  });

  it('velike vrednosti ne uidejo z lestvice enot', () => {
    expect(formatBytes(1024 ** 5)).toContain('TB');
  });
});

describe('percentOf', () => {
  it('izračuna delež', () => {
    expect(percentOf(25, 100)).toBe(25);
  });

  it('brez celote vrne 0 in nikoli NaN — vrednost gre v slog elementa', () => {
    expect(percentOf(5, 0)).toBe(0);
    expect(percentOf(Number.NaN, 100)).toBe(0);
  });

  it('nikoli ne preseže 100 in ni negativen', () => {
    expect(percentOf(300, 100)).toBe(100);
    expect(percentOf(-3, 100)).toBe(0);
  });
});

describe('formatMoment', () => {
  it('manjkajoč čas je pomišljaj, ne prazna celica', () => {
    expect(formatMoment(null)).toBe('—');
    expect(formatMoment('to ni datum')).toBe('—');
  });

  it('veljaven čas izpiše', () => {
    expect(formatMoment('2026-05-10T10:00:00Z')).not.toBe('—');
  });
});

describe('findingLabel', () => {
  it('ima slovensko besedilo za vsako vrsto ugotovitve (člen X)', () => {
    for (const kind of ['missing-content', 'orphan-blob', 'broken-record', 'stalled-upload'] as const) {
      expect(findingLabel(kind).length).toBeGreaterThan(5);
      expect(findingLabel(kind)).not.toContain('-');
    }
  });
});

describe('coverageNotice — prazno obdobje ni "nihče se ni prijavljal" (FR-038)', () => {
  it('pokrito obdobje nima opozorila', () => {
    expect(coverageNotice({ dataSince: '2026-01-01', retentionDays: 400, truncated: false })).toBeNull();
  });

  it('brez meritev pove, da se zbirajo šele od uvedbe', () => {
    const text = coverageNotice({ dataSince: null, retentionDays: 400, truncated: true });
    expect(text).toContain('za nazaj');
  });

  it('okrnjeno obdobje navede dan, od katerega meritve obstajajo', () => {
    const text = coverageNotice({ dataSince: '2026-04-01', retentionDays: 400, truncated: true });
    expect(text).toContain('2026-04-01');
    expect(text).toContain('400');
  });
});

describe('tabIdForUrl — kaj se sploh pošlje strežniku', () => {
  const TABS = [
    { id: 'dashboard', route: '/dashboard' },
    { id: 'time-tracking', route: '/time-tracking' },
    { id: 'notes', route: '/notes' },
  ];

  it('preslika pot zavihka v njegovo oznako', () => {
    expect(tabIdForUrl('/notes', TABS)).toBe('notes');
  });

  it('podstran pripada svojemu zavihku', () => {
    // Človek, ki je na Urniku, je v Beleženju časa.
    expect(tabIdForUrl('/time-tracking/schedule', TABS)).toBe('time-tracking');
  });

  it('poizvedba in sidro ne vplivata — in ne zapustita brskalnika', () => {
    // Pošlje se izključno oznaka zavihka; `?q=tajno` se odreže še pred preslikavo (člen XII).
    expect(tabIdForUrl('/notes?q=tajno#zadetek', TABS)).toBe('notes');
  });

  it('zaključni "/" ne prepreči ujemanja', () => {
    expect(tabIdForUrl('/notes/', TABS)).toBe('notes');
  });

  it('javna stran ni zavihek in se ne pošlje', () => {
    expect(tabIdForUrl('/r/abc123', TABS)).toBeNull();
    expect(tabIdForUrl('/d/abc123', TABS)).toBeNull();
    expect(tabIdForUrl('/u/abc123', TABS)).toBeNull();
  });

  it('neznana pot vrne null namesto ugibanja', () => {
    expect(tabIdForUrl('/nekaj-drugega', TABS)).toBeNull();
    expect(tabIdForUrl('', TABS)).toBeNull();
  });

  it('izbere NAJDALJŠE ujemanje, ne prvega', () => {
    const nested = [
      { id: 'kratek', route: '/a' },
      { id: 'dolg', route: '/a/b' },
    ];
    expect(tabIdForUrl('/a/b/c', nested)).toBe('dolg');
  });

  it('podobno ime poti ne ujame tujega zavihka', () => {
    // `/notes-arhiv` ni podstran zavihka `notes`.
    expect(tabIdForUrl('/notes-arhiv', TABS)).toBeNull();
  });
});

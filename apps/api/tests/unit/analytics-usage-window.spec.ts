import { describe, expect, it } from 'vitest';
import {
  ALLOWED_WINDOW_DAYS,
  buildCoverage,
  buildWindow,
  isAllowedWindow,
} from '../../src/modules/analytics/domain/usage-window.js';

// Kakovostna vrata (točka 2): primer "dopust čez mejo meseca" v tej funkcionalnosti nima predmeta
// (obdobij, daljših od dneva, modul ne modelira). Nadomešča ga OKNO ČEZ MEJO LETA — isti razred
// napake, drugi predmet.

describe('buildWindow — obdobje je število koledarskih dni, ne N×24 ur', () => {
  it('7 dni pomeni danes in ŠEST dni nazaj, ne sedem', () => {
    // Meja `-(days - 1)` je edino mesto, kjer je to mogoče zgrešiti, in razlika se pokaže šele
    // pri seštevku — osmi dan bi tiho pritegnil podatke, ki v "zadnji teden" ne sodijo.
    const w = buildWindow(7, new Date('2026-05-10T12:00:00Z'));
    expect(w).toEqual({ days: 7, fromDay: '2026-05-04', toDay: '2026-05-10' });
  });

  it('1 dan pomeni samo danes', () => {
    const w = buildWindow(1, new Date('2026-05-10T12:00:00Z'));
    expect(w.fromDay).toBe(w.toDay);
  });

  it('OKNO ČEZ MEJO LETA: 90 dni od januarja sega v prejšnje leto', () => {
    const w = buildWindow(90, new Date('2026-01-15T12:00:00Z'));
    expect(w.toDay).toBe('2026-01-15');
    expect(w.fromDay).toBe('2025-10-18');
    // Leksikografska primerjava nizov mora ustrezati koledarski — na tem stoji cela poizvedba.
    expect(w.fromDay < w.toDay).toBe(true);
  });

  it('OKNO ČEZ PREHOD NA ZIMSKI ČAS ne izgubi in ne podvoji dneva', () => {
    // 30 dni nazaj od 10. novembra 2026 pelje čez 25. oktober (dan s 25 urami).
    const w = buildWindow(30, new Date('2026-11-10T12:00:00Z'));
    expect(w.fromDay).toBe('2026-10-12');
    expect(w.toDay).toBe('2026-11-10');
  });

  it('mejo dneva postavi po Ljubljani in ne po UTC', () => {
    // 23:30 UTC 9. maja je 01:30 CEST 10. maja — okno se mora začeti glede na ljubljanski dan.
    const w = buildWindow(7, new Date('2026-05-09T23:30:00Z'));
    expect(w.toDay).toBe('2026-05-10');
  });
});

describe('isAllowedWindow', () => {
  it('sprejme natanko 7, 30 in 90', () => {
    expect(ALLOWED_WINDOW_DAYS).toEqual([7, 30, 90]);
    for (const days of ALLOWED_WINDOW_DAYS) expect(isAllowedWindow(days)).toBe(true);
  });

  it('zavrne vse ostalo', () => {
    for (const days of [0, 1, 31, 365, -7]) expect(isAllowedWindow(days)).toBe(false);
  });
});

describe('buildCoverage — prazno obdobje ni "nihče se ni prijavljal" (FR-038)', () => {
  const now = new Date('2026-05-10T12:00:00Z');

  it('prazna zbirka pomeni truncated, ne tiho ničlo', () => {
    const coverage = buildCoverage({
      window: buildWindow(30, now),
      dataSince: null,
      retentionDays: 400,
      now,
    });
    expect(coverage).toEqual({ dataSince: null, retentionDays: 400, truncated: true });
  });

  it('obdobje, ki sega pred prvo meritev, je truncated', () => {
    const coverage = buildCoverage({
      window: buildWindow(90, now), // od 2026-02-09
      dataSince: '2026-04-01',
      retentionDays: 400,
      now,
    });
    expect(coverage.truncated).toBe(true);
  });

  it('obdobje znotraj meritev NI truncated', () => {
    const coverage = buildCoverage({
      window: buildWindow(7, now), // od 2026-05-04
      dataSince: '2026-04-01',
      retentionDays: 400,
      now,
    });
    expect(coverage.truncated).toBe(false);
  });

  it('obdobje, ki sega pred rok hrambe, je truncated tudi če meritve segajo dlje nazaj', () => {
    // Zapisi izpred roka hrambe so že pobrisani; brez te zastavice bi bila luknja videti kot
    // mirno obdobje.
    const coverage = buildCoverage({
      window: buildWindow(90, now),
      dataSince: '2020-01-01',
      retentionDays: 30,
      now,
    });
    expect(coverage.truncated).toBe(true);
  });
});

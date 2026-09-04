import { describe, expect, it } from 'vitest';
import {
  COMMUTE_MAX_WAIT_MS,
  DEFAULT_MAP_HEIGHT_PX,
  MAX_MAP_HEIGHT_PX,
  MIN_MAP_HEIGHT_PX,
  clampMapHeightPx,
  commuteDirection,
  commuteTileWidthPx,
  formatDelay,
  formatDistance,
  formatDuration,
  ljubljanaClock,
  msUntilNextSwitch,
  nextRefreshMs,
  orderedCommuteLegs,
  travelUnavailableMessage,
  type CommuteLeg,
} from '../../src/app/features/dashboard/commute.model.js';

// Ploščica "Pot" ima na odjemalcu dve nalogi: KATERA smer je zdaj zgoraj (odvisno od ure v
// coni `Europe/Ljubljana` — člen V.4 velja tudi tu) in KAKO se izpišejo številke, ki pridejo
// s strežnika. Oboje je čista funkcija: preverljivo brez brskalnika, brez premikanja
// sistemske ure in brez klica plačljivega vira.
//
// Vsi časi v testu so zapisani kot UTC instant, ljubljanski čas pa je v komentarju — če bi
// se koda kdaj vrnila na `Date.getHours()`, se poletni primeri podrejo, kar je namen.

const leg = (direction: CommuteLeg['direction']): CommuteLeg => ({
  direction,
  label: direction === 'to-work' ? 'V službo' : 'Domov',
  from: direction === 'to-work' ? 'Doma' : 'Služba',
  to: direction === 'to-work' ? 'Služba' : 'Doma',
  mapEmbedUrl: 'https://maps.google.com/maps?saddr=a&daddr=b&output=embed',
  travel: { durationSeconds: 2400, staticDurationSeconds: 1800, delaySeconds: 600, distanceMeters: 18_400 },
  travelUnavailable: null,
  stale: false,
  ageSeconds: 0,
});

describe('commuteDirection — pozimi (CET, UTC+1)', () => {
  it.each([
    ['2026-01-15T05:00:00Z', 'to-work', '06:00'],
    ['2026-01-15T10:59:00Z', 'to-work', '11:59'],
    ['2026-01-15T11:00:00Z', 'to-home', '12:00 — meja'],
    ['2026-01-15T18:00:00Z', 'to-home', '19:00'],
    ['2026-01-15T23:30:00Z', 'to-work', '00:30 naslednjega dne'],
  ])('%s → %s (%s po Ljubljani)', (iso, expected) => {
    expect(commuteDirection(new Date(iso))).toBe(expected);
  });
});

describe('commuteDirection — poleti (CEST, UTC+2)', () => {
  // Ti primeri lovijo natanko napako, ki bi jo naredila UTC ura: ob 10:30 UTC je po
  // Ljubljani že 12:30 in pot domov, po UTC pa bi bilo videti kot dopoldan.
  it.each([
    ['2026-07-01T09:59:00Z', 'to-work', '11:59'],
    ['2026-07-01T10:00:00Z', 'to-home', '12:00 — meja'],
    ['2026-07-01T10:30:00Z', 'to-home', '12:30'],
    ['2026-07-01T22:00:00Z', 'to-work', '00:00 naslednjega dne'],
  ])('%s → %s (%s po Ljubljani)', (iso, expected) => {
    expect(commuteDirection(new Date(iso))).toBe(expected);
  });
});

describe('ljubljanaClock ob prehodu na poletni čas', () => {
  // 29. 3. 2026 ob 02:00 CET se ura prestavi na 03:00 CEST. Ista razlika ene ure, ki je v
  // starem sistemu pomenila napačen koledarski dan (docs/legacy-engine.md §4).
  it('pred prestavitvijo je ura 01:30 (CET)', () => {
    expect(ljubljanaClock(new Date('2026-03-29T00:30:00Z')).hour).toBe(1);
  });

  it('po prestavitvi je ura 03:30 (CEST), ne 02:30', () => {
    expect(ljubljanaClock(new Date('2026-03-29T01:30:00Z')).hour).toBe(3);
  });

  it('polnoč je ura 0 in ne 24 — sicer bi smer ob polnoči padla v napačno vejo', () => {
    expect(ljubljanaClock(new Date('2026-07-01T22:00:00Z')).hour).toBe(0);
    expect(commuteDirection(new Date('2026-07-01T22:00:00Z'))).toBe('to-work');
  });
});

describe('orderedCommuteLegs', () => {
  const legs = [leg('to-work'), leg('to-home')];

  it('dopoldne postavi pot v službo na prvo mesto', () => {
    const result = orderedCommuteLegs(legs, new Date('2026-07-01T06:00:00Z')); // 08:00
    expect(result.map((l) => l.direction)).toEqual(['to-work', 'to-home']);
  });

  it('popoldne postavi pot domov na prvo mesto', () => {
    const result = orderedCommuteLegs(legs, new Date('2026-07-01T14:00:00Z')); // 16:00
    expect(result.map((l) => l.direction)).toEqual(['to-home', 'to-work']);
  });

  it('vrstni red s strežnika ni pomemben — odloči ura, ne odgovor', () => {
    const reversed = [leg('to-home'), leg('to-work')];
    const result = orderedCommuteLegs(reversed, new Date('2026-07-01T06:00:00Z'));
    expect(result[0]?.direction).toBe('to-work');
  });

  it('nobene smeri ne izgubi in nobene ne podvoji', () => {
    expect(orderedCommuteLegs(legs, new Date())).toHaveLength(2);
    expect(orderedCommuteLegs([], new Date())).toEqual([]);
  });
});

describe('msUntilNextSwitch', () => {
  it('dve minuti pred poldnevom vrne natanko toliko', () => {
    expect(msUntilNextSwitch(new Date('2026-07-01T09:58:00Z'))).toBe(120_000); // 11:58
  });

  it('pol minute pred polnočjo vrne natanko toliko', () => {
    expect(msUntilNextSwitch(new Date('2026-07-01T21:59:30Z'))).toBe(30_000); // 23:59:30
  });

  it('daleč od meje vrne zgornjo mejo, ne cele ure čakanja', () => {
    // Zgornja meja je varovalka za premik sistemske ure in prehod na poletni čas: ploščica
    // se pobere tudi, če je bil izračun narejen v drugem odmiku cone.
    expect(msUntilNextSwitch(new Date('2026-01-15T08:00:00Z'))).toBe(COMMUTE_MAX_WAIT_MS); // 09:00
    expect(msUntilNextSwitch(new Date('2026-03-29T00:30:00Z'))).toBe(COMMUTE_MAX_WAIT_MS); // 01:30 CET
  });

  it('nikoli ne vrne nič ali negativne vrednosti — to bi bila tesna zanka', () => {
    for (let minute = 0; minute < 24 * 60; minute += 7) {
      const at = new Date(Date.UTC(2026, 6, 1, 0, minute, 0));
      const ms = msUntilNextSwitch(at);
      expect(ms, at.toISOString()).toBeGreaterThan(0);
      expect(ms, at.toISOString()).toBeLessThanOrEqual(COMMUTE_MAX_WAIT_MS);
    }
  });
});

describe('nextRefreshMs', () => {
  const at = new Date('2026-07-01T06:00:00Z'); // 08:00 — do poldneva več kot zgornja meja

  it('ne osvežuje pogosteje, kot strežnik sploh osveži vir (člen VIII)', () => {
    // Strežnik do izteka TTL vrača isti podatek in zunanjega vira ne kliče — pogostejši klic
    // je čista poraba, pri plačljivem viru pa tudi strošek.
    expect(nextRefreshMs(300, at)).toBe(300_000);
  });

  it('nikoli pa ne redkeje kot do menjave smeri', () => {
    // Ob 11:58 se mora ploščica zbuditi ob 12:00, tudi če je TTL pet minut.
    expect(nextRefreshMs(300, new Date('2026-07-01T09:58:00Z'))).toBe(120_000);
  });

  it('nesmiselno majhen nextPollSeconds dvigne na 30 s', () => {
    expect(nextRefreshMs(1, at)).toBe(30_000);
  });
});

describe('izpis časa, zamude in razdalje', () => {
  it.each([
    [0, '0 min'],
    [59, '1 min'],
    [2400, '40 min'],
    [3600, '1 h'],
    [5400, '1 h 30 min'],
    [7500, '2 h 5 min'],
  ])('formatDuration(%s) → %s', (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected);
  });

  it('zamuda pod minuto ni podatek, ampak šum — vrne null', () => {
    // Vir vrne razliko tudi takrat, ko prometa praktično ni; "+0 min zaradi prometa" bi bilo
    // videti kot okvara izračuna.
    expect(formatDelay(0)).toBeNull();
    expect(formatDelay(59)).toBeNull();
  });

  it.each([
    [60, '+1 min zaradi prometa'],
    [600, '+10 min zaradi prometa'],
    [3660, '+1 h 1 min zaradi prometa'],
  ])('formatDelay(%s) → %s', (seconds, expected) => {
    expect(formatDelay(seconds)).toBe(expected);
  });

  it.each([
    [450, '450 m'],
    [1000, '1,0 km'],
    [18_400, '18,4 km'],
    [123_400, '123 km'],
  ])('formatDistance(%s) → %s (decimalna vejica, člen X)', (meters, expected) => {
    expect(formatDistance(meters)).toBe(expected);
  });
});

describe('travelUnavailableMessage', () => {
  it('vsako stanje ima svoje slovensko pojasnilo (člen VII in X)', () => {
    const reasons = ['not-configured', 'no-api-key', 'no-route', 'source-unavailable'] as const;
    const messages = reasons.map((reason) => travelUnavailableMessage(reason));
    // Različna stanja imajo različne poti ven, zato ne smejo imeti istega besedila.
    expect(new Set(messages).size).toBe(reasons.length);
    for (const message of messages) {
      expect(message.length).toBeGreaterThan(10);
      expect(message).not.toContain('-'); // ne identifikator namesto povedi
    }
  });
});

describe('videz ploščice — višina in postavitev', () => {
  it('širina ploščice sledi postavitvi: vodoravno je dvakrat širše', () => {
    // Pri dveh zemljevidih drug ob drugem v ozki ploščici je vsak ožji od tega, kar je še
    // berljivo — zato širina ni konstanta, ampak sledi izbiri.
    expect(commuteTileWidthPx('vertical')).toBe(440);
    expect(commuteTileWidthPx('horizontal')).toBeGreaterThan(commuteTileWidthPx('vertical') * 1.5);
  });

  it.each([
    [170, 170],
    [100, 100],
    [600, 600],
  ])('clampMapHeightPx(%s) → %s (vrednost znotraj mej ostane)', (value, expected) => {
    expect(clampMapHeightPx(value)).toBe(expected);
  });

  it('nesmiselna višina ne izriše okvirja brez višine', () => {
    // Ploščica mora ostati uporabna tudi, če v nastavitvah kdaj pristane 0 ali NaN.
    expect(clampMapHeightPx(0)).toBe(MIN_MAP_HEIGHT_PX);
    expect(clampMapHeightPx(5000)).toBe(MAX_MAP_HEIGHT_PX);
    expect(clampMapHeightPx(Number.NaN)).toBe(DEFAULT_MAP_HEIGHT_PX);
    expect(clampMapHeightPx(null)).toBe(DEFAULT_MAP_HEIGHT_PX);
    expect(clampMapHeightPx(undefined)).toBe(DEFAULT_MAP_HEIGHT_PX);
  });

  it('višina se zaokroži na celo slikovno točko', () => {
    expect(clampMapHeightPx(199.6)).toBe(200);
  });
});

import { describe, expect, it } from 'vitest';
import {
  dueState,
  nextDueDate,
  parseDueDate,
} from '../../src/modules/todos/domain/due-date.js';
import { ljubljanaCalendarDay } from '../../src/domain/timezone.js';

// KAKOVOSTNA VRATA, TOČKA 2 — prehod na poletni oziroma zimski čas. V 010 ta primer PREDMET
// IMA (prvič po 001), in sicer prek neobveznega roka opravila.
//
// Vsak test spodaj je izbran tako, da NAIVNI izračun pade. Naivni izračun je bodisi
// `toISOString().split('T')[0]` (prepovedan z ESLint pravilom) bodisi razlika v
// milisekundah, deljena s 24 urami. Primeri, pri katerih bi tudi naivni izračun odgovoril
// pravilno, tu ničesar ne dokazujejo in jih zato ni.
//
// Ključ je v tem, da se KOLEDARSKI DAN v Ljubljani in v UTC razlikujeta vsak dan med 22:00
// (poleti) oziroma 23:00 (pozimi) UTC in polnočjo UTC. Testi so postavljeni prav v to okno.

describe('parseDueDate — koledarski dan v UTC instant konca tega dne', () => {
  it('29. 3. 2026 (dan, dolg 23 ur — prehod na poletni čas) ostane 29. marec', () => {
    const due = parseDueDate('2026-03-29');
    expect(due).not.toBeNull();
    expect(ljubljanaCalendarDay(due as Date)).toBe('2026-03-29');
  });

  it('25. 10. 2026 (dan, dolg 25 ur — prehod na zimski čas) ostane 25. oktober', () => {
    const due = parseDueDate('2026-10-25');
    expect(due).not.toBeNull();
    expect(ljubljanaCalendarDay(due as Date)).toBe('2026-10-25');
  });

  it('vrne KONEC dneva, ne začetka — sicer bi rok "danes" zamujal že ob polnoči (FR-032)', () => {
    const due = parseDueDate('2026-06-15') as Date;
    // Zadnji trenutek 15. junija; milisekunda pozneje je že 16. junij po ljubljanskem koledarju.
    expect(ljubljanaCalendarDay(due)).toBe('2026-06-15');
    expect(ljubljanaCalendarDay(new Date(due.getTime() + 1))).toBe('2026-06-16');
  });

  it('brez roka je null, ne "danes" (FR-030)', () => {
    expect(parseDueDate(null)).toBeNull();
    expect(parseDueDate(undefined)).toBeNull();
    expect(parseDueDate('')).toBeNull();
  });

  it('neveljaven zapis je null, ne vrženo — usmerjevalnik ga zavrne že s shemo', () => {
    expect(parseDueDate('nekaj')).toBeNull();
    expect(parseDueDate('2026-13-45')).toBeNull();
  });
});

describe('dueState — koledarski dan v Ljubljani, ne v UTC', () => {
  it('rok 29. 3. ob 23:30 UTC dne 28. 3. je DANES (v Ljubljani je že 29. marca 00:30)', () => {
    // Naivni izračun po UTC bi rekel "jutri": v UTC je še 28. marec. To je natanko tista
    // napaka, zaradi katere je `toISOString().split('T')[0]` prepovedan.
    expect(dueState(parseDueDate('2026-03-29'), new Date('2026-03-28T23:30:00Z'))).toBe('today');
  });

  it('rok 25. 10. ob 23:30 UTC dne 24. 10. je DANES (v Ljubljani je že 25. oktobra 01:30)', () => {
    expect(dueState(parseDueDate('2026-10-25'), new Date('2026-10-24T23:30:00Z'))).toBe('today');
  });

  it('rok 29. 3. sredi dne 28. 3. je JUTRI', () => {
    expect(dueState(parseDueDate('2026-03-29'), new Date('2026-03-28T12:00:00Z'))).toBe('tomorrow');
  });

  it('rok "danes" ob 23:59:59 po lokalnem času ŠE NI zamujen (FR-032)', () => {
    // 2026-06-15T21:59:59Z = 23:59:59 po ljubljanskem poletnem času.
    expect(dueState(parseDueDate('2026-06-15'), new Date('2026-06-15T21:59:59Z'))).toBe('today');
  });

  it('rok, ki je minil, je zamujen', () => {
    expect(dueState(parseDueDate('2026-06-14'), new Date('2026-06-15T10:00:00Z'))).toBe('overdue');
  });

  it('rok čez več kot en dan je "later"', () => {
    expect(dueState(parseDueDate('2026-06-20'), new Date('2026-06-15T10:00:00Z'))).toBe('later');
  });

  it('brez roka ni stanja', () => {
    expect(dueState(null, new Date('2026-06-15T10:00:00Z'))).toBeNull();
    expect(dueState(undefined, new Date('2026-06-15T10:00:00Z'))).toBeNull();
  });
});

describe('dueState — meja meseca in leta (nadomešča "dopust čez mejo meseca")', () => {
  it('rok 1. 3. sredi dne 28. 2. je JUTRI', () => {
    expect(dueState(parseDueDate('2026-03-01'), new Date('2026-02-28T12:00:00Z'))).toBe('tomorrow');
  });

  it('rok 1. 3. ob 23:30 UTC dne 28. 2. je DANES — meja meseca IN meja cone hkrati', () => {
    expect(dueState(parseDueDate('2026-03-01'), new Date('2026-02-28T23:30:00Z'))).toBe('today');
  });

  it('rok 1. 1. sredi dne 31. 12. je JUTRI — meja leta', () => {
    expect(dueState(parseDueDate('2026-01-01'), new Date('2025-12-31T12:00:00Z'))).toBe('tomorrow');
  });

  it('rok 1. 1. ob 23:30 UTC dne 31. 12. je DANES — meja leta IN meja cone hkrati', () => {
    expect(dueState(parseDueDate('2026-01-01'), new Date('2025-12-31T23:30:00Z'))).toBe('today');
  });
});

describe('nextDueDate', () => {
  const task = (done: boolean, day: string | null) => ({ done, dueDate: parseDueDate(day) });

  it('vrne najzgodnejši rok med NEODKLJUKANIMI', () => {
    const result = nextDueDate([task(false, '2026-06-20'), task(false, '2026-06-15')]);
    expect(ljubljanaCalendarDay(result as Date)).toBe('2026-06-15');
  });

  it('odkljukanih ne šteje — opravljeno opravilo z včerajšnjim rokom ni zamuda (FR-034)', () => {
    const result = nextDueDate([task(true, '2026-06-10'), task(false, '2026-06-15')]);
    expect(ljubljanaCalendarDay(result as Date)).toBe('2026-06-15');
  });

  it('opravila brez roka preskoči', () => {
    const result = nextDueDate([task(false, null), task(false, '2026-06-15'), task(false, null)]);
    expect(ljubljanaCalendarDay(result as Date)).toBe('2026-06-15');
  });

  it('prazen seznam in seznam brez rokov dasta null', () => {
    expect(nextDueDate([])).toBeNull();
    expect(nextDueDate([task(false, null), task(true, '2026-06-10')])).toBeNull();
  });
});

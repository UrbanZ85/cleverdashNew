import { describe, expect, it } from 'vitest';
import {
  dueColor,
  dueLabel,
  pluralTasks,
  progressBadge,
  progressLabel,
} from '../../src/app/features/todos/todos.model.js';

// Vidno besedilo je slovensko in zapisano na mestu (člen X) — i18n sistema v projektu ni.
// Sklanjatev je zato ročna in ima svoj test: "3 opravilo" je videti kot okvara, ne kot
// podrobnost.

describe('pluralTasks — slovenska sklanjatev', () => {
  it.each([
    [1, 'opravilo'],
    [2, 'opravili'],
    [3, 'opravila'],
    [4, 'opravila'],
    [5, 'opravil'],
    [10, 'opravil'],
    [0, 'opravil'],
  ])('%i → %s', (n, expected) => {
    expect(pluralTasks(n)).toBe(expected);
  });

  it('enajst do štirinajst je "opravil", ne po zadnji števki', () => {
    // Napaka, ki jo naredi modul 10 namesto 100: "11 opravilo".
    for (const n of [11, 12, 13, 14]) expect(pluralTasks(n)).toBe('opravil');
  });

  it('nad sto se vzorec ponovi', () => {
    expect(pluralTasks(101)).toBe('opravilo');
    expect(pluralTasks(102)).toBe('opravili');
    expect(pluralTasks(103)).toBe('opravila');
    expect(pluralTasks(105)).toBe('opravil');
    expect(pluralTasks(111)).toBe('opravil');
  });
});

describe('progressLabel in progressBadge', () => {
  it('prazen seznam pove, da je prazen — ne "0 opravil še odprtih"', () => {
    expect(progressLabel({ openCount: 0, taskCount: 0 })).toBe('Prazen seznam');
  });

  it('vse opravljeno je svoje sporočilo', () => {
    expect(progressLabel({ openCount: 0, taskCount: 5 })).toBe('Vse opravljeno');
  });

  it('odprta opravila so našteta s pravilno sklanjatvijo', () => {
    expect(progressLabel({ openCount: 1, taskCount: 5 })).toBe('1 opravilo še odprtih');
    expect(progressLabel({ openCount: 3, taskCount: 5 })).toBe('3 opravila še odprtih');
  });

  it('značka na čipu šteje OPRAVLJENA od vseh', () => {
    expect(progressBadge({ openCount: 4, taskCount: 7 })).toBe('3/7');
    expect(progressBadge({ openCount: 0, taskCount: 7 })).toBe('7/7');
    expect(progressBadge({ openCount: 0, taskCount: 0 })).toBe('0/0');
  });
});

describe('dueLabel in dueColor', () => {
  it('brez roka ni oznake', () => {
    expect(dueLabel({ dueDate: null, dueState: null })).toBeNull();
  });

  it('danes in jutri sta zapisana z besedo, ne z datumom', () => {
    expect(dueLabel({ dueDate: '2026-06-15T21:59:59.999Z', dueState: 'today' })).toBe('danes');
    expect(dueLabel({ dueDate: '2026-06-16T21:59:59.999Z', dueState: 'tomorrow' })).toBe('jutri');
  });

  it('zamujeno pove, OD KDAJ zamuja', () => {
    const text = dueLabel({ dueDate: '2026-06-10T21:59:59.999Z', dueState: 'overdue' });
    expect(text).toContain('zamuja od');
  });

  it('barva loči zamujeno od današnjega, ostalo je privzeto', () => {
    expect(dueColor('overdue')).toBe('danger');
    expect(dueColor('today')).toBe('warning');
    expect(dueColor('tomorrow')).toBeNull();
    expect(dueColor('later')).toBeNull();
    expect(dueColor(null)).toBeNull();
  });
});

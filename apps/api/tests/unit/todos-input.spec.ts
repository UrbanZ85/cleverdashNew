import { describe, expect, it } from 'vitest';
import {
  MAX_TASK_TITLE_LENGTH,
  makeTask,
  sanitizeListTitle,
  sanitizeTaskTitle,
  splitPastedTitles,
} from '../../src/modules/todos/domain/todo-input.js';

// FR-012 do FR-016. Krmilni znaki so v testih zapisani s `String.fromCharCode`, ne kot
// dobesedni znaki v izvorni kodi: nevidnega bajta v datoteki nihče ne opazi, dokler ne
// pokvari nečesa drugega.
const NUL = String.fromCharCode(0);
const BEL = String.fromCharCode(7);
const DEL = String.fromCharCode(127);

describe('sanitizeTaskTitle', () => {
  it('obreže robne presledke', () => {
    expect(sanitizeTaskTitle('   Mleko   ')).toBe('Mleko');
  });

  it('zlije notranje presledke v enega', () => {
    expect(sanitizeTaskTitle('Kupi     mleko')).toBe('Kupi mleko');
  });

  it('prelom vrstice postane presledek — naslov ostane ena vrstica (FR-012)', () => {
    expect(sanitizeTaskTitle('Kupi\nmleko')).toBe('Kupi mleko');
    expect(sanitizeTaskTitle('Kupi\r\nmleko')).toBe('Kupi mleko');
  });

  it('tabulator postane presledek', () => {
    expect(sanitizeTaskTitle('Kupi\tmleko')).toBe('Kupi mleko');
  });

  it('krmilni znaki izginejo, brez sledi v besedilu', () => {
    expect(sanitizeTaskTitle(`Kupi${NUL}${BEL}mleko`)).toBe('Kupi mleko');
    expect(sanitizeTaskTitle(`Mleko${DEL}`)).toBe('Mleko');
  });

  it('VEZAJ ni krmilni znak in ostane', () => {
    // Regresija: prvi zapis čiščenja je uporabil razred `[ -]`, kar pomeni "presledek ALI
    // vezaj" in ne razreda krmilnih znakov — iz naslovov je brisal vezaje.
    expect(sanitizeTaskTitle('Mleko - 2 litra')).toBe('Mleko - 2 litra');
    expect(sanitizeTaskTitle('e-pošta')).toBe('e-pošta');
  });

  it('šumniki ostanejo nedotaknjeni (člen X)', () => {
    expect(sanitizeTaskTitle('Čistilo za šipe in žar')).toBe('Čistilo za šipe in žar');
  });

  it('reže natanko na mejo', () => {
    const dolg = 'a'.repeat(MAX_TASK_TITLE_LENGTH + 50);
    expect(sanitizeTaskTitle(dolg)).toHaveLength(MAX_TASK_TITLE_LENGTH);
  });

  it('naslov natanko na meji ostane cel', () => {
    const tocno = 'a'.repeat(MAX_TASK_TITLE_LENGTH);
    expect(sanitizeTaskTitle(tocno)).toHaveLength(MAX_TASK_TITLE_LENGTH);
  });

  it('sami presledki ali sami krmilni znaki dajo prazen niz (FR-014)', () => {
    expect(sanitizeTaskTitle('     ')).toBe('');
    expect(sanitizeTaskTitle(`${NUL}${BEL}`)).toBe('');
    expect(sanitizeTaskTitle('')).toBe('');
  });
});

describe('sanitizeListTitle', () => {
  it('velja ista pravila, druga meja', () => {
    expect(sanitizeListTitle('  Nakupovalni   seznam  ')).toBe('Nakupovalni seznam');
    expect(sanitizeListTitle('a'.repeat(200))).toHaveLength(100);
  });
});

describe('splitPastedTitles', () => {
  it('tri vrstice dajo tri opravila, ne enega s prelomi (FR-013)', () => {
    expect(splitPastedTitles('Mleko\nKruh\nKava')).toEqual(['Mleko', 'Kruh', 'Kava']);
  });

  it('prazne vrstice preskoči', () => {
    expect(splitPastedTitles('Mleko\n\n\nKruh')).toEqual(['Mleko', 'Kruh']);
  });

  it('vrstice, od katerih po čiščenju ne ostane nič, se ne štejejo', () => {
    expect(splitPastedTitles(`Mleko\n   \n${NUL}\nKruh`)).toEqual(['Mleko', 'Kruh']);
  });

  it('obdela oba zapisa preloma vrstice', () => {
    expect(splitPastedTitles('Mleko\r\nKruh')).toEqual(['Mleko', 'Kruh']);
  });

  it('eno vrstico da kot en element — hitri vnos gre skozi isto pot', () => {
    expect(splitPastedTitles('Mleko')).toEqual(['Mleko']);
  });

  it('prazen vnos da prazen seznam', () => {
    expect(splitPastedTitles('')).toEqual([]);
    expect(splitPastedTitles('\n\n')).toEqual([]);
  });
});

describe('makeTask', () => {
  const now = new Date('2026-06-15T10:00:00Z');

  it('sestavi celoten zapis in se ne zanaša na privzetke sheme', () => {
    const t = makeTask({ title: 'Mleko', position: 1000, dueDate: null, now });
    expect(t).toEqual({
      title: 'Mleko',
      done: false,
      doneAt: null,
      doneBy: null,
      dueDate: null,
      position: 1000,
      createdAt: now,
    });
  });

  it('rok se prenese, kadar je podan', () => {
    const due = new Date('2026-06-20T21:59:59.999Z');
    expect(makeTask({ title: 'Kruh', position: 2000, dueDate: due, now }).dueDate).toBe(due);
  });

  it('novo opravilo NIKOLI ni odkljukano', () => {
    const t = makeTask({ title: 'Kava', position: 3000, dueDate: null, now });
    expect(t.done).toBe(false);
    expect(t.doneAt).toBeNull();
    expect(t.doneBy).toBeNull();
  });
});

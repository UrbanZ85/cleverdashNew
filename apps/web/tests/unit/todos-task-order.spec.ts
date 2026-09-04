import { describe, expect, it } from 'vitest';
import { canMove, moveByOne } from '../../src/app/features/todos/domain/task-order.js';

// Puščici gor/dol sta pripomoček VMESNIKA: pogodba API-ja je nastali vrstni red, ne gib
// (research.md §10). Zato ta logika živi samo tu in se testira brez TestBed.

describe('moveByOne', () => {
  const ids = ['a', 'b', 'c'];

  it('premakne sredinsko opravilo navzgor', () => {
    expect(moveByOne(ids, 'b', 'up')).toEqual(['b', 'a', 'c']);
  });

  it('premakne sredinsko opravilo navzdol', () => {
    expect(moveByOne(ids, 'b', 'down')).toEqual(['a', 'c', 'b']);
  });

  it('premik prvega navzgor je no-op, ne napaka', () => {
    expect(moveByOne(ids, 'a', 'up')).toEqual(['a', 'b', 'c']);
  });

  it('premik zadnjega navzdol je no-op', () => {
    expect(moveByOne(ids, 'c', 'down')).toEqual(['a', 'b', 'c']);
  });

  it('neznan id pusti vrstni red nespremenjen', () => {
    expect(moveByOne(ids, 'ni-ga', 'up')).toEqual(['a', 'b', 'c']);
  });

  it('vhodnega polja NE spremeni — klicatelj se zanaša na novo polje', () => {
    const vhod = ['a', 'b', 'c'];
    moveByOne(vhod, 'b', 'up');
    expect(vhod).toEqual(['a', 'b', 'c']);
  });

  it('dva zaporedna nasprotna premika vrneta izhodiščni vrstni red', () => {
    const gor = moveByOne(ids, 'c', 'up');
    expect(moveByOne(gor, 'c', 'down')).toEqual(ids);
  });

  it('en sam element se ne da premakniti nikamor', () => {
    expect(moveByOne(['a'], 'a', 'up')).toEqual(['a']);
    expect(moveByOne(['a'], 'a', 'down')).toEqual(['a']);
  });
});

describe('canMove — za onemogočenje gumba na robu', () => {
  const ids = ['a', 'b', 'c'];

  it('prvi ne more navzgor, zadnji ne navzdol', () => {
    expect(canMove(ids, 'a', 'up')).toBe(false);
    expect(canMove(ids, 'c', 'down')).toBe(false);
  });

  it('sredinski lahko v obe smeri', () => {
    expect(canMove(ids, 'b', 'up')).toBe(true);
    expect(canMove(ids, 'b', 'down')).toBe(true);
  });

  it('neznan id ne more nikamor', () => {
    expect(canMove(ids, 'ni-ga', 'up')).toBe(false);
  });

  it('se ujema z moveByOne: kadar canMove pravi ne, moveByOne ničesar ne spremeni', () => {
    for (const id of [...ids, 'ni-ga']) {
      for (const smer of ['up', 'down'] as const) {
        if (!canMove(ids, id, smer)) {
          expect(moveByOne(ids, id, smer)).toEqual(ids);
        }
      }
    }
  });
});

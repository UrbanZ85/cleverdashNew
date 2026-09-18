import { describe, expect, it } from 'vitest';
import { CHIP_LIMIT, chipWindow } from '../../src/app/features/recipes/chip-window.js';

const TAGS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];
const base = { keyOf: (t: string) => t, active: null, expanded: false, narrow: true };

describe('okno čipov v vrstici filtrov', () => {
  it('na ozkem zaslonu pokaže prvih pet in prešteje skrite', () => {
    const { shown, hidden } = chipWindow(TAGS, base);
    expect(shown).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(hidden).toBe(4);
    expect(CHIP_LIMIT).toBe(5);
  });

  it('na širokem zaslonu ne skrije ničesar', () => {
    // Skrivanje na širokem zaslonu bi reševalo težavo, ki je tam ni.
    const { shown, hidden } = chipWindow(TAGS, { ...base, narrow: false });
    expect(shown).toEqual(TAGS);
    expect(hidden).toBe(0);
  });

  it('razprta vrstica pokaže vse', () => {
    const { shown, hidden } = chipWindow(TAGS, { ...base, expanded: true });
    expect(shown).toEqual(TAGS);
    expect(hidden).toBe(0);
  });

  it('kratkega seznama ne skrajša in števca ne izriše', () => {
    const { shown, hidden } = chipWindow(['a', 'b'], base);
    expect(shown).toEqual(['a', 'b']);
    expect(hidden).toBe(0);
  });

  it('seznam točno na meji ostane cel', () => {
    const five = TAGS.slice(0, CHIP_LIMIT);
    expect(chipWindow(five, base)).toEqual({ shown: five, hidden: 0 });
  });

  it('IZBRANI čip je viden, tudi kadar je zunaj prvih petih', () => {
    // Sicer bi se filter po deveti oznaki skril: uporabnik bi gledal skrajšan seznam receptov
    // brez vidnega razloga in filtra ne bi imel kje izklopiti.
    const { shown, hidden } = chipWindow(TAGS, { ...base, active: 'i' });
    expect(shown).toEqual(['a', 'b', 'c', 'd', 'e', 'i']);
    // 'i' se ne šteje več med skrite.
    expect(hidden).toBe(3);
  });

  it('izbrani čip med prvimi petimi se ne podvoji', () => {
    const { shown, hidden } = chipWindow(TAGS, { ...base, active: 'b' });
    expect(shown).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(hidden).toBe(4);
  });

  it('izbranega, ki ga v seznamu ni, ne vrine', () => {
    // Oznaka je lahko izginila (zadnji recept z njo je bil izbrisan), filter pa je še nastavljen.
    const { shown, hidden } = chipWindow(TAGS, { ...base, active: 'ni-je' });
    expect(shown).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(hidden).toBe(4);
  });

  it('prazen seznam ne pade', () => {
    expect(chipWindow([], base)).toEqual({ shown: [], hidden: 0 });
  });

  it('dela tudi z objekti, ne le z nizi', () => {
    const cats = TAGS.map((name) => ({ id: name, name }));
    const { shown } = chipWindow(cats, { ...base, keyOf: (c) => c.name, active: 'h' });
    expect(shown.map((c) => c.name)).toEqual(['a', 'b', 'c', 'd', 'e', 'h']);
  });
});

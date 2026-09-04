import { describe, expect, it } from 'vitest';
import { sortCamerasByTimeOfDay, type TimeOfDayCamera } from '../../src/domain/camera-ordering.js';

// quickstart.md §4, primeri 1-3.

interface Camera extends TimeOfDayCamera {
  name: string;
}

const morning: Camera = { name: 'dopoldan', timeOfDay: 'morning' };
const afternoon: Camera = { name: 'popoldan', timeOfDay: 'afternoon' };
const always: Camera = { name: 'vedno', timeOfDay: 'always' };

describe('sortCamerasByTimeOfDay — FR-004, FR-014, Story 6', () => {
  it('pred poldnem: dopoldanska kamera pride pred popoldansko', () => {
    const result = sortCamerasByTimeOfDay([afternoon, morning], 9);
    expect(result.map((c) => c.name)).toEqual(['dopoldan', 'popoldan']);
  });

  it('po poldnem: vrstni red se obrne v prid popoldanske', () => {
    const result = sortCamerasByTimeOfDay([afternoon, morning], 15);
    expect(result.map((c) => c.name)).toEqual(['popoldan', 'dopoldan']);
  });

  it('"always" ostane na svojem indeksu, ne glede na uro dneva', () => {
    const input = [afternoon, always, morning];
    const beforeNoon = sortCamerasByTimeOfDay(input, 9);
    expect(beforeNoon.map((c) => c.name)).toEqual(['dopoldan', 'vedno', 'popoldan']);

    const afterNoon = sortCamerasByTimeOfDay(input, 15);
    expect(afterNoon.map((c) => c.name)).toEqual(['popoldan', 'vedno', 'dopoldan']);
  });

  it('12:00 šteje kot popoldan (meja je "< 12", ne "<= 12")', () => {
    const result = sortCamerasByTimeOfDay([afternoon, morning], 12);
    expect(result.map((c) => c.name)).toEqual(['popoldan', 'dopoldan']);
  });

  it('več "always" kamer ostane vsaka na svojem indeksu', () => {
    const a2: Camera = { name: 'vedno2', timeOfDay: 'always' };
    const input = [always, afternoon, a2, morning];
    const result = sortCamerasByTimeOfDay(input, 9);
    expect(result.map((c) => c.name)).toEqual(['vedno', 'dopoldan', 'vedno2', 'popoldan']);
  });

  it('prazen seznam vrne prazen seznam', () => {
    expect(sortCamerasByTimeOfDay([], 9)).toEqual([]);
  });
});

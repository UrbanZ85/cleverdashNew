import { describe, expect, it } from 'vitest';
import { toOrderAssignments } from '../../src/domain/camera-order.js';

// quickstart.md §4, primer 9.

describe('toOrderAssignments — FR-035', () => {
  it('preslika seznam ID-jev v order: 0..n-1, v danem vrstnem redu', () => {
    const result = toOrderAssignments(['c3', 'c1', 'c2']);
    expect(result).toEqual([
      { id: 'c3', order: 0 },
      { id: 'c1', order: 1 },
      { id: 'c2', order: 2 },
    ]);
  });

  it('kamere zunaj seznama se sploh ne pojavijo v izhodu (router jih zato ne posodobi)', () => {
    const result = toOrderAssignments(['a', 'b']);
    expect(result.map((r) => r.id)).not.toContain('c');
    expect(result).toHaveLength(2);
  });

  it('prazen seznam vrne prazen izhod', () => {
    expect(toOrderAssignments([])).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { toOrderAssignments } from '../../src/domain/camera-order.js';

// 008, quickstart.md §4 — tretji nadomestek za poimenske primere iz kakovostnih vrat
// (research.md §13): preslikava vrstnega reda.
//
// Funkcija je ISTA kot pri kamerah (003) in se namenoma ne podvaja pod novim imenom: je
// splošna, `domain/` pa sme uporabiti vsak modul — člen I prepoveduje uvoze med MODULI, ne iz
// domenske plasti (research.md §7). Ime datoteke je zgodovinsko; preimenovanje bi se dotaknilo
// 003 in sodi v ločen čistilni PR.
//
// Ta test obstaja poleg `tests/unit/camera-order.spec.ts` zato, ker preverja LASTNOST, na
// katero se zanaša 008: da se ID, ki ga v seznamu ni, v izhodu ne pojavi. Prav to je razlog,
// da prerazporeditev ene mape ne premeša drugih (FR-032).

describe('toOrderAssignments za shranjene linke', () => {
  it('preslika seznam ID-jev v pare {id, order} po položaju', () => {
    expect(toOrderAssignments(['c', 'a', 'b'])).toEqual([
      { id: 'c', order: 0 },
      { id: 'a', order: 1 },
      { id: 'b', order: 2 },
    ]);
  });

  it('ID, ki ga v seznamu ni, se v izhodu NE pojavi — zapisi druge mape ostanejo nedotaknjeni', () => {
    const assignments = toOrderAssignments(['v-mapi-1', 'v-mapi-2']);
    expect(assignments.map((a) => a.id)).not.toContain('v-drugi-mapi');
    // Router posodobi samo vrnjene ID-je (glej PUT /saved-links/order), zato je to zadostno
    // jamstvo, da prerazporeditev ene mape ne seže v drugo.
    expect(assignments).toHaveLength(2);
  });

  it('prazen seznam da prazen izhod — prerazporeditev brez zapisov ni napaka', () => {
    expect(toOrderAssignments([])).toEqual([]);
  });

  it('vrstni red v izhodu sledi vhodu, ne abecedi ali prejšnjemu `order`', () => {
    expect(toOrderAssignments(['z', 'y', 'x']).map((a) => a.order)).toEqual([0, 1, 2]);
  });
});

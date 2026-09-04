import { describe, expect, it } from 'vitest';
import {
  asText,
  emptyPlaceForm,
  parseCoordinate,
  toPlaceForm,
  toPlacePatch,
} from '../../src/app/features/settings/commute-form.js';

// Ta testna datoteka je nastala iz prave napake: obrazec za kraja je predpostavil, da so vse
// vrednosti iz `ngModel` NIZI, `ion-input` z `type="number"` pa vrne ŠTEVILO. `latitude.trim()`
// je vrgel TypeError znotraj `try` bloka, `catch` ga je požrl v sporočilo "Krajev ni bilo
// mogoče shraniti" — zahteva na API ni šla nikoli ven in v konzoli ni bilo ničesar.
//
// Zato so tu števila in nizi premešani v vsakem primeru: prav mešanica je bila vzrok.

describe('asText', () => {
  it.each([
    ['  Doma  ', 'Doma'],
    ['', ''],
    [46.062956, '46.062956'],
    [0, '0'],
    [null, ''],
    [undefined, ''],
  ])('%s → "%s"', (value, expected) => {
    expect(asText(value)).toBe(expected);
  });
});

describe('parseCoordinate', () => {
  it('sprejme število, kot ga vrne ion-input type="number"', () => {
    expect(parseCoordinate(45.961104)).toBe(45.961104);
    expect(parseCoordinate(0)).toBe(0);
  });

  it('sprejme niz, kot ga vrne prilepljena vrednost', () => {
    expect(parseCoordinate('45.961104')).toBe(45.961104);
    expect(parseCoordinate('  14.297847  ')).toBe(14.297847);
  });

  it('sprejme decimalno vejico — slovenska tipkovnica jo ponudi prvo', () => {
    // `Number('45,96')` je NaN; brez te pretvorbe bi kraj tiho ostal brez koordinat.
    expect(parseCoordinate('45,961104')).toBe(45.961104);
  });

  it.each([
    ['', 'prazno'],
    [null, 'null'],
    [undefined, 'nedoločeno'],
    ['   ', 'presledki'],
    ['ne-število', 'besedilo'],
  ])('%s (%s) → null', (value, _opis) => {
    expect(parseCoordinate(value)).toBeNull();
  });

  it('NaN in Infinity ne postaneta koordinata', () => {
    expect(parseCoordinate(Number.NaN)).toBeNull();
    expect(parseCoordinate(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe('toPlacePatch', () => {
  it('pretvori obrazec s ŠTEVILI (ion-input type="number") brez napake', () => {
    // Natanko primer, ki je prej vrgel TypeError.
    const patch = toPlacePatch({
      label: 'Služba',
      address: 'Leskoškova cesta 9e, 1000 Ljubljana',
      latitude: 46.062956,
      longitude: 14.560259,
    });
    expect(patch).toEqual({
      label: 'Služba',
      address: 'Leskoškova cesta 9e, 1000 Ljubljana',
      latitude: 46.062956,
      longitude: 14.560259,
    });
  });

  it('pretvori obrazec z NIZI enako', () => {
    const patch = toPlacePatch({
      label: '  Doma  ',
      address: '  Usnjarska cesta 1, Vrhnika  ',
      latitude: '45.961104',
      longitude: '14.297847',
    });
    expect(patch).toEqual({
      label: 'Doma',
      address: 'Usnjarska cesta 1, Vrhnika',
      latitude: 45.961104,
      longitude: 14.297847,
    });
  });

  it('prazna polja pomenijo "ni nastavljeno"', () => {
    expect(toPlacePatch(emptyPlaceForm())).toEqual({
      label: '',
      address: null,
      latitude: null,
      longitude: null,
    });
  });

  it('polovica para koordinat se ne pošlje — strežnik bi jo zavrnil s 400', () => {
    const patch = toPlacePatch({ label: 'Doma', address: 'Vrhnika', latitude: 45.96, longitude: '' });
    expect(patch.latitude).toBeNull();
    expect(patch.longitude).toBeNull();
    // Naslov ostane: kraj je še naprej uporaben, samo brez koordinat.
    expect(patch.address).toBe('Vrhnika');
  });

  it('naslov brez koordinat je veljaven kraj', () => {
    const patch = toPlacePatch({ label: 'Služba', address: 'Leskoškova 9e', latitude: '', longitude: '' });
    expect(patch.address).toBe('Leskoškova 9e');
    expect(patch.latitude).toBeNull();
  });
});

describe('toPlaceForm', () => {
  it('shranjen kraj napolni obrazec', () => {
    expect(toPlaceForm({ label: 'Doma', address: 'Vrhnika', latitude: 45.961104, longitude: 14.297847 })).toEqual({
      label: 'Doma',
      address: 'Vrhnika',
      latitude: 45.961104,
      longitude: 14.297847,
    });
  });

  it('nenastavljena polja so prazna, ne beseda "null"', () => {
    expect(toPlaceForm({ label: 'Služba', address: null, latitude: null, longitude: null })).toEqual({
      label: 'Služba',
      address: '',
      latitude: '',
      longitude: '',
    });
  });

  it('branje in pisanje sta obratna operacija (brez izgube vrednosti)', () => {
    const stored = { label: 'Doma', address: 'Vrhnika', latitude: 45.961104, longitude: 14.297847 };
    expect(toPlacePatch(toPlaceForm(stored))).toEqual(stored);
  });
});

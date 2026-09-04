import { describe, expect, it } from 'vitest';
import {
  MAX_PATH_DEPTH,
  extractPluginFields,
  isValidJsonPath,
  parseJsonPath,
  readJsonPath,
} from '../../src/domain/json-path.js';

const DOC = {
  observation: { t: 20.5, rh: 85, sky: 'pretežno oblačno', wind: null },
  list: [{ main: { temp: 12 } }, { main: { temp: 14 } }],
  flags: { active: true },
  nested: { empty: {} },
};

describe('parseJsonPath', () => {
  it('razdeli po pikah in odstrani presledke', () => {
    expect(parseJsonPath(' observation . t ')).toEqual(['observation', 't']);
  });

  it('prazni koraki (dvojne pike, pika na koncu) se izpustijo', () => {
    expect(parseJsonPath('a..b.')).toEqual(['a', 'b']);
  });
});

describe('isValidJsonPath', () => {
  it('prazna pot ni veljavna', () => {
    expect(isValidJsonPath('')).toBe(false);
    expect(isValidJsonPath('   ')).toBe(false);
  });

  it('zavrne pot, globljo od meje', () => {
    expect(isValidJsonPath(Array(MAX_PATH_DEPTH).fill('a').join('.'))).toBe(true);
    expect(isValidJsonPath(Array(MAX_PATH_DEPTH + 1).fill('a').join('.'))).toBe(false);
  });

  it('zavrne korake, ki segajo v prototip', () => {
    expect(isValidJsonPath('__proto__.polluted')).toBe(false);
    expect(isValidJsonPath('a.constructor')).toBe(false);
    expect(isValidJsonPath('a.prototype.b')).toBe(false);
  });
});

describe('readJsonPath', () => {
  it('prebere vgnezdeno število, niz in logično vrednost', () => {
    expect(readJsonPath(DOC, 'observation.t')).toBe(20.5);
    expect(readJsonPath(DOC, 'observation.sky')).toBe('pretežno oblačno');
    expect(readJsonPath(DOC, 'flags.active')).toBe(true);
  });

  it('indeksira sezname s številom', () => {
    expect(readJsonPath(DOC, 'list.0.main.temp')).toBe(12);
    expect(readJsonPath(DOC, 'list.1.main.temp')).toBe(14);
  });

  it('indeks izven seznama da undefined, ne napake', () => {
    expect(readJsonPath(DOC, 'list.9.main.temp')).toBeUndefined();
    expect(readJsonPath(DOC, 'list.-1.main.temp')).toBeUndefined();
    expect(readJsonPath(DOC, 'list.prvi')).toBeUndefined();
  });

  it('loči "polja ni" (undefined) od "polje je prazno" (null)', () => {
    // Ta razlika je nosilna: ploščica ob null izpiše pomišljaj, ob undefined pa pove, da
    // pot ne obstaja — uporabnik mora vedeti, da je pot narobe vpisana.
    expect(readJsonPath(DOC, 'observation.wind')).toBeNull();
    expect(readJsonPath(DOC, 'observation.ni_takega_polja')).toBeUndefined();
  });

  it('objekt ali seznam ni vrednost za prikaz', () => {
    expect(readJsonPath(DOC, 'observation')).toBeUndefined();
    expect(readJsonPath(DOC, 'list')).toBeUndefined();
    expect(readJsonPath(DOC, 'nested.empty')).toBeUndefined();
  });

  it('ne izpostavi podedovanih lastnosti', () => {
    expect(readJsonPath(DOC, 'observation.toString')).toBeUndefined();
    expect(readJsonPath(DOC, 'observation.hasOwnProperty')).toBeUndefined();
  });

  it('neveljavna pot ali neobjekt vrne undefined, ne vrže', () => {
    expect(readJsonPath(DOC, '')).toBeUndefined();
    expect(readJsonPath(null, 'a.b')).toBeUndefined();
    expect(readJsonPath('niz', 'a')).toBeUndefined();
    expect(readJsonPath(DOC, '__proto__.x')).toBeUndefined();
  });
});

describe('extractPluginFields', () => {
  it('oblikuje vrednosti z enoto in brez nje', () => {
    expect(
      extractPluginFields(DOC, [
        { label: 'Temperatura', path: 'observation.t', unit: '°C' },
        { label: 'Nebo', path: 'observation.sky' },
      ]),
    ).toEqual([
      { label: 'Temperatura', value: '20.5 °C' },
      { label: 'Nebo', value: 'pretežno oblačno' },
    ]);
  });

  it('manjkajoče polje da null, prazno pa pomišljaj — ploščica ju izriše različno', () => {
    expect(
      extractPluginFields(DOC, [
        { label: 'Ni ga', path: 'a.b.c' },
        { label: 'Veter', path: 'observation.wind', unit: 'm/s' },
      ]),
    ).toEqual([
      { label: 'Ni ga', value: null },
      { label: 'Veter', value: '—' },
    ]);
  });

  it('prazen seznam polj vrne prazen rezultat', () => {
    expect(extractPluginFields(DOC, [])).toEqual([]);
  });
});

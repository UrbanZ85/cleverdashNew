import { describe, expect, it } from 'vitest';
import { extractSetNumbers, normalizeName, normalizeSetNumber } from '../../../src/modules/lego-scanner/domain/set-number.js';

// 018, FR-011: številka seta se normalizira v obliko kataloga; letnice, cene, datumi in količine niso set.

describe('normalizeSetNumber', () => {
  it.each([
    ['75192', '75192-1'],
    ['75192-1', '75192-1'],
    ['LEGO 75192', '75192-1'],
    ['  lego75192-2 ', '75192-2'],
    ['10179', '10179-1'],
    ['4504', '4504-1'],
    ['910001', '910001-1'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeSetNumber(input)).toBe(expected);
  });

  it.each(['', 'abc', '123', '1234567', '75192-', '75192 und 10179', '75.192'])('"%s" ni številka seta', (input) => {
    expect(normalizeSetNumber(input)).toBeNull();
  });
});

describe('extractSetNumbers', () => {
  it.each([
    ['LEGO Star Wars 75192 Millennium Falcon NEU OVP', ['75192-1']],
    ['LEGO 75192-1 Falcon', ['75192-1']],
    ['Lego Technic 42115 Lamborghini komplett', ['42115-1']],
    ['LEGO 10179 und 75192 zusammen', ['10179-1', '75192-1']],
    ['LEGO 75192 / 75192 doppelt', ['75192-1']],
    ['LEGO Falcon 7541 Teile Set 75192', ['75192-1']],
    ['LEGO Falcon 7541 pieces 75192', ['75192-1']],
  ])('%s', (text, expected) => {
    expect(extractSetNumbers(text)).toEqual(expected);
  });

  it.each([
    ['LEGO Falcon neu 2019'],
    ['LEGO Falcon seit 2017 im Regal'],
    ['LEGO Falcon 1299 €'],
    ['LEGO Falcon 1299 EUR VB'],
    ['LEGO Falcon 1.299,00'],
    ['LEGO Falcon vom 21.10.2026'],
    ['LEGO Falcon 7541 Teile'],
    ['LEGO Falcon EAN 5702016076345'],
    ['LEGO Falcon 12345678'],
    ['LEGO Falcon 500g'],
    ['LEGO Falcon 123'],
  ])('brez številke seta: %s', (text) => {
    expect(extractSetNumbers(text)).toEqual([]);
  });

  it('letnica z izrecnim kontekstom "Set"/"Nr." je lahko set (npr. stari set 1989)', () => {
    expect(extractSetNumbers('LEGO Set 1989 Ritterburg')).toEqual(['1989-1']);
    expect(extractSetNumbers('LEGO Nr. 2000 Technic')).toEqual(['2000-1']);
  });

  it('različica z -2 se ohrani', () => {
    expect(extractSetNumbers('LEGO 75192-2')).toEqual(['75192-2']);
  });
});

describe('normalizeName', () => {
  it('odstrani šumnike, ločila in šumne besede', () => {
    expect(normalizeName('LEGO Lamborghini Sián FKP-37 NEU OVP!')).toBe('lamborghini sian fkp 37');
    expect(normalizeName('Millennium Falcon (Neu & OVP)')).toBe('millennium falcon');
  });
});

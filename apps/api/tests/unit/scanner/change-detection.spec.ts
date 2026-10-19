import { describe, expect, it } from 'vitest';
import { comparableHash, detectChange } from '../../../src/platform/scanner/domain/change-detection.js';
import { identityKeyOf } from '../../../src/platform/scanner/domain/identity.js';

// FR-023, FR-024: identiteta in zaznava sprememb sta čisti funkciji (člen IX).

const EUR = (amount: number) => ({ amount, currency: 'EUR' });

describe('identityKeyOf', () => {
  it('isti niz → isti ključ, 32 hex; drug niz → drug ključ', () => {
    expect(identityKeyOf('a|b|c')).toBe(identityKeyOf('a|b|c'));
    expect(identityKeyOf('a|b|c')).toMatch(/^[0-9a-f]{32}$/);
    expect(identityKeyOf('a|b|c')).not.toBe(identityKeyOf('a|b|d'));
  });
});

describe('comparableHash', () => {
  it('je neodvisen od vrstnega reda ključev in gnezdenja', () => {
    expect(comparableHash({ a: 1, b: { c: [1, 2], d: 'x' } })).toBe(comparableHash({ b: { d: 'x', c: [1, 2] }, a: 1 }));
  });
  it('vrstni red v seznamu ŠTEJE; brez vrednosti je null', () => {
    expect(comparableHash([1, 2])).not.toBe(comparableHash([2, 1]));
    expect(comparableHash(null)).toBeNull();
    expect(comparableHash(undefined)).toBeNull();
  });
});

describe('detectChange', () => {
  it('brez obstoječega zapisa je NEW, tudi s ceno', () => {
    expect(detectChange({ exists: false, existingPrice: null, existingHash: null, incomingPrice: EUR(10), incomingHash: null })).toBe('NEW');
  });
  it('cena 120 → 89 je PRICE_DOWN, 89 → 110 PRICE_UP, enaka UNCHANGED', () => {
    const base = { exists: true, existingHash: null, incomingHash: null };
    expect(detectChange({ ...base, existingPrice: EUR(120), incomingPrice: EUR(89) })).toBe('PRICE_DOWN');
    expect(detectChange({ ...base, existingPrice: EUR(89), incomingPrice: EUR(110) })).toBe('PRICE_UP');
    expect(detectChange({ ...base, existingPrice: EUR(89), incomingPrice: EUR(89) })).toBe('UNCHANGED');
  });
  it('pri ceni ima cena prednost: enaka cena z drugim hashem je še vedno UNCHANGED', () => {
    expect(detectChange({ exists: true, existingPrice: EUR(5), existingHash: 'a', incomingPrice: EUR(5), incomingHash: 'b' })).toBe('UNCHANGED');
  });
  it('druga valuta ni primerljiva → odloča hash; brez hasha UNCHANGED', () => {
    expect(detectChange({ exists: true, existingPrice: EUR(5), existingHash: 'a', incomingPrice: { amount: 5, currency: 'GBP' }, incomingHash: 'b' })).toBe('CHANGED');
    expect(detectChange({ exists: true, existingPrice: EUR(5), existingHash: null, incomingPrice: { amount: 5, currency: 'GBP' }, incomingHash: null })).toBe('UNCHANGED');
  });
  it('brez cene: drug hash CHANGED, isti hash UNCHANGED, brez hasha UNCHANGED', () => {
    const base = { exists: true, existingPrice: null, incomingPrice: null };
    expect(detectChange({ ...base, existingHash: 'a', incomingHash: 'b' })).toBe('CHANGED');
    expect(detectChange({ ...base, existingHash: 'a', incomingHash: 'a' })).toBe('UNCHANGED');
    expect(detectChange({ ...base, existingHash: null, incomingHash: null })).toBe('UNCHANGED');
  });
  it('rezultat, ki je prej imel ceno in je zdaj brez nje, odloča hash', () => {
    expect(detectChange({ exists: true, existingPrice: EUR(5), existingHash: 'a', incomingPrice: null, incomingHash: 'b' })).toBe('CHANGED');
  });
});

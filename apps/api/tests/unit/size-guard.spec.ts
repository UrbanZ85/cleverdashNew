import { describe, expect, it } from 'vitest';
import { checkDeclared, createSizeGuard } from '../../src/modules/file-sharing/domain/size-guard.js';

// 009, research.md §21: nadomešča primere iz kakovostnih vrat, ki v tem modulu nimajo predmeta.

const MAX = 500 * 1024 * 1024;

describe('checkDeclared', () => {
  it('točno meja je še dovoljena, meja + 1 ni', () => {
    expect(checkDeclared(MAX, MAX)).toBe('ok');
    expect(checkDeclared(MAX + 1, MAX)).toBe('too-large');
  });

  it('odsoten Content-Length je ZAVRNJEN, ne obravnavan kot neznano', () => {
    // Brez napovedi ni mogoče preveriti kvote pred prenosom, prejemnik pa ne bi videl napredka.
    expect(checkDeclared(undefined, MAX)).toBe('missing');
    expect(checkDeclared(null, MAX)).toBe('missing');
    expect(checkDeclared('', MAX)).toBe('missing');
  });

  it('prazna datoteka je svoj izid, ne "premajhna" (FR-008)', () => {
    expect(checkDeclared(0, MAX)).toBe('empty');
    expect(checkDeclared('0', MAX)).toBe('empty');
  });

  it('nešteviln ali negativen Content-Length je neveljaven, ne NaN', () => {
    expect(checkDeclared('ni-stevilka', MAX)).toBe('invalid');
    expect(checkDeclared('-5', MAX)).toBe('invalid');
    expect(checkDeclared('12.5', MAX)).toBe('invalid');
  });

  it('niz iz glave se prebere enako kot število', () => {
    expect(checkDeclared('1024', MAX)).toBe('ok');
  });
});

describe('createSizeGuard', () => {
  it('spusti tok do natanko meje', () => {
    const guard = createSizeGuard(10);
    expect(guard.push(6)).toBe(true);
    expect(guard.push(4)).toBe(true);
    expect(guard.exceeded()).toBe(false);
    expect(guard.total()).toBe(10);
  });

  it('ustavi na kosu, ki mejo prestopi — ne šele na koncu', () => {
    // Napoved je odjemalčeva OBLJUBA: kdor napove 1 KB in pošlje 900 MB, mora biti ustavljen
    // med prenosom (FR-003), sicer je vsega že na disku.
    const guard = createSizeGuard(10);
    expect(guard.push(9)).toBe(true);
    expect(guard.push(2)).toBe(false);
    expect(guard.exceeded()).toBe(true);
    expect(guard.total()).toBe(11);
  });

  it('en bajt čez mejo je dovolj', () => {
    const guard = createSizeGuard(1024);
    expect(guard.push(1025)).toBe(false);
  });

  it('ko je meja enkrat presežena, ostane presežena', () => {
    const guard = createSizeGuard(10);
    guard.push(11);
    expect(guard.push(0)).toBe(false);
    expect(guard.exceeded()).toBe(true);
  });
});

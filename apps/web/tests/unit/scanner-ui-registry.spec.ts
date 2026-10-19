import { afterEach, describe, expect, it } from 'vitest';
import { findScannerUi, listScannerUi, registerScannerUi, resetScannerUiForTests } from '../../src/app/core/scanners/scanner-ui.registry.js';

// 016 (FR-043): register prispevkov tipov na odjemalcu je zrcalo zaledja — brez uvoza iz features/.

afterEach(() => resetScannerUiForTests());

describe('scanner-ui.registry', () => {
  it('registracija, iskanje, neznan tip', () => {
    registerScannerUi({ type: 'echo', createRoute: undefined });
    expect(findScannerUi('echo')?.type).toBe('echo');
    expect(findScannerUi('nope')).toBeNull();
  });

  it('ponovna registracija zamenja vnos; seznam je po abecedi', () => {
    registerScannerUi({ type: 'zeta' });
    registerScannerUi({ type: 'alfa', createRoute: '/x' });
    registerScannerUi({ type: 'alfa', createRoute: '/y' });
    expect(listScannerUi().map((p) => p.type)).toEqual(['alfa', 'zeta']);
    expect(findScannerUi('alfa')?.createRoute).toBe('/y');
  });

  it('komponente so lazy tovarne, ki se ne kličejo ob registraciji', () => {
    let called = 0;
    registerScannerUi({
      type: 'lazy',
      configComponent: async () => {
        called += 1;
        return class {};
      },
    });
    expect(called).toBe(0);
  });
});

import { afterEach, describe, expect, it } from 'vitest';
import { findScannerUi, resetScannerUiForTests } from '../../src/app/core/scanners/scanner-ui.registry.js';
import { registerCollectiblesScannerUi } from '../../src/app/features/collectibles-scanner/scanner-ui.js';

// 019 (FR-029, FR-031): tip `collectibles` se registrira z eno vrstico, komponente so lazy; brez registracije
// generične strani tip še vedno pokažejo (brez obrazca in z privzetim seznamom).

afterEach(() => resetScannerUiForTests());

describe('registerCollectiblesScannerUi', () => {
  it('registrira tip z lazy obrazcem in lazy prikazom rezultatov', () => {
    expect(findScannerUi('collectibles')).toBeNull();
    registerCollectiblesScannerUi();
    const ui = findScannerUi('collectibles')!;
    expect(ui.type).toBe('collectibles');
    expect(typeof ui.configComponent).toBe('function');
    expect(typeof ui.resultsComponent).toBe('function');
    expect(ui.createRoute).toBeUndefined();
  });

  it('ponovna registracija zamenja vnos, ne podvoji', () => {
    registerCollectiblesScannerUi();
    registerCollectiblesScannerUi();
    expect(findScannerUi('collectibles')?.type).toBe('collectibles');
  });
});

import type { Type } from '@angular/core';

// Register prispevkov TIPOV skenerjev k vmesniku (016, research.md §8). Zrcalo zaledja
// (`platform/scanner/registry.ts`): vsak modul v `apps/web/src/main.ts` z eno vrstico
// (`register<X>ScannerUi()`) pove, katere komponente prispeva. Generične strani
// (`features/scanners`) jih vstavijo z `NgComponentOutlet` in o nobenem tipu ne vedo po imenu.
//
// Register nosi SAMO komponente (lazy `import()`, da tip ne pride v začetni paket). Besedila —
// ime, ikona, opis, prednastavitve — pridejo s strežnika (`GET /scanners/types`), ne od tod.
// Tip brez vnosa tu je še vedno uporaben: generične strani imajo privzeti prikaz rezultatov,
// obrazca pa brez komponente ni — čarovnik to pove.

export interface ScannerUiPlugin {
  type: string;
  /** Obrazec nastavitev tipa (2. korak čarovnika); komponenta izpolni `ScannerConfigForm`. */
  configComponent?: () => Promise<Type<unknown>>;
  /** Lasten prikaz rezultatov; brez njega privzeti seznam. Komponenta izpolni `ScannerResultsView`. */
  resultsComponent?: () => Promise<Type<unknown>>;
  /** Dodatek v administraciji (npr. stanje virov); dobi vhod `extras` iz `GET /scanners/admin/types`. */
  adminExtrasComponent?: () => Promise<Type<unknown>>;
  /** Pot za ustvarjanje pri tipu, ki hrani definicije sam (strežnik jo vrne tudi v `createRoute`). */
  createRoute?: string;
}

const plugins = new Map<string, ScannerUiPlugin>();

/** Ponovna registracija istega tipa vnos ZAMENJA (testi registrirajo večkrat). */
export function registerScannerUi(plugin: ScannerUiPlugin): void {
  plugins.set(plugin.type, plugin);
}

export function findScannerUi(type: string): ScannerUiPlugin | null {
  return plugins.get(type) ?? null;
}

export function listScannerUi(): ScannerUiPlugin[] {
  return [...plugins.values()].sort((a, b) => a.type.localeCompare(b.type, 'en'));
}

/** Samo za teste. */
export function resetScannerUiForTests(): void {
  plugins.clear();
}

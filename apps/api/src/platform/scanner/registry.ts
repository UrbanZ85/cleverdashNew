import type { Env } from '../config/env.js';
import type { AnyScannerType, ScannerType } from './types.js';

// Register tipov skenerjev. SKUPNA zmogljivost (platform/), ne modul — isti vzorec kot
// `platform/ingest/registry.ts` in `platform/tabs/extension.ts`.
//
// ZAKAJ REGISTER IN NE SEZNAM. Tik mora izvajati lete, testni echo in vsak bodoči tip. Datoteka,
// ki bi te tipe uvozila sama, bi bila natanko tista, ki jo člen I prepoveduje: brisanje modula
// Leti bi pokvarilo jedro. Zato tu ni nobenega uvoza iz `modules/` in nobenega seznama — tip
// prispeva MODUL SAM z enim klicem `registerScannerType`, registriranim v `main.ts`. Odstranitev
// tipa je brisanje njegove mape in te vrstice; definicije tega tipa na seznamu dobijo oznako "tip
// ni na voljo" (FR-011), tik pa jih preskoči.
//
// `Map` in ne polje: ponovna registracija istega tipa mora vrednost ZAMENJATI — `createApp()` se
// v testih kliče večkrat v istem procesu.

const types = new Map<string, AnyScannerType>();

export function registerScannerType<TConfig, TVerified>(type: ScannerType<TConfig, TVerified>): void {
  types.set(type.type, type as unknown as AnyScannerType);
}

/** Vsi registrirani tipi, po abecedi oznake — da sta seznam tipov in administracija
 * DETERMINISTIČNA ne glede na vrstni red registracij v `main.ts`. */
export function listScannerTypes(): AnyScannerType[] {
  return [...types.values()].sort((a, b) => a.type.localeCompare(b.type, 'en'));
}

export function findScannerType(type: string): AnyScannerType | null {
  return types.get(type) ?? null;
}

/** Tipi, ki so v TEJ namestitvi vklopljeni (`isEnabled(env)`); samo te tik izvaja in čarovnik ponudi. */
export function enabledScannerTypes(env: Env): AnyScannerType[] {
  return listScannerTypes().filter((t) => t.isEnabled(env));
}

/** Samo za teste: register je proces-globalen in bi brez tega en test videl tipe drugega. */
export function resetScannerTypesForTests(): void {
  types.clear();
}

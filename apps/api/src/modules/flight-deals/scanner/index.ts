import { registerScannerType } from '../../../platform/scanner/registry.js';
import { flightScannerType } from './type.js';

/** Kliče `main.ts` ob zagonu — ENA vrstica, kot `registerRecipesIngest()` (člen I). Brisanje
 * modula Leti je brisanje te vrstice in mape; jedro skenerjev teče naprej brez tipa `flights`. */
export function registerFlightScannerType(): void {
  registerScannerType(flightScannerType);
}

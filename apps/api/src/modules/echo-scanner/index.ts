import { registerScannerType } from '../../platform/scanner/registry.js';
import { echoScannerType } from './scanner-type.js';

/** Kliče `main.ts` ob zagonu — ENA vrstica (člen I). Brisanje tega modula je brisanje te
 * vrstice in mape; obstoječi skenerji tipa `echo` dobijo na seznamu oznako "tip ni na voljo". */
export function registerEchoScannerType(): void {
  registerScannerType(echoScannerType);
}

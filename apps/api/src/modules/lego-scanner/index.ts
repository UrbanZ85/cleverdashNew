import { registerScannerType } from '../../platform/scanner/registry.js';
import { legoScannerType } from './scanner-type.js';

export { legoScannerRouter } from './router.js';

/** Kliče `main.ts` ob zagonu — ENA vrstica (člen I). Brisanje tega modula je brisanje te vrstice,
 * mape in vrstice za usmerjevalnik; obstoječi skenerji tipa `lego` dobijo oznako "tip ni na voljo". */
export function registerLegoScannerType(): void {
  registerScannerType(legoScannerType);
}

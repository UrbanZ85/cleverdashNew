import { registerScannerType } from '../../platform/scanner/registry.js';
import { collectiblesScannerType } from './scanner-type.js';

export { collectiblesScannerRouter } from './router.js';

/** Kliče `main.ts` ob zagonu — ENA vrstica (člen I). Brisanje tega modula je brisanje te vrstice,
 * mape in vrstice za usmerjevalnik; obstoječi skenerji tipa `collectibles` dobijo oznako "tip ni na voljo". */
export function registerCollectiblesScannerType(): void {
  registerScannerType(collectiblesScannerType);
}

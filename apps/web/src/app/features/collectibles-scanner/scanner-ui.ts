import { registerScannerUi } from '../../core/scanners/scanner-ui.registry.js';

// Prispevek tipa `collectibles` k vmesniku skenerjev (019): dinamičen obrazec za 2. korak čarovnika in
// lasten prikaz rezultatov (kartice s sliko, različico, vrednostjo z oznako vrste in oceno priložnosti).
// ENA vrstica v `apps/web/src/main.ts` — zrcalo `registerCollectiblesScannerType()` na zaledju. Brez te
// vrstice generične strani tip še vedno pokažejo, a brez obrazca in z privzetim seznamom.

export function registerCollectiblesScannerUi(): void {
  registerScannerUi({
    type: 'collectibles',
    configComponent: () => import('./collectibles-config.component.js').then((m) => m.CollectiblesConfigComponent),
    resultsComponent: () => import('./collectibles-results.component.js').then((m) => m.CollectiblesResultsComponent),
  });
}

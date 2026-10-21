import { registerScannerUi } from '../../core/scanners/scanner-ui.registry.js';

// Prispevek tipa `lego` k vmesniku skenerjev (018): obrazec za 2. korak čarovnika in lasten prikaz
// rezultatov (kartice s sliko, vrednostjo in dobičkom). ENA vrstica v `apps/web/src/main.ts` — zrcalo
// `registerLegoScannerType()` na zaledju. Brez te vrstice generične strani tip še vedno pokažejo, a brez
// obrazca in z privzetim seznamom.

export function registerLegoScannerUi(): void {
  registerScannerUi({
    type: 'lego',
    configComponent: () => import('./lego-config.component.js').then((m) => m.LegoConfigComponent),
    resultsComponent: () => import('./lego-results.component.js').then((m) => m.LegoResultsComponent),
  });
}

import { registerScannerUi } from '../../core/scanners/scanner-ui.registry.js';

// Prispevek modula Leti k generičnemu vmesniku skenerjev (016, research.md §8). ENA vrstica v
// `apps/web/src/main.ts` — zrcalo `registerFlightScannerType()` na zaledju. Leti hranijo
// definicije sami, zato čarovnik po izbiri tipa preusmeri na obstoječi urejevalnik iskanja; v
// administraciji prispevajo ploščo z viri.

export function registerFlightScannerUi(): void {
  registerScannerUi({
    type: 'flights',
    createRoute: '/flight-deals/searches/new',
    adminExtrasComponent: () => import('./providers-panel.component.js').then((m) => m.FlightProvidersPanelComponent),
  });
}

import type { InputSignal } from '@angular/core';
import type { Result } from './scanners.model.js';

// Pogodba med generičnim kontejnerjem rezultatov (features/scanners/scanner-results.page.ts) in
// lastnim prikazom TIPA (`resultsComponent` v registru). Kontejner naloži rezultate prek
// `GET /scanners/{id}/results` in jih poda komponenti; ta jih izriše po svoje (leti, avti, slike
// niso ista tabela — FR-042). Brez prispevka tipa se uporabi privzeti seznam.

export interface ScannerResultsView {
  scannerId: InputSignal<string>;
  results: InputSignal<Result[]>;
}

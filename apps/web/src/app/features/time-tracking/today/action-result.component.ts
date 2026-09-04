import { Component, input } from '@angular/core';

// US1: prikaz izida ročne akcije. `verified` je edino polje, ki šteje kot resnični uspeh —
// klik brez potrditve NI uspeh (člen VI, docs/legacy-engine.md §4.5).
export interface ActionResultView {
  outcome: string;
  actionName: string;
  verified: boolean;
  stateAfter?: string;
  failureReason?: string;
}

@Component({
  selector: 'app-action-result',
  standalone: true,
  template: `
    <div class="action-result" [class.ok]="result().verified || result().outcome === 'already_done'" [class.fail]="!result().verified && result().outcome !== 'already_done'">
      @if (result().outcome === 'already_done') {
        <p>"{{ result().actionName }}" je bilo že opravljeno — ni bilo treba ničesar storiti.</p>
      } @else if (result().verified) {
        <p>"{{ result().actionName }}" uspešno izvedeno in potrjeno. Novo stanje: {{ result().stateAfter }}.</p>
      } @else {
        <p>"{{ result().actionName }}" ni bilo potrjeno. {{ result().failureReason ?? 'Poskusi znova čez trenutek.' }}</p>
      }
    </div>
  `,
  styles: `
    .action-result { padding: 0.75rem; border-radius: 8px; margin: 0.5rem 0; }
    .action-result.ok { background: var(--ion-color-success-tint, #d4f5dd); }
    .action-result.fail { background: var(--ion-color-danger-tint, #fbdada); }
  `,
})
export class ActionResultComponent {
  readonly result = input.required<ActionResultView>();
}

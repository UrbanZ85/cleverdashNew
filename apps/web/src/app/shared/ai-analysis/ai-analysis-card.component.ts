import { Component, computed, input } from '@angular/core';
import { IonBadge, IonNote } from '@ionic/angular/standalone';
import { aiAnalysisMeta, confidenceLabel, riskColor, riskLabel, type AiAnalysis } from '../../core/scanners/scanners.model.js';

// Prikaz analize z umetno inteligenco (017, FR-017) — skupen generičnim rezultatom (features/scanners)
// in ponudbam letov (features/flight-deals); moduli se ne uvažajo med sabo, oba smeta uvažati `shared/`.
// Pokaže se SAMO, kadar analiza obstaja (klicatelj preveri); vedno nosi oznako modela in časa ter
// opozorilo, da gre za oceno — cene in izračuni so iz podatkov vira, ne iz modela (FR-009).

@Component({
  selector: 'app-ai-analysis-card',
  standalone: true,
  imports: [IonBadge, IonNote],
  template: `
    <div class="ai" [class.compact]="compact()">
      <div class="head">
        <ion-badge [color]="riskColor(analysis().riskLevel)">tveganje: {{ riskLabel(analysis().riskLevel) }}</ion-badge>
        <ion-badge color="light">zaupanje: {{ confidenceLabel(analysis().confidence) }}</ion-badge>
      </div>
      <p class="summary">{{ analysis().summary }}</p>
      @if (analysis().explanation) {
        <p class="explanation">{{ analysis().explanation }}</p>
      }
      <div class="lists">
        @if (analysis().risks.length > 0) {
          <div>
            <h5>Tveganja</h5>
            <ul>
              @for (r of analysis().risks; track $index) {
                <li>{{ r }}</li>
              }
            </ul>
          </div>
        }
        @if (analysis().defects.length > 0) {
          <div>
            <h5>Pomanjkljivosti</h5>
            <ul>
              @for (d of analysis().defects; track $index) {
                <li>{{ d }}</li>
              }
            </ul>
          </div>
        }
        @if (analysis().opportunities.length > 0) {
          <div>
            <h5>Priložnosti</h5>
            <ul>
              @for (o of analysis().opportunities; track $index) {
                <li>{{ o }}</li>
              }
            </ul>
          </div>
        }
      </div>
      @if (!compact() && attributes().length > 0) {
        <dl class="attributes">
          @for (a of attributes(); track a.key) {
            <dt>{{ a.key }}</dt>
            <dd>{{ a.value }}</dd>
          }
        </dl>
      }
      <ion-note class="meta">{{ meta() }}</ion-note>
    </div>
  `,
  styles: [
    `
      .ai {
        border: 1px solid var(--cd-divider);
        border-left: 3px solid var(--ion-color-primary);
        border-radius: var(--cd-radius-md);
        padding: var(--cd-space-2) var(--cd-space-3);
        background: var(--cd-surface-raised);
        font-size: var(--cd-font-size-sm);
      }
      .head {
        display: flex;
        flex-wrap: wrap;
        gap: var(--cd-space-1);
        margin-bottom: var(--cd-space-1);
      }
      .summary {
        margin: 0 0 var(--cd-space-1);
        font-weight: 600;
      }
      .explanation {
        margin: 0 0 var(--cd-space-2);
      }
      .lists {
        display: grid;
        gap: var(--cd-space-2);
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      }
      .lists h5 {
        margin: 0 0 2px;
        font-size: var(--cd-font-size-xs);
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--cd-text-muted);
      }
      .lists ul {
        margin: 0;
        padding-left: 1.1em;
      }
      .attributes {
        display: grid;
        grid-template-columns: max-content 1fr;
        gap: 2px var(--cd-space-3);
        margin: var(--cd-space-2) 0 0;
      }
      .attributes dt {
        color: var(--cd-text-muted);
        font-family: var(--cd-font-mono, monospace);
        font-size: var(--cd-font-size-xs);
      }
      .attributes dd {
        margin: 0;
      }
      .meta {
        display: block;
        margin-top: var(--cd-space-2);
        font-size: var(--cd-font-size-xs);
      }
      .compact .explanation,
      .compact .attributes {
        display: none;
      }
    `,
  ],
})
export class AiAnalysisCardComponent {
  readonly analysis = input.required<AiAnalysis>();
  /** Brez razlage in lastnosti — za razširjeno vrstico tabele. */
  readonly compact = input(false);

  readonly riskLabel = riskLabel;
  readonly riskColor = riskColor;
  readonly confidenceLabel = confidenceLabel;

  readonly attributes = computed(() => Object.entries(this.analysis().attributes ?? {}).map(([key, value]) => ({ key, value })));
  readonly meta = computed(() => aiAnalysisMeta(this.analysis()));
}

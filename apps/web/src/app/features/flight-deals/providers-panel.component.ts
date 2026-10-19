import { Component, computed, input } from '@angular/core';
import { IonBadge, IonItem, IonLabel, IonList, IonNote, IonText } from '@ionic/angular/standalone';
import { HelpButtonComponent } from '../../shared/help/help-button.component.js';
import { formatLjubljana } from '../../core/scanners/scanners.model.js';
import { OUTCOME_LABELS, type ProviderAdmin } from './flight-deals.model.js';

// Dodatek tipa `flights` v administraciji skenerjev (016): stanje virov z zadnjo napako in dnevno
// mejo — do 016 zavihek "Viri" v `admin.page.ts`. Vhod `extras` je `extras` tipa iz
// `GET /scanners/admin/types` (`modules/flight-deals/scanner/admin-extras.ts`); komponento vstavi
// generična stran prek registra (`scanner-ui.ts`), ne da bi vedela, da gre za lete.

@Component({
  selector: 'app-flight-providers-panel',
  standalone: true,
  imports: [HelpButtonComponent, IonList, IonItem, IonLabel, IonBadge, IonNote, IonText],
  template: `
    <h2 class="cd-section-title">Viri podatkov <app-help topic="flightDeals.sources"></app-help></h2>
    <ion-list lines="full">
      @for (p of providers(); track p.id) {
        <ion-item>
          <ion-label>
            <h3>
              {{ p.label }}
              <ion-badge [color]="p.enabled ? 'success' : 'medium'">{{ p.enabled ? 'vklopljen' : 'izklopljen' }}</ion-badge>
              @if (!p.official) {
                <ion-badge color="warning">neuradni</ion-badge>
              }
            </h3>
            @if (p.notice) {
              <p>{{ p.notice }}</p>
            }
            <p>
              zadnji uspeh: {{ p.lastSuccessAt ? formatLjubljana(p.lastSuccessAt) : '—' }}
              @if (p.lastOutcome) {
                · zadnji izid: {{ OUTCOME_LABELS[p.lastOutcome] }}
              }
              @if (p.dailyLimit !== null) {
                · danes {{ p.requestsToday }}/{{ p.dailyLimit }} zagonov
              }
            </p>
            @if (p.lastError) {
              <ion-text color="danger"><p>{{ formatLjubljana(p.lastErrorAt) }}: {{ p.lastError }}</p></ion-text>
            }
          </ion-label>
        </ion-item>
      }
    </ion-list>
    <ion-note class="cd-section-hint">Vire vklopi lastnik namestitve v okolju (FLIGHT_TRAVELPAYOUTS_TOKEN, FLIGHT_RYANAIR_ENABLED). Tu se stanja samo bere.</ion-note>
  `,
  styles: [
    `
      .cd-section-title {
        display: flex;
        align-items: center;
        gap: var(--cd-space-2);
      }
      h3 ion-badge {
        margin-left: var(--cd-space-1);
        vertical-align: middle;
      }
    `,
  ],
})
export class FlightProvidersPanelComponent {
  readonly extras = input<unknown>(null);
  readonly providers = computed<ProviderAdmin[]>(() => {
    const extras = this.extras() as { providers?: ProviderAdmin[] } | null;
    return extras?.providers ?? [];
  });
  readonly OUTCOME_LABELS = OUTCOME_LABELS;
  readonly formatLjubljana = formatLjubljana;
}

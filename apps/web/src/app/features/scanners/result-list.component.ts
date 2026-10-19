import { Component, input, output } from '@angular/core';
import { IonBadge, IonItem, IonLabel, IonList, IonNote, IonText } from '@ionic/angular/standalone';
import { changeColor, changeLabel, formatLjubljana, formatPriceOrDash, type Result } from '../../core/scanners/scanners.model.js';

// Privzeti prikaz rezultatov (FR-042): naslov s povezavo, vir, cena ali pomišljaj, sprememba z
// barvo kot pri ponudbah letov, prvič in zadnjič videno; nedosegljivi so zatemnjeni. Tip z
// lastnim prikazom (`resultsComponent` v registru) to komponento nadomesti.

@Component({
  selector: 'app-scanner-result-list',
  standalone: true,
  imports: [IonList, IonItem, IonLabel, IonBadge, IonNote, IonText],
  template: `
    @if (results().length === 0) {
      <ion-note class="cd-section-hint">{{ emptyText() }}</ion-note>
    }
    <ion-list lines="full">
      @for (r of results(); track r.id) {
        <ion-item button detail="true" [class.unavailable]="r.availability === 'unavailable'" (click)="select.emit(r)">
          <ion-label>
            <h3>
              {{ r.title }}
              @if (changeColor(r.lastChangeType); as color) {
                <ion-badge [color]="color">{{ changeLabel(r.lastChangeType) }}</ion-badge>
              }
            </h3>
            <p>
              <strong>{{ formatPriceOrDash(r.price) }}</strong>
              @if (r.previousPrice) {
                · prej <s>{{ formatPriceOrDash(r.previousPrice) }}</s>
              }
              · vir {{ r.source }}
            </p>
            <p>prvič {{ formatLjubljana(r.firstSeenAt) }} · zadnjič {{ formatLjubljana(r.lastSeenAt) }}</p>
            @if (r.url) {
              <p><a [href]="r.url" target="_blank" rel="noopener" (click)="$event.stopPropagation()">odpri pri viru</a></p>
            }
          </ion-label>
        </ion-item>
      }
    </ion-list>
    @if (results().length > 0) {
      <ion-text color="medium"><p class="foot">{{ results().length }} od {{ total() }} rezultatov.</p></ion-text>
    }
  `,
  styles: [
    `
      h3 ion-badge {
        margin-left: var(--cd-space-1);
        vertical-align: middle;
      }
      .unavailable {
        opacity: 0.6;
      }
      .foot {
        padding: var(--cd-space-2) var(--cd-page-padding);
        font-size: var(--cd-font-size-sm);
      }
    `,
  ],
})
export class ScannerResultListComponent {
  readonly results = input.required<Result[]>();
  readonly total = input(0);
  readonly emptyText = input('Rezultatov še ni.');
  readonly select = output<Result>();

  readonly changeColor = changeColor;
  readonly changeLabel = changeLabel;
  readonly formatLjubljana = formatLjubljana;
  readonly formatPriceOrDash = formatPriceOrDash;
}

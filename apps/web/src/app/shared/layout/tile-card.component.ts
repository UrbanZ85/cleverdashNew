import { Component, input } from '@angular/core';
import { IonCard, IonCardContent, IonIcon, IonSpinner } from '@ionic/angular/standalone';

// Enotno okrilje ploščice na nadzorni plošči. Do zdaj je vsaka ploščica sama napisala svoj
// `ion-card` z `ion-card-content` in ničesar drugega — od tod vtis "neoblikovanega HTML-ja"
// na posnetku zaslona: brez naslova, brez ikone, brez ločenega podnožja za navedbo vira.
//
// Ploščica sem podaja SAMO svojo vsebino; naslov, ikona, stanje nalaganja in podnožje so
// tukaj, da so na vseh ploščicah enaki. Vsebina gre v privzeti `ng-content`, navedba vira
// in oznaka starosti pa v režo `footer` — tako podnožje ostane vizualno ločeno ne glede na
// to, koliko vsebine je nad njim.
@Component({
  selector: 'app-tile-card',
  standalone: true,
  imports: [IonCard, IonCardContent, IonIcon, IonSpinner],
  template: `
    <ion-card class="tile">
      <div class="tile-head">
        @if (icon()) {
          <ion-icon class="tile-icon" [name]="icon()!" aria-hidden="true"></ion-icon>
        }
        <div class="tile-heading">
          <h2 class="tile-title">{{ title() }}</h2>
          @if (subtitle()) {
            <p class="tile-subtitle">{{ subtitle() }}</p>
          }
        </div>
        @if (loading()) {
          <ion-spinner name="dots" class="tile-spinner" aria-label="Nalaganje"></ion-spinner>
        }
        <div class="tile-actions">
          <ng-content select="[slot=actions]"></ng-content>
        </div>
      </div>
      <ion-card-content class="tile-body">
        <ng-content></ng-content>
      </ion-card-content>
      <div class="tile-foot">
        <ng-content select="[slot=footer]"></ng-content>
      </div>
    </ion-card>
  `,
  styles: `
    /* Ploščica mora zapolniti svojo celico v mreži, da so v isti vrstici enako visoke. */
    :host {
      display: block;
      height: 100%;
    }
    .tile {
      display: flex;
      flex-direction: column;
      height: 100%;
      margin: 0;
      border: 1px solid var(--cd-divider);
      border-radius: var(--cd-radius-lg);
      box-shadow: var(--cd-shadow-sm);
      background: var(--cd-surface);
      transition: box-shadow 150ms ease;
    }
    .tile:hover {
      box-shadow: var(--cd-shadow-md);
    }
    .tile-head {
      display: flex;
      align-items: center;
      gap: var(--cd-space-2);
      padding: var(--cd-space-3) var(--cd-space-4);
      border-bottom: 1px solid var(--cd-divider);
    }
    .tile-icon {
      flex: none;
      font-size: 1.25rem;
      color: var(--ion-color-primary);
    }
    .tile-heading {
      min-width: 0;
      flex: 1;
    }
    .tile-title {
      margin: 0;
      font-size: var(--cd-font-size-md);
      font-weight: 650;
      line-height: 1.3;
      color: var(--ion-text-color);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .tile-subtitle {
      margin: 0;
      font-size: var(--cd-font-size-xs);
      color: var(--cd-text-muted);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .tile-spinner {
      flex: none;
      width: 1.25rem;
      color: var(--cd-text-muted);
    }
    .tile-actions {
      flex: none;
      display: flex;
      align-items: center;
    }
    /* flex: 1 da podnožje potisne na dno tudi pri kratki vsebini. */
    .tile-body {
      flex: 1;
      padding: var(--cd-space-4);
    }
    /* Podnožje je prazna reža na večini ploščic — takrat ne sme jemati višine, zato
       :has() namesto stalnega robu. */
    .tile-foot:has(> *) {
      padding: var(--cd-space-2) var(--cd-space-4) var(--cd-space-3);
      border-top: 1px solid var(--cd-divider);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--cd-space-2);
      flex-wrap: wrap;
    }
  `,
})
export class TileCardComponent {
  readonly title = input.required<string>();
  readonly subtitle = input<string | null>(null);
  /** Ime ikone iz `core/icons/register-icons.ts`. Neregistrirano ime se izriše kot prazen prostor. */
  readonly icon = input<string | null>(null);
  readonly loading = input(false);
}

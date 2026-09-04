import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonIcon,
  IonMenuButton,
} from '@ionic/angular/standalone';

// Enotna glava strani. Do zdaj je vsaka od devetih strani prepisala isti blok
// ion-header/ion-toolbar/ion-title — in nobena ni imela ion-menu-button, zato je bil pod
// pragom ion-split-pane (kjer se stranski meni skrije) meni dosegljiv IZKLJUČNO s potegom
// prsta. V ozkem oknu na namizju ga torej ni bilo mogoče odpreti.
//
// Dve vlogi, ena komponenta:
//  - stran zavihka (dashboard, kamere, nastavitve, danes) → gumb za meni. ion-menu-button
//    se skrije sam, ko je meni razprt (privzeti autoHide), zato ga ni treba pogojevati po
//    širini zaslona;
//  - podstran (urejanje kamer, urnik, koledar, zgodovina, diagnostika) → gumb nazaj na
//    matično stran. Te strani niso v registru zavihkov in do njih se pride samo z
//    navigacijo, zato je meni tam napačna poteza — pot nazaj je prava.
@Component({
  selector: 'app-page-header',
  standalone: true,
  imports: [RouterLink, IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon, IonMenuButton],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          @if (backRoute(); as route) {
            <ion-button [routerLink]="route" [attr.aria-label]="backLabel()">
              <ion-icon slot="start" name="chevron-back" aria-hidden="true"></ion-icon>
              {{ backLabel() }}
            </ion-button>
          } @else {
            <ion-menu-button></ion-menu-button>
          }
        </ion-buttons>
        <ion-title>
          <span class="page-title">{{ title() }}</span>
          @if (subtitle()) {
            <span class="page-subtitle">{{ subtitle() }}</span>
          }
        </ion-title>
        <ion-buttons slot="end">
          <ng-content select="[slot=end]"></ng-content>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
  `,
  styles: `
    ion-toolbar {
      --border-width: 0 0 1px 0;
      --border-color: var(--cd-divider);
      --background: var(--cd-surface);
      --min-height: 56px;
    }
    .page-title {
      display: block;
      font-weight: 650;
      letter-spacing: -0.01em;
    }
    .page-subtitle {
      display: block;
      font-size: var(--cd-font-size-xs);
      font-weight: 400;
      letter-spacing: 0;
      color: var(--cd-text-muted);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `,
})
export class PageHeaderComponent {
  readonly title = input.required<string>();
  /** Neobvezna druga vrstica — npr. katera lokacija ali vir je v uporabi. */
  readonly subtitle = input<string | null>(null);
  /** Če je nastavljena, glava namesto gumba za meni pokaže pot nazaj. */
  readonly backRoute = input<string | null>(null);
  readonly backLabel = input('Nazaj');
}

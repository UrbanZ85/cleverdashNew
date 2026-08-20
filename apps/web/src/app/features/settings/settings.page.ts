import { Component, inject } from '@angular/core';
import { IonHeader, IonToolbar, IonTitle, IonContent, IonSegment, IonSegmentButton, IonLabel } from '@ionic/angular/standalone';
import { ThemeService } from '../../core/theme/theme.service.js';
import { LocationComponent } from './location.component.js';
import { TileArrangementComponent } from './tile-arrangement.component.js';

// Gostitelj za T111 (razporeditev ploščic), T112 (tema) in T113 (lokacija). Registriran
// kot zavihek "settings" v platform/tabs/registry.ts.
@Component({
  selector: 'app-settings-page',
  standalone: true,
  imports: [IonHeader, IonToolbar, IonTitle, IonContent, IonSegment, IonSegmentButton, IonLabel, LocationComponent, TileArrangementComponent],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>Nastavitve</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <h2>Tema</h2>
      <ion-segment [value]="theme.current()" (ionChange)="onThemeChange($event)">
        <ion-segment-button value="system"><ion-label>Sistem</ion-label></ion-segment-button>
        <ion-segment-button value="light"><ion-label>Svetla</ion-label></ion-segment-button>
        <ion-segment-button value="dark"><ion-label>Temna</ion-label></ion-segment-button>
      </ion-segment>

      <h2>Lokacija za vreme</h2>
      <app-location></app-location>

      <h2>Ploščice na nadzorni plošči</h2>
      <app-tile-arrangement></app-tile-arrangement>
    </ion-content>
  `,
})
export class SettingsPage {
  protected readonly theme = inject(ThemeService);

  onThemeChange(event: CustomEvent<{ value?: unknown }>): void {
    const value = event.detail.value;
    if (value === 'system' || value === 'light' || value === 'dark') {
      void this.theme.setTheme(value);
    }
  }
}

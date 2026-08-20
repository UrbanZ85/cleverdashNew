import { Component } from '@angular/core';
import { IonHeader, IonToolbar, IonTitle, IonContent, IonGrid, IonRow, IonCol } from '@ionic/angular/standalone';
import { WeatherTileComponent } from './tiles/weather-tile.component.js';
import { RadarTileComponent } from './tiles/radar-tile.component.js';
import { TileHostComponent } from './tile-host.component.js';

// Z6 v spec.md (P6): dashboard je mreža ploščic. Za 001 sta dve — vreme in radar (Assumptions
// v spec.md: "v tej fazi samo vreme in radar"). Vsaka je ovita v `<app-tile-host>` (US4,
// T099), da izpad ene ne podre druge. Vtičniški register vrst ploščic, ki dovoli dodajanje
// brez sprememb obstoječih, je naloga US6 (tasks.md T110) — ta zaslon ju za zdaj vključi
// neposredno.
@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  imports: [
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonGrid,
    IonRow,
    IonCol,
    TileHostComponent,
    WeatherTileComponent,
    RadarTileComponent,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>CleverDash</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <ion-grid>
        <ion-row>
          <ion-col size="12" size-md="6">
            <app-tile-host>
              <app-weather-tile></app-weather-tile>
            </app-tile-host>
          </ion-col>
          <ion-col size="12" size-md="6">
            <app-tile-host>
              <app-radar-tile></app-radar-tile>
            </app-tile-host>
          </ion-col>
        </ion-row>
      </ion-grid>
    </ion-content>
  `,
})
export class DashboardPage {}

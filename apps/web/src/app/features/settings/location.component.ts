import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonItem, IonInput, IonButton, IonText, IonNote } from '@ionic/angular/standalone';
import { SettingsStore } from '../../core/settings/settings.store.js';
import { HelpButtonComponent } from '../../shared/help/help-button.component.js';

// spec.md, Assumptions: privzeta lokacija za vreme je Ljubljana, z možnostjo izbire.
//
// Ta vrednost se do zdaj SHRANJEVALA, a je ni nihče bral: modules/dashboard/router.ts je
// lokacijo jemal iz env.ARSO_DEFAULT_LOCATION (v kodi je bil TODO(US3/US6, T081+)). Zdaj jo
// bere iz nastavitev, zato sprememba tukaj dejansko spremeni prikazano vreme.
@Component({
  selector: 'app-location',
  standalone: true,
  imports: [FormsModule, HelpButtonComponent, IonItem, IonInput, IonButton, IonText, IonNote],
  template: `
    <ion-note class="cd-section-hint">
      Ime lokacije mora biti tako, kot ga pozna ARSO (npr. Ljubljana, Maribor, Kredarica).
    </ion-note>
    <ion-item>
      <ion-input label="Lokacija" labelPlacement="stacked" [(ngModel)]="locationName"></ion-input>
      <app-help slot="end" topic="sources.location"></app-help>
    </ion-item>
    <ion-item>
      <ion-input
        label="Zemljepisna širina"
        labelPlacement="stacked"
        type="number"
        [(ngModel)]="latitude"
      ></ion-input>
    </ion-item>
    <ion-item>
      <ion-input
        label="Zemljepisna dolžina"
        labelPlacement="stacked"
        type="number"
        [(ngModel)]="longitude"
      ></ion-input>
    </ion-item>
    @if (saved()) {
      <ion-text color="success"><p>Shranjeno.</p></ion-text>
    }
    @if (error()) {
      <ion-text color="danger"><p>{{ error() }}</p></ion-text>
    }
    <ion-button expand="block" [disabled]="saving()" (click)="save()">
      {{ saving() ? 'Shranjujem ...' : 'Shrani lokacijo' }}
    </ion-button>
  `,
})
export class LocationComponent implements OnInit {
  private readonly settings = inject(SettingsStore);

  locationName = 'Ljubljana';
  latitude = 46.0629;
  longitude = 14.5602;
  readonly saving = signal(false);
  readonly saved = signal(false);
  readonly error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    await this.settings.ensureLoaded();
    const weather = this.settings.weather();
    this.locationName = weather.locationName;
    this.latitude = weather.latitude;
    this.longitude = weather.longitude;
  }

  async save(): Promise<void> {
    this.saving.set(true);
    this.saved.set(false);
    this.error.set(null);
    try {
      await this.settings.patch({
        weather: { locationName: this.locationName, latitude: this.latitude, longitude: this.longitude },
      });
      this.saved.set(true);
    } catch {
      this.error.set('Lokacije ni bilo mogoče shraniti. Poskusi znova.');
    } finally {
      this.saving.set(false);
    }
  }
}

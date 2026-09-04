import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { IonItem, IonToggle, IonText, IonButton, IonIcon } from '@ionic/angular/standalone';
import { SettingsStore } from '../../core/settings/settings.store.js';
import { HelpButtonComponent } from '../../shared/help/help-button.component.js';

// 003, Story 7, data-model.md "Nastavitve porabe podatkov": živi v features/settings/, ne
// v features/cameras/ — enak vzorec kot app-location (001) in
// app-time-tracking-settings (002): Nastavitve so skupni gostitelj, moduli prispevajo svoj
// razdelek prek istega GET/PUT /settings.
@Component({
  selector: 'app-cameras-settings',
  standalone: true,
  imports: [FormsModule, RouterLink, HelpButtonComponent, IonItem, IonToggle, IonText, IonButton, IonIcon],
  template: `
    <ion-item>
      <ion-toggle [(ngModel)]="dataSaverEnabled" (ionChange)="save()">Zmanjšaj porabo podatkov na mobilnem omrežju</ion-toggle>
      <app-help slot="end" topic="cameras.dataSaver"></app-help>
    </ion-item>
    @if (saved()) {
      <ion-text color="success"><p>Shranjeno.</p></ion-text>
    }
    @if (error(); as message) {
      <ion-text color="danger"><p>{{ message }}</p></ion-text>
    }

    <!-- Same kamere (dodajanje, urejanje, vrstni red) so na svojem zaslonu, ne tukaj: ta
         razdelek je nastavitev porabe podatkov. Povezava je vseeno tu, ker uporabnik, ki
         kamero išče, najprej odpre Nastavitve. -->
    <p class="cd-section-hint">Kamere same dodajaš in urejaš na zaslonu za urejanje kamer.</p>
    <ion-button expand="block" fill="outline" [routerLink]="['/cameras/manage']">
      <ion-icon slot="start" name="videocam-outline" aria-hidden="true"></ion-icon>
      Dodaj ali uredi kamere
    </ion-button>
  `,
})
export class CamerasSettingsComponent implements OnInit {
  private readonly settings = inject(SettingsStore);

  dataSaverEnabled = true;
  readonly saved = signal(false);
  readonly error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    await this.settings.ensureLoaded();
    this.dataSaverEnabled = this.settings.settings().cameraDataSaverEnabled;
  }

  // `SettingsStore.patch` ob napaki lokalno stanje povrne IN napako vrže naprej. Ta razdelek
  // je edini, ki je ni prestrezal: stikalo je skočilo nazaj, sporočila ni bilo nobenega in
  // "Shranjeno." se ni pokazal — za uporabnika je bilo videti, kot da shranjevanje ne dela.
  async save(): Promise<void> {
    this.saved.set(false);
    this.error.set(null);
    try {
      await this.settings.patch({ cameraDataSaverEnabled: this.dataSaverEnabled });
      this.saved.set(true);
    } catch {
      // Stikalo že kaže prejšnje stanje (shramba ga je povrnila) — uskladi še lokalno polje,
      // sicer bi ostalo na neshranjeni vrednosti.
      this.dataSaverEnabled = this.settings.settings().cameraDataSaverEnabled;
      this.error.set('Nastavitve ni bilo mogoče shraniti. Poskusi znova.');
    }
  }
}

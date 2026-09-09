import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  IonButton,
  IonIcon,
  IonItem,
  IonLabel,
  IonNote,
  IonSearchbar,
  IonSpinner,
  IonText,
} from '@ionic/angular/standalone';
import { SettingsStore } from '../../core/settings/settings.store.js';
import { MeteoApi } from '../../core/meteo/meteo.api.js';
import type { MeteoStationOption } from '../../core/meteo/meteo.model.js';
import { foldForSearch } from '../../core/search/fold-text.js';
import { HelpButtonComponent } from '../../shared/help/help-button.component.js';

// Živi v features/settings/, ne v features/meteo/ — enak vzorec kot app-cameras-settings in
// app-notes-settings: Nastavitve so skupni gostitelj, modul prispeva svoj razdelek prek istega
// GET/PUT /settings. Seznam postaj pride iz `core/meteo/` in ne iz zavihka `meteo`, ker je uvoz
// med zavihkoma prepovedan (člen I).
//
// Postaja se IZBERE s seznama in ne vpiše: oznaka v ARSO naslovu ni ime kraja
// (postaja "Bilje Nova Gorica" je `NOVA-GOR_BILJE`), zato je vpisovanje na pamet zanesljiv
// način, da človek dobi 404 in ne ve, zakaj.
@Component({
  selector: 'app-meteo-settings',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    HelpButtonComponent,
    IonSearchbar,
    IonItem,
    IonLabel,
    IonNote,
    IonText,
    IonButton,
    IonIcon,
    IonSpinner,
  ],
  template: `
    <ion-note class="cd-section-hint">
      Zavihek "Meritve ARSO" in ploščica s padavinami kažeta meritve te postaje. Postaj je
      {{ stations().length || '~100' }} — iščeš jih po imenu kraja.
    </ion-note>

    <ion-item>
      <ion-label>
        <h3>Izbrana postaja</h3>
        <p>{{ selectedLabel() }}</p>
      </ion-label>
      <app-help slot="end" topic="meteo.station"></app-help>
    </ion-item>

    <ion-searchbar
      placeholder="Poišči postajo (npr. Vrhnika)"
      [debounce]="150"
      [value]="query()"
      (ionInput)="query.set($any($event.target).value ?? '')"
    ></ion-searchbar>

    @if (loading()) {
      <div class="loading"><ion-spinner name="dots" aria-label="Nalaganje postaj"></ion-spinner></div>
    } @else if (loadError(); as message) {
      <ion-text color="danger"><p>{{ message }}</p></ion-text>
      <ion-button expand="block" fill="outline" (click)="loadStations()">Poskusi znova</ion-button>
    } @else {
      @for (station of visible(); track station.id) {
        <ion-item button [detail]="false" (click)="choose(station)">
          <ion-icon
            slot="start"
            [name]="station.id === current() ? 'checkmark-circle-outline' : 'location-outline'"
            [color]="station.id === current() ? 'success' : 'medium'"
            aria-hidden="true"
          ></ion-icon>
          <ion-label>
            <h3>{{ station.title }}</h3>
            <p>
              {{ station.id }}
              @if (station.altitudeM !== null) {
                · {{ station.altitudeM }} m
              }
            </p>
          </ion-label>
        </ion-item>
      } @empty {
        <ion-note class="cd-section-hint">Nobena postaja se ne ujema z iskanjem.</ion-note>
      }

      @if (hiddenCount() > 0) {
        <ion-note class="cd-section-hint">
          … in še {{ hiddenCount() }} postaj. Zoži iskanje, da se pokažejo.
        </ion-note>
      }
    }

    @if (saved()) {
      <ion-text color="success"><p>Shranjeno.</p></ion-text>
    }
    @if (saveError(); as message) {
      <ion-text color="danger"><p>{{ message }}</p></ion-text>
    }

    @if (chosen()) {
      <ion-button expand="block" fill="clear" size="small" (click)="resetToDefault()">
        Povrni na privzeto postajo namestitve
      </ion-button>
    }

    <ion-button expand="block" fill="outline" [routerLink]="['/meteo']">
      <ion-icon slot="start" name="rainy-outline" aria-hidden="true"></ion-icon>
      Odpri meritve
    </ion-button>
  `,
  styles: `
    .loading {
      display: grid;
      place-items: center;
      padding: var(--cd-space-4);
    }
  `,
})
export class MeteoSettingsComponent implements OnInit {
  private readonly settings = inject(SettingsStore);
  private readonly api = inject(MeteoApi);

  /** Koliko postaj se izriše naenkrat. Vseh ~100 v enem seznamu je stena besedila, po kateri
   * se ne da brati; iskanje je hitrejša pot do postaje kot drsenje. */
  private static readonly VISIBLE_LIMIT = 25;

  readonly stations = signal<MeteoStationOption[]>([]);
  readonly query = signal('');
  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly saved = signal(false);
  readonly saveError = signal<string | null>(null);

  /** Oznaka postaje, ki dejansko velja — uporabnikova izbira ali privzetek namestitve. */
  readonly current = signal<string | null>(null);
  /** Ali je trenutna postaja uporabnikova izbira (in ne privzetek). */
  readonly chosen = signal(false);

  private readonly matches = computed(() => {
    const needle = foldForSearch(this.query().trim());
    const all = this.stations();
    if (needle.length === 0) return all;
    return all.filter(
      (station) => foldForSearch(station.title).includes(needle) || foldForSearch(station.id).includes(needle),
    );
  });

  readonly visible = computed(() => this.matches().slice(0, MeteoSettingsComponent.VISIBLE_LIMIT));
  readonly hiddenCount = computed(() => Math.max(0, this.matches().length - MeteoSettingsComponent.VISIBLE_LIMIT));

  readonly selectedLabel = computed(() => {
    const id = this.current();
    if (!id) return 'Nalaganje ...';
    const station = this.stations().find((s) => s.id === id);
    const name = station ? `${station.title} (${id})` : id;
    return this.chosen() ? name : `${name} — privzetek namestitve`;
  });

  async ngOnInit(): Promise<void> {
    await this.settings.ensureLoaded();
    const stored = this.settings.meteo().station;
    this.current.set(stored);
    this.chosen.set(stored !== null);
    await this.loadStations();
  }

  async loadStations(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const list = await this.api.stations();
      this.stations.set(list.stations);
      // Strežnik pove, katera postaja velja — tudi kadar je to privzetek namestitve, ki ga
      // odjemalec ne pozna (živi v `.env`, ne v nastavitvah).
      this.current.set(list.selected.id);
      this.chosen.set(list.selected.chosen);
    } catch {
      this.loadError.set('Seznama postaj ni bilo mogoče prenesti. Poskusi znova.');
    } finally {
      this.loading.set(false);
    }
  }

  async choose(station: MeteoStationOption): Promise<void> {
    await this.save(station.id);
  }

  async resetToDefault(): Promise<void> {
    await this.save(null);
  }

  private async save(station: string | null): Promise<void> {
    this.saved.set(false);
    this.saveError.set(null);
    const previous = { id: this.current(), chosen: this.chosen() };
    try {
      await this.settings.patch({ meteo: { station } });
      this.chosen.set(station !== null);
      if (station !== null) {
        this.current.set(station);
        this.saved.set(true);
        return;
      }
      // Po vrnitvi na privzetek odjemalec ne ve, katera postaja to je — pove strežnik.
      await this.loadStations();
      this.saved.set(true);
    } catch {
      this.current.set(previous.id);
      this.chosen.set(previous.chosen);
      this.saveError.set('Postaje ni bilo mogoče shraniti. Poskusi znova.');
    }
  }
}

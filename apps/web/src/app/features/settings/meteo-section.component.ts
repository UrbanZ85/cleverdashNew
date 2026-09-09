import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  IonButton,
  IonChip,
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
import type { MeteoProviderInfo, MeteoStationOption } from '../../core/meteo/meteo.model.js';
import { foldForSearch } from '../../core/search/fold-text.js';
import { HelpButtonComponent } from '../../shared/help/help-button.component.js';

// Živi v features/settings/, ne v features/meteo/ — enak vzorec kot app-cameras-settings in
// app-notes-settings: Nastavitve so skupni gostitelj, modul prispeva svoj razdelek prek istega
// GET/PUT /settings. Seznam postaj pride iz `core/meteo/` in ne iz zavihka `meteo`, ker je uvoz
// med zavihkoma prepovedan (člen I).
//
// Postaja se IZBERE s seznama in ne vpiše: oznaka v naslovu ni ime kraja (ARSO postaja
// "Bilje Nova Gorica" je `NOVA-GOR_BILJE`), zato je vpisovanje na pamet zanesljiv način, da
// človek dobi 404 in ne ve, zakaj.
//
// POSTAJ JE VEČ IN IZ DVEH OMREŽIJ. Vrstni red ni okrasek: PRVA postaja je tista, ki jo dobi
// ploščica na nadzorni plošči in ki se odpre ob vstopu na zavihek. Zato je izbira zgoraj
// prikazana kot urejen seznam z izrecno oznako "privzeta", ne kot množica kljukic — brez
// vidnega vrstnega reda človek ne bi vedel, zakaj ploščica kaže ravno to postajo.

/** Ena vrstica v seznamu za izbiro, s podatkom, ali je že izbrana. */
interface StationRow extends MeteoStationOption {
  selected: boolean;
}

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
    IonChip,
    IonButton,
    IonIcon,
    IonSpinner,
  ],
  template: `
    <ion-note class="cd-section-hint">
      Zavihek "Meritve" in ploščica s padavinami kažeta meritve teh postaj. Izbereš jih lahko
      več in med njimi na zavihku preklapljaš; postaj je
      {{ stations().length || '~1400' }} iz dveh omrežij — iščeš jih po imenu kraja.
    </ion-note>

    <ion-item lines="none">
      <ion-label>
        <h3>Izbrane postaje</h3>
        <p>{{ selectionHint() }}</p>
      </ion-label>
      <app-help slot="end" topic="meteo.station"></app-help>
    </ion-item>

    <!-- Izbrane so zgoraj in v SVOJEM vrstnem redu: prva je tista, ki jo kaže ploščica. -->
    <div class="chosen" role="list" aria-label="Izbrane postaje">
      @for (station of chosenRows(); track station.ref; let first = $first) {
        <ion-chip role="listitem" [outline]="!first" class="chosen-chip">
          @if (first) {
            <ion-icon name="star" color="warning" aria-label="Privzeta postaja"></ion-icon>
          }
          <ion-label>
            {{ station.title }}
            <span class="chip-provider">{{ providerLabel(station.provider) }}</span>
          </ion-label>
          @if (!first) {
            <ion-icon
              name="arrow-up-circle-outline"
              [attr.aria-label]="'Nastavi ' + station.title + ' kot privzeto'"
              [title]="'Nastavi kot privzeto'"
              (click)="makePrimary(station.ref)"
            ></ion-icon>
          }
          <ion-icon
            name="close-circle"
            [attr.aria-label]="'Odstrani ' + station.title"
            (click)="toggle(station.ref)"
          ></ion-icon>
        </ion-chip>
      } @empty {
        <ion-note class="cd-section-hint">
          Nobena postaja ni izbrana — velja privzetek namestitve{{ defaultSuffix() }}.
        </ion-note>
      }
    </div>

    @if (atLimit()) {
      <ion-note class="cd-section-hint">
        Izbranih je največ ({{ maxStations }}). Če hočeš drugo, eno najprej odstrani.
      </ion-note>
    }

    <!-- Filter po omrežju. Postaji istega kraja sta lahko v obeh (Ljubljana-Bežigrad meri
         ARSO, isto lokacijo pa objavlja tudi Neverin) in to sta različni meritvi. -->
    <div class="providers" role="group" aria-label="Omrežje">
      <ion-chip [outline]="providerFilter() !== null" (click)="providerFilter.set(null)">Vse</ion-chip>
      @for (provider of providers(); track provider.id) {
        <ion-chip
          [outline]="providerFilter() !== provider.id"
          [disabled]="provider.unavailable"
          (click)="providerFilter.set(provider.id)"
        >
          {{ provider.label }}
          <span class="chip-count">{{ provider.stationCount }}</span>
        </ion-chip>
      }
    </div>

    @for (provider of unavailableProviders(); track provider.id) {
      <!-- Člen VII: izpad enega omrežja mora biti viden. Seznam drugega ostane uporaben. -->
      <ion-text color="warning">
        <p>Seznama omrežja {{ provider.label }} ni bilo mogoče prenesti; njegovih postaj ta hip ni na seznamu.</p>
      </ion-text>
    }

    <ion-searchbar
      placeholder="Poišči postajo (npr. Vrhnika, Sveta Marina)"
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
      @for (station of visible(); track station.ref) {
        <ion-item button [detail]="false" [disabled]="!station.selected && atLimit()" (click)="toggle(station.ref)">
          <ion-icon
            slot="start"
            [name]="station.selected ? 'checkmark-circle' : 'location-outline'"
            [color]="station.selected ? 'success' : 'medium'"
            aria-hidden="true"
          ></ion-icon>
          <ion-label>
            <h3>{{ station.title }}</h3>
            <p>
              {{ providerLabel(station.provider) }} · {{ station.id }}
              @if (station.altitudeM !== null) {
                · {{ station.altitudeM }} m
              }
              @if (station.countryCode && station.countryCode !== 'SI') {
                · {{ station.countryCode }}
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

    .chosen,
    .providers {
      display: flex;
      flex-wrap: wrap;
      gap: var(--cd-space-1);
      padding: 0 var(--cd-space-3) var(--cd-space-2);
    }

    .chip-provider,
    .chip-count {
      opacity: 0.6;
      font-size: 0.8em;
      margin-inline-start: 0.35em;
    }
  `,
})
export class MeteoSettingsComponent implements OnInit {
  private readonly settings = inject(SettingsStore);
  private readonly api = inject(MeteoApi);

  /** Koliko postaj se izriše naenkrat. Vseh ~1400 v enem seznamu je stena besedila, po kateri
   * se ne da brati; iskanje je hitrejša pot do postaje kot drsenje. */
  private static readonly VISIBLE_LIMIT = 25;

  /** Zgornja meja izbranih. Ista številka je uveljavljena na strežniku
   * (`domain/meteo-station-ref.ts`) — tu je zato, da je gumb onemogočen, preden klic vrne 400. */
  readonly maxStations = 8;

  readonly stations = signal<MeteoStationOption[]>([]);
  readonly providers = signal<MeteoProviderInfo[]>([]);
  readonly query = signal('');
  readonly providerFilter = signal<string | null>(null);
  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly saved = signal(false);
  readonly saveError = signal<string | null>(null);

  /** Sklici postaj, ki dejansko veljajo — uporabnikova izbira ali privzetek namestitve. */
  readonly selected = signal<string[]>([]);
  /** Ali je izbiro opravil uporabnik (in ne privzetek namestitve). */
  readonly chosen = signal(false);

  readonly unavailableProviders = computed(() => this.providers().filter((p) => p.unavailable));
  readonly atLimit = computed(() => this.chosen() && this.selected().length >= this.maxStations);

  /** Izbrane postaje v UPORABNIKOVEM vrstnem redu (in ne v vrstnem redu seznama). */
  readonly chosenRows = computed<MeteoStationOption[]>(() => {
    if (!this.chosen()) return [];
    const byRef = new Map(this.stations().map((station) => [station.ref, station]));
    return this.selected().map((ref) => byRef.get(ref) ?? this.placeholderFor(ref));
  });

  private readonly matches = computed(() => {
    const needle = foldForSearch(this.query().trim());
    const provider = this.providerFilter();
    const chosenRefs = new Set(this.selected());

    return this.stations()
      .filter((station) => provider === null || station.provider === provider)
      .filter(
        (station) =>
          needle.length === 0 ||
          foldForSearch(station.title).includes(needle) ||
          foldForSearch(station.id).includes(needle),
      )
      .map<StationRow>((station) => ({ ...station, selected: chosenRefs.has(station.ref) }));
  });

  readonly visible = computed(() => this.matches().slice(0, MeteoSettingsComponent.VISIBLE_LIMIT));
  readonly hiddenCount = computed(() => Math.max(0, this.matches().length - MeteoSettingsComponent.VISIBLE_LIMIT));

  readonly selectionHint = computed(() => {
    if (!this.chosen()) return 'Nobena — velja privzetek namestitve.';
    const count = this.selected().length;
    if (count === 1) return 'Ena postaja. Izbereš jih lahko več in med njimi preklapljaš.';
    return `${count} postaj. Prva (z zvezdico) je privzeta za ploščico na nadzorni plošči.`;
  });

  /** Ime privzete postaje, kadar uporabnik svoje izbire nima — pove ga strežnik. */
  readonly defaultSuffix = computed(() => {
    const fallback = this.selected()[0];
    if (!fallback) return '';
    const station = this.stations().find((s) => s.ref === fallback);
    return station ? ` (${station.title})` : '';
  });

  providerLabel(id: string): string {
    return this.providers().find((provider) => provider.id === id)?.label ?? id;
  }

  async ngOnInit(): Promise<void> {
    await this.settings.ensureLoaded();
    const stored = this.settings.meteo().stations;
    this.selected.set([...stored]);
    this.chosen.set(stored.length > 0);
    await this.loadStations();
  }

  async loadStations(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const list = await this.api.stations();
      this.stations.set(list.stations);
      this.providers.set(list.providers);
      // Strežnik pove, katere postaje veljajo — tudi kadar je to privzetek namestitve, ki ga
      // odjemalec ne pozna (živi v `.env`, ne v nastavitvah).
      this.selected.set(list.selected);
      this.chosen.set(list.chosen);
    } catch {
      this.loadError.set('Seznama postaj ni bilo mogoče prenesti. Poskusi znova.');
    } finally {
      this.loading.set(false);
    }
  }

  /** Doda ali odstrani postajo. Nova gre na KONEC — privzeta se ne sme zamenjati mimogrede. */
  async toggle(ref: string): Promise<void> {
    const current = this.chosen() ? this.selected() : [];
    const next = current.includes(ref) ? current.filter((r) => r !== ref) : [...current, ref];
    if (next.length > this.maxStations) return;
    await this.save(next);
  }

  /** Postavi postajo na prvo mesto — s tem postane privzeta za ploščico in za vstop v zavihek. */
  async makePrimary(ref: string): Promise<void> {
    const current = this.selected();
    if (!current.includes(ref)) return;
    await this.save([ref, ...current.filter((r) => r !== ref)]);
  }

  async resetToDefault(): Promise<void> {
    await this.save([]);
  }

  private async save(stations: string[]): Promise<void> {
    this.saved.set(false);
    this.saveError.set(null);
    const previous = { selected: this.selected(), chosen: this.chosen() };
    // Izris se ne čaka na strežnik: seznam čipov je odziv na dotik in zakasnitev omrežja bi
    // bila videti kot neodziven gumb. Ob napaki se povrne prejšnje stanje.
    this.selected.set(stations);
    this.chosen.set(stations.length > 0);
    try {
      await this.settings.patch({ meteo: { stations } });
      if (stations.length > 0) {
        this.saved.set(true);
        return;
      }
      // Po vrnitvi na privzetek odjemalec ne ve, katera postaja to je — pove strežnik.
      await this.loadStations();
      this.saved.set(true);
    } catch {
      this.selected.set(previous.selected);
      this.chosen.set(previous.chosen);
      this.saveError.set('Izbire postaj ni bilo mogoče shraniti. Poskusi znova.');
    }
  }

  /**
   * Vrstica za sklic, ki ga v seznamu ni.
   *
   * Zgodi se, kadar je omrežje te postaje ta hip nedosegljivo: izbira je še vedno veljavna in
   * mora ostati vidna, sicer bi bilo videti, kot da se ni shranila.
   */
  private placeholderFor(ref: string): MeteoStationOption {
    const [provider, ...rest] = ref.split(':');
    const id = rest.join(':');
    return {
      ref,
      provider: (provider === 'neverin' ? 'neverin' : 'arso') as MeteoStationOption['provider'],
      id,
      title: id,
      altitudeM: null,
      latitude: null,
      longitude: null,
      countryCode: null,
    };
  }
}

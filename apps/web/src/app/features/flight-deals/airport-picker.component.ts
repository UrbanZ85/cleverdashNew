import { Component, inject, input, model, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonButton, IonChip, IonIcon, IonInput, IonItem, IonLabel, IonNote, IonSearchbar, IonSelect, IonSelectOption } from '@ionic/angular/standalone';
import { FlightDealsApi } from './flight-deals.api.js';
import type { Airport } from './flight-deals.model.js';

// Izbirnik letališč (FR-003, FR-004): iskalnik po imenu/mestu/kodi IN način "v radiju N km od …".
// Vzorec `settings/meteo-section.component.ts`: izbrano kot čipi z `close-circle`, zadetki kot
// seznam, omejitev iz strežnika. Letališče se IZBERE s seznama in ne vpiše: koda, ki je ni v
// naboru, bi dala 400 šele ob shranjevanju.

@Component({
  selector: 'app-airport-picker',
  standalone: true,
  imports: [FormsModule, IonSearchbar, IonItem, IonLabel, IonNote, IonChip, IonIcon, IonButton, IonInput, IonSelect, IonSelectOption],
  template: `
    <div class="chosen" role="list" [attr.aria-label]="label()">
      @for (code of selected(); track code) {
        <ion-chip role="listitem">
          <ion-label>{{ code }}<span class="city">{{ cityOf(code) }}</span></ion-label>
          <ion-icon name="close-circle" [attr.aria-label]="'Odstrani ' + code" (click)="remove(code)"></ion-icon>
        </ion-chip>
      } @empty {
        <ion-note class="cd-section-hint">{{ emptyHint() }}</ion-note>
      }
    </div>

    @if (selected().length >= max()) {
      <ion-note class="cd-section-hint">Izbranih je največ ({{ max() }}). Če hočeš drugo, eno najprej odstrani.</ion-note>
    } @else {
      <div class="mode">
        <ion-chip [outline]="mode() !== 'search'" (click)="mode.set('search')">Po imenu</ion-chip>
        <ion-chip [outline]="mode() !== 'near'" (click)="mode.set('near')">V radiju</ion-chip>
      </div>

      @if (mode() === 'search') {
        <ion-searchbar
          [placeholder]="placeholder()"
          [debounce]="200"
          [value]="query()"
          (ionInput)="onQuery($any($event.target).value ?? '')"
        ></ion-searchbar>
      } @else {
        <div class="near">
          <ion-item lines="none">
            <ion-select label="Izhodišče" labelPlacement="stacked" interface="popover" [(ngModel)]="nearCenter" (ionChange)="loadNear()">
              <ion-select-option value="home">Doma (iz nastavitev poti)</ion-select-option>
              @for (code of ['LJU', 'ZAG', 'TRS', 'VCE', 'GRZ', 'KLU', 'VIE', 'MUC']; track code) {
                <ion-select-option [value]="code">{{ code }}</ion-select-option>
              }
            </ion-select>
          </ion-item>
          <ion-item lines="none">
            <ion-input label="Radij (km)" labelPlacement="stacked" type="number" inputmode="numeric" [(ngModel)]="radiusKm" (ionChange)="loadNear()"></ion-input>
          </ion-item>
          <ion-button size="small" fill="outline" (click)="loadNear()">Poišči</ion-button>
        </div>
      }

      @if (error(); as message) {
        <ion-note class="cd-section-hint error">{{ message }}</ion-note>
      }

      @for (airport of results(); track airport.iata) {
        <ion-item button detail="false" (click)="add(airport)" [disabled]="selected().includes(airport.iata)">
          <ion-icon slot="start" [name]="selected().includes(airport.iata) ? 'checkmark-circle' : 'location-outline'" aria-hidden="true"></ion-icon>
          <ion-label>
            <h3>{{ airport.iata }} · {{ airport.name }}</h3>
            <p>
              {{ airport.city }}, {{ airport.countryName }}
              @if (airport.distanceKm !== undefined) {
                · {{ airport.distanceKm }} km
              }
            </p>
          </ion-label>
        </ion-item>
      }
      @if (total() > results().length) {
        <ion-note class="cd-section-hint">… in še {{ total() - results().length }}. Zoži iskanje.</ion-note>
      }
    }
  `,
  styles: [
    `
      .chosen,
      .mode {
        display: flex;
        flex-wrap: wrap;
        gap: var(--cd-space-1);
        padding: var(--cd-space-1) 0;
      }
      .city {
        color: var(--cd-text-muted);
        font-size: var(--cd-font-size-xs);
        margin-left: var(--cd-space-1);
      }
      .near {
        display: flex;
        flex-wrap: wrap;
        align-items: flex-end;
        gap: var(--cd-space-2);
      }
      .near ion-item {
        flex: 1 1 160px;
        --padding-start: 0;
      }
      .error {
        color: var(--ion-color-danger);
      }
    `,
  ],
})
export class AirportPickerComponent {
  private readonly api = inject(FlightDealsApi);

  /** Izbrane IATA kode — dvosmerno (`[(selected)]`). */
  readonly selected = model<string[]>([]);
  readonly label = input('Letališča');
  readonly placeholder = input('Poišči letališče (npr. Trst, TRS, Benetke)');
  readonly emptyHint = input('Nobeno letališče ni izbrano.');
  readonly max = input(10);

  readonly mode = signal<'search' | 'near'>('search');
  readonly query = signal('');
  readonly results = signal<Airport[]>([]);
  readonly total = signal(0);
  readonly error = signal<string | null>(null);
  nearCenter: string = 'LJU';
  radiusKm: number | string = 150;

  private readonly known = new Map<string, Airport>();

  cityOf(code: string): string {
    return this.known.get(code)?.city ?? '';
  }

  async onQuery(value: string): Promise<void> {
    this.query.set(value);
    this.error.set(null);
    if (value.trim().length < 2) {
      this.results.set([]);
      this.total.set(0);
      return;
    }
    try {
      const res = await this.api.airports({ q: value, limit: 12 });
      for (const a of res.airports) this.known.set(a.iata, a);
      this.results.set(res.airports);
      this.total.set(res.total);
    } catch {
      this.error.set('Seznama letališč ni bilo mogoče naložiti.');
    }
  }

  async loadNear(): Promise<void> {
    this.error.set(null);
    const radius = Number(this.radiusKm) || 150;
    try {
      const res = await this.api.airports({ near: this.nearCenter, radiusKm: radius, limit: 25 });
      for (const a of res.airports) this.known.set(a.iata, a);
      this.results.set(res.airports);
      this.total.set(res.total);
    } catch (err) {
      const detail = (err as { error?: { detail?: string } })?.error?.detail;
      this.error.set(typeof detail === 'string' ? detail : 'Letališč v radiju ni bilo mogoče naložiti.');
      this.results.set([]);
    }
  }

  add(airport: Airport): void {
    if (this.selected().includes(airport.iata) || this.selected().length >= this.max()) return;
    this.known.set(airport.iata, airport);
    this.selected.set([...this.selected(), airport.iata]);
  }

  remove(code: string): void {
    this.selected.set(this.selected().filter((c) => c !== code));
  }
}

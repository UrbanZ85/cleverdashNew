import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonList,
  IonItem,
  IonInput,
  IonSelect,
  IonSelectOption,
  IonButton,
  IonNote,
  IonText,
} from '@ionic/angular/standalone';
import {
  DEFAULT_MAP_HEIGHT_PX,
  MAX_MAP_HEIGHT_PX,
  MIN_MAP_HEIGHT_PX,
  SettingsStore,
  type CommuteLayout,
} from '../../core/settings/settings.store.js';
import { HelpButtonComponent } from '../../shared/help/help-button.component.js';
import type { HelpTopicId } from '../../shared/help/help-topics.js';
import {
  emptyPlaceForm,
  parseMapHeight,
  toPlaceForm,
  toPlacePatch,
  type CommutePlaceForm,
  type FormFieldValue,
} from './commute-form.js';

interface PlaceRow {
  key: 'home' | 'work';
  title: string;
  hint: string;
  help: HelpTopicId;
}

// Ploščica "Pot" ima dva kraja — "doma" in "služba". Smeri se iz njiju izpeljeta (pot domov
// je ista pot v nasprotni smeri), kdaj je katera zgoraj pa ni nastavitev: meja je poldne
// (features/dashboard/commute.model.ts).
const ROWS: PlaceRow[] = [
  {
    key: 'home',
    title: 'Doma',
    hint: 'Začetek poti v službo in cilj poti domov.',
    help: 'dashboard.commute',
  },
  {
    key: 'work',
    title: 'Služba',
    hint: 'Cilj poti v službo in začetek poti domov.',
    help: 'dashboard.commute',
  },
];

@Component({
  selector: 'app-commute-settings',
  standalone: true,
  imports: [
    FormsModule,
    HelpButtonComponent,
    IonList,
    IonItem,
    IonInput,
    IonSelect,
    IonSelectOption,
    IonButton,
    IonNote,
    IonText,
  ],
  template: `
    <p class="cd-section-hint">
      Ploščica “Pot” pokaže <strong>oba zemljevida</strong> — pot v službo in pot domov — s
      časom poti in zamudo zaradi prometa; zgoraj je tista, ki ustreza času dneva (do 12:00 v
      službo, pozneje domov). Nastaviti je treba samo kraja; pot domov je ista pot v
      nasprotni smeri.
    </p>

    @for (row of rows; track row.key) {
      <h3 class="place-title">
        {{ row.title }}
        <app-help [topic]="row.help"></app-help>
      </h3>
      <ion-note class="cd-section-hint">{{ row.hint }}</ion-note>

      <ion-list class="place" lines="full">
        <ion-item>
          <ion-input
            label="Ime"
            labelPlacement="stacked"
            [placeholder]="row.title"
            [(ngModel)]="values[row.key].label"
            [name]="row.key + '-label'"
          ></ion-input>
        </ion-item>
        <ion-item>
          <ion-input
            label="Naslov"
            labelPlacement="stacked"
            placeholder="npr. Dunajska cesta 1, Ljubljana"
            [(ngModel)]="values[row.key].address"
            [name]="row.key + '-address'"
          ></ion-input>
        </ion-item>
        <ion-item>
          <ion-input
            label="Zemljepisna širina"
            labelPlacement="stacked"
            type="number"
            inputmode="decimal"
            placeholder="46.062382"
            [(ngModel)]="values[row.key].latitude"
            [name]="row.key + '-lat'"
          ></ion-input>
          <ion-input
            label="Zemljepisna dolžina"
            labelPlacement="stacked"
            type="number"
            inputmode="decimal"
            placeholder="14.560178"
            [(ngModel)]="values[row.key].longitude"
            [name]="row.key + '-lon'"
          ></ion-input>
        </ion-item>
      </ion-list>
      <ion-note class="cd-section-hint coords-hint">
        Koordinati sta natančnejši od naslova (in cenejši, ker jih Googlu ni treba iskati) —
        dobiš ju z desnim klikom na točko v Google Zemljevidih. Vpiši ju obe ali nobene;
        kadar sta prazni, velja naslov.
      </ion-note>
    }

    <h3 class="place-title">Videz ploščice</h3>
    <ion-note class="cd-section-hint">Velja za oba zemljevida; ploščica se pri postavitvi “eden zraven drugega” samodejno razširi.</ion-note>

    <ion-list class="place" lines="full">
      <ion-item>
        <ion-select
          label="Postavitev"
          labelPlacement="stacked"
          interface="popover"
          [(ngModel)]="layout"
          name="commute-layout"
        >
          <ion-select-option value="vertical">Eden pod drugim</ion-select-option>
          <ion-select-option value="horizontal">Eden zraven drugega</ion-select-option>
        </ion-select>
      </ion-item>
      <ion-item>
        <ion-input
          label="Višina zemljevida (px)"
          labelPlacement="stacked"
          type="number"
          inputmode="numeric"
          [min]="minHeight"
          [max]="maxHeight"
          [(ngModel)]="mapHeightPx"
          name="commute-height"
        ></ion-input>
      </ion-item>
    </ion-list>
    <ion-note class="cd-section-hint coords-hint">
      Med {{ minHeight }} in {{ maxHeight }} slikovnimi točkami; privzeto {{ defaultHeight }}.
      Prazno polje pomeni privzeto vrednost.
    </ion-note>

    @if (saved()) {
      <ion-text color="success"><p class="message">Shranjeno.</p></ion-text>
    }
    @if (error(); as message) {
      <ion-text color="danger"><p class="message">{{ message }}</p></ion-text>
    }

    <ion-button expand="block" [disabled]="saving()" (click)="save()">
      {{ saving() ? 'Shranjujem ...' : 'Shrani nastavitve poti' }}
    </ion-button>
  `,
  styles: `
    .place-title {
      margin: var(--cd-space-4) 0 0;
      font-size: var(--cd-font-size-md);
      font-weight: 650;
      display: flex;
      align-items: center;
      gap: var(--cd-space-1);
    }
    .place-title:first-of-type {
      margin-top: 0;
    }
    .place {
      border: 1px solid var(--cd-divider);
      border-radius: var(--cd-radius-md);
      overflow: hidden;
      margin: var(--cd-space-2) 0 var(--cd-space-1);
    }
    .coords-hint {
      display: block;
      margin-bottom: var(--cd-space-3);
      line-height: 1.5;
    }
    .message {
      margin: var(--cd-space-2) 0;
      font-size: var(--cd-font-size-sm);
      line-height: 1.5;
    }
  `,
})
export class CommuteSettingsComponent implements OnInit {
  private readonly settings = inject(SettingsStore);

  protected readonly rows = ROWS;
  protected readonly minHeight = MIN_MAP_HEIGHT_PX;
  protected readonly maxHeight = MAX_MAP_HEIGHT_PX;
  protected readonly defaultHeight = DEFAULT_MAP_HEIGHT_PX;

  values: Record<'home' | 'work', CommutePlaceForm> = {
    home: emptyPlaceForm(),
    work: emptyPlaceForm(),
  };

  /** Videz ploščice. `ion-input type="number"` vrne število, `ion-select` pa niz — obe polji
   * gresta zato skozi isto pretvorbo kot kraja (commute-form.ts). */
  mapHeightPx: FormFieldValue = DEFAULT_MAP_HEIGHT_PX;
  layout: CommuteLayout = 'vertical';

  readonly saving = signal(false);
  readonly saved = signal(false);
  readonly error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    await this.settings.ensureLoaded();
    this.readFromStore();
  }

  async save(): Promise<void> {
    this.saving.set(true);
    this.saved.set(false);
    this.error.set(null);
    try {
      await this.settings.patch({
        commute: {
          home: toPlacePatch(this.values.home),
          work: toPlacePatch(this.values.work),
          // Prazno polje pomeni privzeto višino; vrednost izven mej strežnik zavrne s 400 in
          // sporočilo se pokaže spodaj (obrezovanja brez besede ne delamo).
          mapHeightPx: parseMapHeight(this.mapHeightPx),
          layout: this.layout,
        },
      });
      // Strežnik je merodajen (obrezana in preverjena vrednost) — polja se preberejo nazaj,
      // da uporabnik vidi, kaj je zares shranjeno.
      this.readFromStore();
      this.saved.set(true);
    } catch (err) {
      // Napaka se VEDNO tudi zabeleži v konzolo. Prva različica jo je samo prevedla v
      // sporočilo na zaslonu, in ko je bila vzrok napaka v pretvorbi (in ne odgovor
      // strežnika), je bilo sporočilo edini sled: v konzoli ni bilo ničesar, v omrežju pa
      // nobene zahteve. To je bila resnična napaka in razlog za obstoj commute-form.ts.
      console.error('Shranjevanje krajev je spodletelo:', err);
      const detail = (err as { error?: { detail?: unknown } } | null)?.error?.detail;
      this.error.set(typeof detail === 'string' ? detail : 'Krajev ni bilo mogoče shraniti.');
    } finally {
      this.saving.set(false);
    }
  }

  private readFromStore(): void {
    const commute = this.settings.commute();
    this.values = { home: toPlaceForm(commute.home), work: toPlaceForm(commute.work) };
    this.mapHeightPx = commute.mapHeightPx;
    this.layout = commute.layout;
  }
}

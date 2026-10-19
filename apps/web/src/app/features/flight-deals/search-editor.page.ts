import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  AlertController,
  IonButton,
  IonContent,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonNote,
  IonSegment,
  IonSegmentButton,
  IonSelect,
  IonSelectOption,
  IonText,
  IonToggle,
} from '@ionic/angular/standalone';
import { PageHeaderComponent } from '../../shared/layout/page-header.component.js';
import { HelpButtonComponent } from '../../shared/help/help-button.component.js';
import { AirportPickerComponent } from './airport-picker.component.js';
import { FlightRecipientsDialogComponent } from './recipients-dialog.component.js';
import { FlightDealsApi } from './flight-deals.api.js';
import {
  FLEX_PRESETS,
  WEEKDAYS,
  describeError,
  emptySearchForm,
  formFromSearch,
  quickValidate,
  toSearchInput,
  windowText,
  type Country,
  type FlexPreset,
  type FlightSearch,
  type SearchForm,
  type SearchPreview,
} from './flight-deals.model.js';

// Ustvari / uredi iskanje (US1, FR-002 do FR-013). Obrazec je NAVADEN OBJEKT in ne signal:
// `[(ngModel)]` piše vanj neposredno (vzorec 013). Validacija je imperativna v `save()` z ENIM
// sporočilom; strežnikovo sporočilo ima prednost. `:searchId = 'new'` je ustvarjanje in se ob prvem
// shranjevanju zamenja z id-jem brez menjave primerka (ista odločitev kot `notes/:noteId`).
//
// Predogled obdobja (FR-007) se osvežuje sproti prek `POST /searches/preview` z zamikom 400 ms —
// uporabnik vidi, KAJ bo sistem iskal, preden shrani.

@Component({
  selector: 'app-flight-search-editor-page',
  standalone: true,
  imports: [
    FormsModule,
    PageHeaderComponent,
    HelpButtonComponent,
    AirportPickerComponent,
    FlightRecipientsDialogComponent,
    IonContent,
    IonItem,
    IonInput,
    IonLabel,
    IonNote,
    IonText,
    IonButton,
    IonIcon,
    IonSegment,
    IonSegmentButton,
    IonSelect,
    IonSelectOption,
    IonToggle,
  ],
  template: `
    <app-page-header [title]="isNew() ? 'Novo iskanje' : 'Uredi iskanje'" backRoute="/flight-deals/searches" backLabel="Iskanja">
      <ion-button slot="end" (click)="save()" [disabled]="saving()">{{ saving() ? 'Shranjujem …' : 'Shrani' }}</ion-button>
    </app-page-header>

    <ion-content>
      <form class="page" (ngSubmit)="save()" (input)="schedulePreview()" (change)="schedulePreview()">
        <section>
          <ion-item>
            <ion-input label="Ime iskanja" labelPlacement="stacked" [(ngModel)]="form.name" name="name" placeholder="npr. Vikend v Londonu" maxlength="80"></ion-input>
          </ion-item>
          <ion-item lines="none">
            <ion-toggle [(ngModel)]="form.active" name="active">Aktivno — preverja se po urniku</ion-toggle>
          </ion-item>
        </section>

        <section>
          <h2 class="cd-section-title">Odhod <app-help topic="flightDeals.airports"></app-help></h2>
          <app-airport-picker [(selected)]="form.departureAirports" label="Odhodna letališča" emptyHint="Izberi vsaj eno odhodno letališče." [max]="10"></app-airport-picker>
        </section>

        <section>
          <h2 class="cd-section-title">Cilj <app-help topic="flightDeals.destination"></app-help></h2>
          <ion-segment [(ngModel)]="form.destinationMode" name="destinationMode">
            <ion-segment-button value="any"><ion-label>Kamor koli</ion-label></ion-segment-button>
            <ion-segment-button value="countries"><ion-label>Države</ion-label></ion-segment-button>
            <ion-segment-button value="airports"><ion-label>Letališča</ion-label></ion-segment-button>
          </ion-segment>
          @if (form.destinationMode === 'countries') {
            <ion-item>
              <ion-select label="Države" labelPlacement="stacked" [multiple]="true" [(ngModel)]="form.destinationCountries" name="destinationCountries" okText="V redu" cancelText="Prekliči">
                @for (c of countries(); track c.code) {
                  <ion-select-option [value]="c.code">{{ c.name }}</ion-select-option>
                }
              </ion-select>
            </ion-item>
          }
          @if (form.destinationMode === 'airports') {
            <app-airport-picker [(selected)]="form.destinationAirports" label="Ciljna letališča" emptyHint="Izberi vsaj eno ciljno letališče." [max]="50"></app-airport-picker>
          }
          <button type="button" class="advanced-head" (click)="showExcluded.set(!showExcluded())">
            <ion-icon [name]="showExcluded() ? 'chevron-down-outline' : 'chevron-forward-outline'" aria-hidden="true"></ion-icon>
            Izključene destinacije
          </button>
          @if (showExcluded()) {
            <ion-item>
              <ion-select label="Izključene države" labelPlacement="stacked" [multiple]="true" [(ngModel)]="form.excludedCountries" name="excludedCountries" okText="V redu" cancelText="Prekliči">
                @for (c of countries(); track c.code) {
                  <ion-select-option [value]="c.code">{{ c.name }}</ion-select-option>
                }
              </ion-select>
            </ion-item>
            <app-airport-picker [(selected)]="form.excludedAirports" label="Izključena letališča" emptyHint="Nobeno letališče ni izključeno." [max]="50"></app-airport-picker>
          }
        </section>

        <section>
          <h2 class="cd-section-title">Datumi <app-help topic="flightDeals.dates"></app-help></h2>
          <ion-segment [(ngModel)]="form.dateMode" name="dateMode">
            <ion-segment-button value="fixed"><ion-label>Točni datumi</ion-label></ion-segment-button>
            <ion-segment-button value="range"><ion-label>Obdobje</ion-label></ion-segment-button>
            <ion-segment-button value="rolling"><ion-label>Naslednjih N mesecev</ion-label></ion-segment-button>
          </ion-segment>
          @if (form.dateMode === 'fixed') {
            <div class="row">
              <ion-item><ion-input label="Odhod" labelPlacement="stacked" type="date" [(ngModel)]="form.departDate" name="departDate"></ion-input></ion-item>
              @if (!form.oneWay) {
                <ion-item><ion-input label="Povratek" labelPlacement="stacked" type="date" [(ngModel)]="form.returnDate" name="returnDate"></ion-input></ion-item>
              }
            </div>
          } @else if (form.dateMode === 'range') {
            <div class="row">
              <ion-item><ion-input label="Od" labelPlacement="stacked" type="date" [(ngModel)]="form.from" name="from"></ion-input></ion-item>
              <ion-item><ion-input label="Do" labelPlacement="stacked" type="date" [(ngModel)]="form.to" name="to"></ion-input></ion-item>
            </div>
          } @else {
            <ion-item><ion-input label="Mesecev vnaprej" labelPlacement="stacked" type="number" inputmode="numeric" min="1" max="12" [(ngModel)]="form.months" name="months"></ion-input></ion-item>
            <ion-note class="facts">Obdobje se izračuna ob vsakem preverjanju od tistega dne naprej.</ion-note>
          }

          @if (form.dateMode !== 'rolling') {
            <div class="label">Fleksibilnost <app-help topic="flightDeals.flex"></app-help></div>
            <div class="days">
              @for (preset of flexPresets; track preset) {
                <button type="button" class="day" [class.on]="form.flexPreset === preset" [attr.aria-pressed]="form.flexPreset === preset" (click)="setFlex(preset)">±{{ preset }}</button>
              }
              <button type="button" class="day" [class.on]="form.flexPreset === 'custom'" [attr.aria-pressed]="form.flexPreset === 'custom'" (click)="setFlex('custom')">Po meri</button>
            </div>
            @if (form.flexPreset === 'custom') {
              <ion-item><ion-input label="Dni na vsako stran" labelPlacement="stacked" type="number" inputmode="numeric" min="0" [(ngModel)]="form.flexCustom" name="flexCustom"></ion-input></ion-item>
            }
          }

          <ion-item lines="none">
            <ion-toggle [(ngModel)]="form.oneWay" name="oneWay">Enosmerno (brez povratka)</ion-toggle>
          </ion-item>
          @if (!form.oneWay) {
            <div class="row">
              <ion-item><ion-input label="Najmanj nočitev" labelPlacement="stacked" type="number" inputmode="numeric" min="0" [(ngModel)]="form.minNights" name="minNights"></ion-input></ion-item>
              <ion-item><ion-input label="Največ nočitev" labelPlacement="stacked" type="number" inputmode="numeric" min="0" [(ngModel)]="form.maxNights" name="maxNights"></ion-input></ion-item>
            </div>
            @if (form.dateMode === 'range') {
              <ion-item lines="none">
                <ion-toggle [(ngModel)]="form.returnWithinWindow" name="returnWithinWindow">Tudi povratek znotraj obdobja</ion-toggle>
              </ion-item>
            }
          }

          @if (preview(); as p) {
            <div class="preview" [class.warn]="p.truncated || p.dateCombinations === 0">
              <strong>Sistem bo iskal odhode {{ windowText(p.outboundWindow) }}</strong>
              @if (p.returnWindow) {
                <span>, povratke {{ windowText(p.returnWindow) }}</span>
              }
              <span>· {{ p.dateCombinations }} kombinacij datumov · {{ p.queries }} poizvedb na vir</span>
              @for (w of p.warnings; track w) {
                <ion-text color="warning"><p class="warning">{{ w }}</p></ion-text>
              }
            </div>
          } @else if (previewError(); as message) {
            <ion-text color="medium"><p class="warning">{{ message }}</p></ion-text>
          }
        </section>

        <section>
          <h2 class="cd-section-title">Dnevi in ure</h2>
          <div class="label">Odhod</div>
          <div class="days">
            @for (day of weekdays; track day.iso) {
              <button type="button" class="day" [class.on]="form.outboundWeekdays.includes(day.iso)" [attr.aria-pressed]="form.outboundWeekdays.includes(day.iso)" (click)="toggleDay(form.outboundWeekdays, day.iso)">{{ day.label }}</button>
            }
          </div>
          <div class="row">
            <ion-item><ion-input label="Odhod najprej ob" labelPlacement="stacked" type="time" [(ngModel)]="form.outboundEarliest" name="outboundEarliest"></ion-input></ion-item>
            <ion-item><ion-input label="Odhod najpozneje ob" labelPlacement="stacked" type="time" [(ngModel)]="form.outboundLatest" name="outboundLatest"></ion-input></ion-item>
          </div>
          <ion-note class="facts">Ure so v lokalnem času letališča. Brez izbranih dni velja kateri koli dan.</ion-note>
          @if (!form.oneWay) {
            <div class="label">Povratek</div>
            <div class="days">
              @for (day of weekdays; track day.iso) {
                <button type="button" class="day" [class.on]="form.inboundWeekdays.includes(day.iso)" [attr.aria-pressed]="form.inboundWeekdays.includes(day.iso)" (click)="toggleDay(form.inboundWeekdays, day.iso)">{{ day.label }}</button>
              }
            </div>
            <div class="row">
              <ion-item><ion-input label="Povratek najprej ob" labelPlacement="stacked" type="time" [(ngModel)]="form.inboundEarliest" name="inboundEarliest"></ion-input></ion-item>
              <ion-item><ion-input label="Povratek najpozneje ob" labelPlacement="stacked" type="time" [(ngModel)]="form.inboundLatest" name="inboundLatest"></ion-input></ion-item>
            </div>
            <ion-item><ion-input label="Najmanj ur na destinaciji" labelPlacement="stacked" type="number" inputmode="numeric" min="0" [(ngModel)]="form.minStayHours" name="minStayHours"></ion-input></ion-item>
          }
        </section>

        <section>
          <h2 class="cd-section-title">Potniki in cena</h2>
          <div class="row">
            <ion-item><ion-input label="Odrasli" labelPlacement="stacked" type="number" inputmode="numeric" min="1" max="9" [(ngModel)]="form.adults" name="adults"></ion-input></ion-item>
            <ion-item><ion-input label="Starosti otrok (npr. 4, 9)" labelPlacement="stacked" [(ngModel)]="form.childrenAgesText" name="childrenAgesText"></ion-input></ion-item>
          </div>
          <div class="row">
            <ion-item><ion-input label="Najvišja cena na osebo" labelPlacement="stacked" type="number" inputmode="decimal" min="1" [(ngModel)]="form.maxPerPerson" name="maxPerPerson"></ion-input></ion-item>
            <ion-item><ion-input label="Najvišja skupna cena" labelPlacement="stacked" type="number" inputmode="decimal" min="1" [(ngModel)]="form.maxTotal" name="maxTotal"></ion-input></ion-item>
            <ion-item><ion-input label="Valuta" labelPlacement="stacked" [(ngModel)]="form.currency" name="currency" maxlength="3"></ion-input></ion-item>
          </div>
          <ion-note class="facts">Cena je osnovna vozovnica, kot jo pokaže vir; prtljaga in dodatki običajno niso vključeni.</ion-note>
        </section>

        <section>
          <button type="button" class="advanced-head" (click)="showAdvanced.set(!showAdvanced())">
            <ion-icon [name]="showAdvanced() ? 'chevron-down-outline' : 'chevron-forward-outline'" aria-hidden="true"></ion-icon>
            Napredno (prestopi, prevozniki, prtljaga)
          </button>
          @if (showAdvanced()) {
            <ion-item>
              <ion-select label="Prestopi" labelPlacement="stacked" interface="popover" [(ngModel)]="form.maxStops" name="maxStops">
                <ion-select-option [value]="0">Samo direktni leti</ion-select-option>
                <ion-select-option [value]="1">Največ 1 prestop</ion-select-option>
                <ion-select-option [value]="2">Največ 2 prestopa</ion-select-option>
              </ion-select>
            </ion-item>
            <ion-item><ion-input label="Prevozniki (IATA kode, npr. FR, W6)" labelPlacement="stacked" [(ngModel)]="form.airlinesText" name="airlinesText"></ion-input></ion-item>
            <ion-item>
              <ion-select label="Prtljaga" labelPlacement="stacked" interface="popover" [(ngModel)]="form.baggage" name="baggage">
                <ion-select-option value="any">Ni pomembno</ion-select-option>
                <ion-select-option value="cabin">Ročna</ion-select-option>
                <ion-select-option value="checked">Oddana (kjer vir pove)</ion-select-option>
              </ion-select>
            </ion-item>
          }
        </section>

        @if (!isNew() && search(); as s) {
          <section>
            <h2 class="cd-section-title">Prejemniki obvestil <app-help topic="flightDeals.sharing"></app-help></h2>
            <ion-item lines="none" button detail="true" (click)="recipientsOpen.set(true)">
              <ion-icon slot="start" name="people-outline" aria-hidden="true"></ion-icon>
              <ion-label>
                <h3>{{ s.recipients.length === 0 ? 'Nihče drug' : recipientsText(s) }}</h3>
                <p>Dopise prejemaš ti in izbrane osebe.</p>
              </ion-label>
            </ion-item>
          </section>
        } @else if (isNew()) {
          <ion-note class="cd-section-hint">Prejemnike obvestil lahko dodaš, ko iskanje shraniš.</ion-note>
        }

        @if (error(); as message) {
          <ion-text color="danger"><p class="hint">{{ message }}</p></ion-text>
        }
        @if (saved()) {
          <ion-text color="success"><p class="hint">Shranjeno.</p></ion-text>
        }

        <div class="actions">
          <ion-button type="submit" [disabled]="saving()">{{ saving() ? 'Shranjujem …' : isNew() ? 'Ustvari iskanje' : 'Shrani spremembe' }}</ion-button>
          <ion-button fill="clear" type="button" (click)="cancel()">Prekliči</ion-button>
          @if (!isNew()) {
            <ion-button fill="clear" color="danger" type="button" (click)="confirmDelete()">Izbriši</ion-button>
          }
        </div>
      </form>
    </ion-content>

    @if (search(); as s) {
      <app-flight-recipients-dialog [search]="s" [isOpen]="recipientsOpen()" (closed)="recipientsOpen.set(false)" (changed)="onRecipientsChanged($event)"></app-flight-recipients-dialog>
    }
  `,
  styles: [
    `
      .page {
        padding: var(--cd-space-2) var(--cd-page-padding) var(--cd-space-6);
        max-width: 780px;
        margin: 0 auto;
      }
      section {
        background: var(--cd-surface);
        border: 1px solid var(--cd-divider);
        border-radius: var(--cd-radius-lg);
        padding: var(--cd-space-3) var(--cd-space-4);
        margin-bottom: var(--cd-space-3);
      }
      .cd-section-title {
        display: flex;
        align-items: center;
        gap: var(--cd-space-2);
        margin-top: 0;
      }
      .row {
        display: flex;
        flex-wrap: wrap;
        gap: var(--cd-space-2);
      }
      .row ion-item {
        flex: 1 1 180px;
      }
      .label {
        font-size: var(--cd-font-size-sm);
        color: var(--cd-text-muted);
        margin: var(--cd-space-3) 0 var(--cd-space-1);
        display: flex;
        align-items: center;
        gap: var(--cd-space-1);
      }
      .days {
        display: flex;
        flex-wrap: wrap;
        gap: var(--cd-space-1);
      }
      .day {
        min-width: 3rem;
        padding: 0.4rem 0.6rem;
        border: 1px solid var(--cd-divider);
        border-radius: 999px;
        background: var(--cd-surface-raised);
        color: var(--ion-text-color);
        font: inherit;
        cursor: pointer;
      }
      .day.on {
        background: var(--ion-color-primary);
        border-color: var(--ion-color-primary);
        color: var(--ion-color-primary-contrast);
      }
      .facts,
      .hint {
        display: block;
        font-size: var(--cd-font-size-sm);
        margin: var(--cd-space-1) 0;
      }
      .preview {
        margin-top: var(--cd-space-3);
        padding: var(--cd-space-2) var(--cd-space-3);
        border-radius: var(--cd-radius-md);
        background: rgba(var(--ion-color-primary-rgb), 0.08);
        font-size: var(--cd-font-size-sm);
      }
      .preview.warn {
        background: rgba(var(--ion-color-warning-rgb), 0.12);
      }
      .preview .warning {
        margin: var(--cd-space-1) 0 0;
      }
      .advanced-head {
        display: flex;
        align-items: center;
        gap: var(--cd-space-2);
        background: none;
        border: none;
        padding: var(--cd-space-2) 0;
        color: var(--ion-text-color);
        font: inherit;
        cursor: pointer;
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: var(--cd-space-2);
        align-items: center;
      }
    `,
  ],
})
export class FlightSearchEditorPage implements OnInit {
  private readonly api = inject(FlightDealsApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly alerts = inject(AlertController);

  form: SearchForm = emptySearchForm();
  readonly search = signal<FlightSearch | null>(null);
  readonly countries = signal<Country[]>([]);
  readonly preview = signal<SearchPreview | null>(null);
  readonly previewError = signal<string | null>(null);
  readonly saving = signal(false);
  readonly saved = signal(false);
  readonly error = signal<string | null>(null);
  readonly showAdvanced = signal(false);
  readonly showExcluded = signal(false);
  readonly recipientsOpen = signal(false);

  readonly weekdays = WEEKDAYS;
  readonly flexPresets = FLEX_PRESETS;
  readonly windowText = windowText;
  readonly isNew = computed(() => this.search() === null);

  private previewTimer: ReturnType<typeof setTimeout> | null = null;

  async ngOnInit(): Promise<void> {
    void this.api.countries().then((c) => this.countries.set(c)).catch(() => this.countries.set([]));
    const id = this.route.snapshot.paramMap.get('searchId');
    if (id && id !== 'new') {
      try {
        const search = await this.api.getSearch(id);
        this.search.set(search);
        this.form = formFromSearch(search);
        this.preview.set(search.preview);
      } catch (err) {
        this.error.set(describeError(err, 'Iskanja ni bilo mogoče naložiti.'));
      }
    } else {
      this.schedulePreview();
    }
  }

  setFlex(preset: FlexPreset): void {
    this.form.flexPreset = preset;
    this.schedulePreview();
  }

  toggleDay(list: number[], iso: number): void {
    const at = list.indexOf(iso);
    if (at >= 0) list.splice(at, 1);
    else list.push(iso);
    this.schedulePreview();
  }

  schedulePreview(): void {
    if (this.previewTimer) clearTimeout(this.previewTimer);
    this.previewTimer = setTimeout(() => void this.loadPreview(), 400);
  }

  private async loadPreview(): Promise<void> {
    if (quickValidate({ ...this.form, name: this.form.name || 'x' })) {
      this.preview.set(null);
      this.previewError.set(null);
      return;
    }
    try {
      this.preview.set(await this.api.preview(toSearchInput({ ...this.form, name: this.form.name || 'Predogled' })));
      this.previewError.set(null);
    } catch (err) {
      this.preview.set(null);
      this.previewError.set(describeError(err, 'Predogleda ni bilo mogoče izračunati.'));
    }
  }

  async save(): Promise<void> {
    this.error.set(null);
    this.saved.set(false);
    const quick = quickValidate(this.form);
    if (quick) {
      this.error.set(quick);
      return;
    }
    this.saving.set(true);
    try {
      const input = toSearchInput(this.form);
      const current = this.search();
      const saved = current ? await this.api.updateSearch(current.id, input) : await this.api.createSearch(input);
      const wasNew = current === null;
      this.search.set(saved);
      this.form = formFromSearch(saved);
      this.preview.set(saved.preview);
      this.saved.set(true);
      setTimeout(() => this.saved.set(false), 2500);
      if (wasNew) await this.router.navigate(['/flight-deals/searches', saved.id], { replaceUrl: true });
    } catch (err) {
      this.error.set(describeError(err, 'Iskanja ni bilo mogoče shraniti.'));
    } finally {
      this.saving.set(false);
    }
  }

  cancel(): void {
    void this.router.navigate(['/flight-deals/searches']);
  }

  async confirmDelete(): Promise<void> {
    const current = this.search();
    if (!current) return;
    const alert = await this.alerts.create({
      header: 'Izbrišem iskanje?',
      message: 'Iskanje in njegova ujemanja bodo izbrisana. Ponudbe drugih iskanj ostanejo.',
      buttons: [
        { text: 'Prekliči', role: 'cancel' },
        { text: 'Izbriši', role: 'destructive' },
      ],
    });
    await alert.present();
    const { role } = await alert.onDidDismiss();
    if (role !== 'destructive') return;
    try {
      await this.api.deleteSearch(current.id);
      await this.router.navigate(['/flight-deals/searches']);
    } catch (err) {
      this.error.set(describeError(err, 'Iskanja ni bilo mogoče izbrisati.'));
    }
  }

  recipientsText(s: FlightSearch): string {
    return s.recipients.map((r) => r.displayName).join(', ');
  }

  onRecipientsChanged(search: FlightSearch): void {
    this.search.set(search);
  }
}

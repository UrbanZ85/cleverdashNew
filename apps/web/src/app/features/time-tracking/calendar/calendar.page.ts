import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import {
  IonButton,
  IonContent,
  IonIcon,
  IonInput,
  IonSelect,
  IonSelectOption,
  IonText,
  IonNote,
  IonBadge,
  IonSpinner,
} from '@ionic/angular/standalone';
import { PageHeaderComponent } from '../../../shared/layout/page-header.component.js';
import { apiUrl } from '../../../core/api/api-base.js';
import { CalendarGridComponent, STATUS_LABELS, type CalendarCell } from './calendar-grid.component.js';
import {
  buildMonthCells,
  daysBetween,
  isoDate,
  isoWeekday,
  mergeDays,
  type MergedDay,
} from './month-cells.js';

interface CalendarDayResponse {
  localDate: string;
  profileId: string;
  status: string;
  reason: string;
  plannedActionCount: number;
}

interface PlannedActionResponse {
  id: string;
  localDate: string;
  profileId: string;
  locationId: string;
  actionName: string;
  baseLocalTime: string;
  state: string;
}

interface LocationOption {
  id: string;
  name: string;
  startAction: string;
}

/** Vrstica urejevalnika dneva. `time` je `HH:MM` za <input type="time">, strežnik pa hrani
 * `HH:MM:SS`. */
interface DayActionDraft {
  id: string;
  actionName: string;
  time: string;
  state: string;
  editable: boolean;
}

interface AbsenceResponse {
  id: string;
  type: 'vacation' | 'sick' | 'other';
  startDate: string;
  endDate: string;
  note: string | null;
  profileIds: string[];
  dayCount: number;
}

interface OverrideResponse {
  id: string;
  localDate: string;
  kind: 'forceWorkday' | 'forceNonWorking';
  profileId: string | null;
  note: string | null;
}

interface HolidayResponse {
  date: string;
  name: string;
  isWorkFree: boolean;
}

interface ProfileResponse {
  id: string;
  name: string;
  daysOfWeek: number[];
  active: boolean;
  locationId: string;
  actions: Array<{ actionName: string; localTime: string; enabled: boolean; order: number }>;
}

/** Stanja, ki jih strežnik še dovoli spreminjati (router.ts, `EDITABLE_STATES`). Izvedene
 * akcije so zapis o tem, kaj se je zgodilo, in ne urejevalnik (člen XII).
 *
 * `cancelled` strežnik sicer dovoli (potrebuje ga `Osveži po urniku`), tu pa je namenoma
 * izpuščen: preklicana akcija se ne bo izvedla in urejanje njene ure ničesar ne spremeni.
 * Take akcije v koledar sploh ne pridejo (glej filter v `reload()`); če bi kdaj prišle, se
 * pokažejo z značko stanja namesto z urejevalnim poljem. */
const EDITABLE_STATES = ['planned', 'due', 'skipped'];


const ZONE = 'Europe/Ljubljana';

const ABSENCE_LABELS: Record<AbsenceResponse['type'], string> = {
  vacation: 'Dopust',
  sick: 'Bolniška',
  other: 'Drugo',
};

/** Koledarski datum v Ljubljani, NE v UTC. Prejšnja različica te strani je uporabljala
 * `toISOString().slice(0, 10)`, kar je od 22:00 poleti (23:00 zimi) naprej vrnilo NASLEDNJI
 * dan — "danes" v koledarju se je zvečer premaknil. */
function ljubljanaToday(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: ZONE });
}

/** RFC 9457 `detail` iz odgovora strežnika (platform/errors/problem.ts), če ga je poslal. */
function problemDetail(err: unknown): string | null {
  const problem: unknown = err instanceof HttpErrorResponse ? err.error : null;
  return problem && typeof problem === 'object' && typeof (problem as { detail?: unknown }).detail === 'string'
    ? (problem as { detail: string }).detail
    : null;
}

// US5/US6/US7: koledarski pregled (FR-015) ter vnos odsotnosti in izrednega delovnega dne.
//
// Prej je bil ta zaslon navpičen seznam štirinajstih dni, datumi za odsotnost pa so se
// vpisovali v dve polji `<ion-input type="date">`. Dve stvari sta bili pri tem narobe:
//  - vnos je ob prazni ali samo delno izpolnjeni paru datumov TIHO odnehal (`if (!start ||
//    !end) return;`), zato pritisk na gumb ni naredil nič in ni ničesar povedal. En dan
//    dopusta ni bilo mogoče vnesti drugače kot z dvakrat istim datumom;
//  - napake strežnika so se prepisale z ugibanjem ("preveri, ali se datumi prekrivajo …"),
//    čeprav strežnik pošlje natančen `detail` z datumom, ki je v napoto.
// Datumi zato zdaj prihajajo IZ MREŽE (klik na dan, drugi klik naredi obdobje) — polj za
// tipkanje datuma ni več, ker mreža isto pove in hkrati pokaže, kaj bo iz tega sledilo.
@Component({
  selector: 'app-time-tracking-calendar-page',
  standalone: true,
  imports: [
    PageHeaderComponent,
    CalendarGridComponent,
    FormsModule,
    RouterLink,
    IonButton,
    IonContent,
    IonIcon,
    IonInput,
    IonSelect,
    IonSelectOption,
    IonText,
    IonNote,
    IonBadge,
    IonSpinner,
  ],
  template: `
    <app-page-header title="Koledar" subtitle="Beleženje časa" backRoute="/time-tracking" backLabel="Danes">
      <ion-button slot="end" routerLink="/time-tracking/schedule">Urnik</ion-button>
    </app-page-header>

    <ion-content class="ion-padding">
      <div class="month-bar">
        <ion-button fill="clear" aria-label="Prejšnji mesec" (click)="shiftMonth(-1)">
          <ion-icon name="chevron-back" slot="icon-only" aria-hidden="true"></ion-icon>
        </ion-button>
        <strong class="month-name">{{ monthLabel() }}</strong>
        <ion-button fill="clear" aria-label="Naslednji mesec" (click)="shiftMonth(1)">
          <ion-icon name="chevron-forward-outline" slot="icon-only" aria-hidden="true"></ion-icon>
        </ion-button>
        @if (loading()) {
          <ion-spinner name="dots"></ion-spinner>
        }
      </div>

      <!-- Privzeto so v mreži VSI aktivni urniki hkrati: dan, ki ga dela katerikoli od njih,
           je delovni dan. Izbira enega samega je zožitev, ne obratno. -->
      @if (profiles().length > 1) {
        <ion-select
          label="Urnik"
          labelPlacement="stacked"
          [value]="selectedProfileId() ?? ALL_PROFILES"
          (ionChange)="onProfileChange($event)"
        >
          <ion-select-option [value]="ALL_PROFILES">Vsi urniki</ion-select-option>
          @for (profile of profiles(); track profile.id) {
            <ion-select-option [value]="profile.id">{{ profile.name }}</ion-select-option>
          }
        </ion-select>
      }

      @if (profiles().length === 0) {
        <ion-note class="facts">
          Urnika še ni, zato koledar ne more vedeti, kateri dan je delovni — dneve prikaže brez
          statusa. Odsotnosti lahko vneseš že zdaj, veljale bodo takoj, ko urnik nastane
          (<a routerLink="/time-tracking/schedule">Urnik</a>).
        </ion-note>
      }

      <app-time-tracking-calendar-grid [weeks]="weeks()" (dayPicked)="pickDay($event)"></app-time-tracking-calendar-grid>

      <!-- Izbrani dan / obdobje in vse, kar se z njim da narediti. Isti blok za en dan in za
           obdobje — vnos enega dneva dopusta je bil prej nemogoč. -->
      @if (selectionStart(); as start) {
        <div class="selection">
          <div class="selection-head">
            <strong>
              @if (selectionEnd(); as end) {
                {{ start }} – {{ end }} ({{ selectedDates().length }} dni)
              } @else {
                {{ start }}
              }
            </strong>
            <ion-button size="small" fill="clear" (click)="clearSelection()">Počisti</ion-button>
          </div>

          @if (!selectionEnd()) {
            <ion-note class="facts">Klikni še en dan, če hočeš obdobje.</ion-note>
          }

          @if (selectedDayDetail(); as detail) {
            <ion-note class="facts">
              {{ statusLabel(detail.status) }} — {{ detail.reason }}
              @if (detail.profileName) {
                <br />Urnik: {{ detail.profileName }}
              }
            </ion-note>

            <!-- Urejanje velja za EN dan, zato je pri izbranem obdobju skrito: ista ura za pet
                 dni je urnik, ne izjema, in tam sodi. -->
            @if (!selectionEnd()) {
              @if (dayDraft().length > 0) {
                <div class="day-editor">
                  <span class="field-label">Ure tega dne</span>
                  @for (row of dayDraft(); track row.id) {
                    <div class="day-row">
                      <span class="day-action">{{ row.actionName }}</span>
                      <ion-input
                        class="day-time"
                        type="time"
                        aria-label="Ura"
                        [disabled]="!row.editable"
                        [(ngModel)]="row.time"
                      ></ion-input>
                      @if (!row.editable) {
                        <ion-badge color="medium">{{ row.state }}</ion-badge>
                      }
                    </div>
                  }

                  @if (locations().length > 1) {
                    <ion-select label="Lokacija tega dne" labelPlacement="stacked" [(ngModel)]="dayLocationId">
                      @for (location of locations(); track location.id) {
                        <ion-select-option [value]="location.id">{{ location.name }}</ion-select-option>
                      }
                    </ion-select>
                  }

                  <ion-note class="facts">
                    Te ure so iz NAČRTA tega dne, ne iz urnika. Načrt se ob nastanku zamrzne, da
                    ročni popravek preživi — zato sprememba urnika teh ur ne popravi. Z gumbom
                    “Osveži po urniku” jih zavržeš in sestaviš znova po trenutnem urniku.
                    <br />Sprememba velja samo za ta dan; urnik ostane nespremenjen. Lokacija
                    določa tudi gumb za začetek dela, zato se ta ob spremembi preimenuje
                    (FR-090). Ročno vpisana ura je brez raztrosa — izvede se točno takrat, kot piše.
                  </ion-note>

                  <div class="selection-actions">
                    <ion-button size="small" [disabled]="busy()" (click)="saveDay()">Shrani ta dan</ion-button>
                    <ion-button size="small" fill="outline" [disabled]="busy()" (click)="refreshDayFromSchedule()">
                      Osveži po urniku
                    </ion-button>
                  </div>
                </div>
              } @else if (detail.expected.length > 0) {
                <ion-note class="facts">
                  Predvideno po urniku: {{ detail.expected.join(', ') }}. Načrt za ta dan še ne
                  obstaja — sestavi se sam dan prej. Pripravi ga zdaj, če hočeš temu dnevu
                  spremeniti ure ali lokacijo.
                </ion-note>
                <ion-button size="small" fill="outline" [disabled]="busy()" (click)="prepareDay()">
                  Pripravi ta dan za urejanje
                </ion-button>
              } @else {
                <!-- Prej je tu ni bilo nič in dan je bil videti pokvarjen. Vsak razlog, zakaj
                     ur ni mogoče urejati, mora biti izpisan. -->
                <ion-note class="facts">
                  Ur tega dne ni mogoče urejati: {{ notEditableReason(detail.status) }}
                </ion-note>
              }
            }

            <!-- Izjema se je dala vnesti, ne pa odstraniti. Vsiljen delovni dan trajno zavrne
                 dopust na ta datum, zato mora biti tu tudi pot nazaj. -->
            @if (overrideOn(start); as override) {
              <div class="override">
                <ion-badge color="success">{{ overrideLabel(override.kind) }}</ion-badge>
                <span class="override-note">{{ override.note ?? 'brez opombe' }}</span>
                <ion-button size="small" fill="clear" color="danger" [disabled]="busy()" (click)="removeOverride(override)">
                  Odstrani
                </ion-button>
              </div>
            }
          }

          <div class="selection-actions">
            <ion-button size="small" [disabled]="busy()" (click)="submitAbsence('vacation')">Dopust</ion-button>
            <ion-button size="small" [disabled]="busy()" (click)="submitAbsence('sick')">Bolniška</ion-button>
            <ion-button size="small" [disabled]="busy()" (click)="submitAbsence('other')">Drugo</ion-button>
            <ion-button size="small" fill="outline" [disabled]="busy()" (click)="forceWorkday()">
              Vsili delovni dan
            </ion-button>
          </div>
        </div>
      } @else {
        <ion-note class="facts">Klikni dan v mreži, da vneseš dopust, bolniško ali izredni delovni dan.</ion-note>
      }

      @if (notice(); as message) {
        <ion-text [color]="message.ok ? 'success' : 'danger'"><p class="hint">{{ message.text }}</p></ion-text>
      }

      <h3>Vnesene odsotnosti</h3>
      @if (absences().length === 0) {
        <ion-note class="facts">Ni vnesenih odsotnosti.</ion-note>
      } @else {
        @for (absence of absences(); track absence.id) {
          <div class="absence">
            <ion-badge [color]="absenceColor(absence.type)">{{ absenceLabel(absence.type) }}</ion-badge>
            <span class="absence-range">
              @if (absence.startDate === absence.endDate) {
                {{ absence.startDate }}
              } @else {
                {{ absence.startDate }} – {{ absence.endDate }} ({{ absence.dayCount }} dni)
              }
            </span>
            <ion-button size="small" fill="clear" color="danger" [disabled]="busy()" (click)="deleteAbsence(absence)">
              Odstrani
            </ion-button>
          </div>
        }
      }

      @if (loadError()) {
        <ion-text color="danger">
          <p class="hint">Koledarja ni bilo mogoče naložiti. Preveri povezavo in poskusi znova.</p>
        </ion-text>
      }
    </ion-content>
  `,
  styles: `
    .month-bar {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--cd-space-2);
      margin-bottom: var(--cd-space-2);
    }
    .month-name {
      min-width: 10rem;
      text-align: center;
      text-transform: capitalize;
    }
    .selection {
      margin-top: var(--cd-space-3);
      padding: var(--cd-space-3) 0;
      border-top: 1px solid var(--cd-divider);
    }
    .selection-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--cd-space-2);
    }
    .selection-actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--cd-space-2);
      margin-top: var(--cd-space-2);
    }
    .day-editor {
      margin-top: var(--cd-space-2);
    }
    .field-label {
      display: block;
      margin-bottom: var(--cd-space-2);
      font-size: 0.8rem;
      opacity: 0.65;
    }
    .day-row {
      display: flex;
      align-items: center;
      gap: var(--cd-space-2);
      padding: var(--cd-space-1) 0;
    }
    .day-action {
      flex: 1;
      font-size: var(--cd-font-size-sm);
    }
    .day-time {
      flex: 0 0 7rem;
    }
    .override {
      display: flex;
      align-items: center;
      gap: var(--cd-space-2);
      margin-top: var(--cd-space-2);
      font-size: var(--cd-font-size-sm);
    }
    .override-note {
      flex: 1;
      opacity: 0.7;
    }
    .absence {
      display: flex;
      align-items: center;
      gap: var(--cd-space-2);
      padding: var(--cd-space-2) 0;
      border-top: 1px solid var(--cd-divider);
      font-size: var(--cd-font-size-sm);
    }
    .absence-range {
      flex: 1;
      font-variant-numeric: tabular-nums;
    }
    .facts {
      display: block;
      padding: var(--cd-space-2) 0;
      font-size: 0.8rem;
      line-height: 1.6;
    }
    .hint { font-size: 0.85rem; }
  `,
})
export class CalendarPage implements OnInit {
  private readonly http = inject(HttpClient);

  private readonly today = ljubljanaToday();

  /** Vrednost izbirnika za "vsi urniki" — `ion-select` ne loči `null` od "ni izbrano". */
  protected readonly ALL_PROFILES = 'all';

  readonly year = signal(Number(this.today.slice(0, 4)));
  /** 0-based, kot `Date.getUTCMonth()`. */
  readonly month = signal(Number(this.today.slice(5, 7)) - 1);

  readonly profiles = signal<ProfileResponse[]>([]);
  /** `null` = vsi urniki hkrati (privzeto). Izbran urnik zoži pogled na en sam. */
  readonly selectedProfileId = signal<string | null>(null);
  readonly days = signal<Record<string, MergedDay>>({});
  readonly plannedByDate = signal<Record<string, PlannedActionResponse[]>>({});
  readonly absences = signal<AbsenceResponse[]>([]);
  readonly holidays = signal<Record<string, HolidayResponse>>({});
  readonly locations = signal<LocationOption[]>([]);
  readonly overrides = signal<OverrideResponse[]>([]);

  /** Urejevalnik izbranega dneva. Nastane iz načrtovanih akcij tega dne — dokler načrta ni,
   * ni kaj urejati (glej `prepareDay`). */
  readonly dayDraft = signal<DayActionDraft[]>([]);
  dayLocationId = '';

  readonly selectionStart = signal<string | null>(null);
  readonly selectionEnd = signal<string | null>(null);

  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly loadError = signal(false);
  readonly notice = signal<{ ok: boolean; text: string } | null>(null);

  /** Vsi datumi izbire — en dan, če drugega klika še ni bilo. */
  readonly selectedDates = computed(() => {
    const start = this.selectionStart();
    if (!start) return [];
    return daysBetween(start, this.selectionEnd() ?? start);
  });

  /** Ure, ki jih urnik PREDVIDEVA za ta dan — načrt (PlannedAction) obstaja samo za danes in
   * jutri, naprej pa mora koledar vseeno pokazati, kaj se bo zgodilo. Urnik se vzame od
   * TISTEGA profila, ki ta dan dela: pri dveh urnikih (pon–sre in čet–pet) so ure različne. */
  private expectedTimesFor(date: string): string[] {
    const profileId = this.days()[date]?.profileId;
    const profile = this.profiles().find((p) => p.id === profileId);
    if (!profile) return [];
    return profile.actions
      .filter((a) => a.enabled)
      .map((a) => a.localTime.slice(0, 5))
      .sort();
  }

  /** Značka dneva: kje se ta dan beleži. Iz načrta, če obstaja (dan je lahko ročno preusmerjen
   * drugam), sicer iz urnika, ki dan pokriva. */
  private locationLabelFor(date: string): string | null {
    const planned = this.plannedByDate()[date];
    const locationId = planned?.[0]?.locationId ?? this.owningProfile(date)?.locationId;
    if (!locationId) return null;
    return this.locations().find((l) => l.id === locationId)?.name ?? null;
  }

  private owningProfile(date: string): ProfileResponse | undefined {
    const profileId = this.days()[date]?.profileId;
    return this.profiles().find((p) => p.id === profileId);
  }

  profileName(profileId: string | null): string {
    if (!profileId) return '';
    return this.profiles().find((p) => p.id === profileId)?.name ?? '';
  }

  readonly weeks = computed<CalendarCell[][]>(() => {
    const plannedMap = this.plannedByDate();
    const plannedTimes: Record<string, string[]> = {};
    for (const [date, actions] of Object.entries(plannedMap)) {
      plannedTimes[date] = actions.map((a) => a.baseLocalTime.slice(0, 5));
    }
    return buildMonthCells({
      year: this.year(),
      month: this.month(),
      today: this.today,
      statuses: this.days(),
      plannedTimes,
      expectedTimes: (date) => this.expectedTimesFor(date),
      locationLabel: (date) => this.locationLabelFor(date),
      fallback: (date) => this.fallbackStatus(date),
      selectionStart: this.selectionStart(),
      selectionEnd: this.selectionEnd(),
    });
  });

  /** Podrobnosti prvega izbranega dneva — pri obdobju bi bilo naštevanje vseh dni nepregledno,
   * pove pa isto: kaj je ta dan in kaj se na njem zgodi. */
  readonly selectedDayDetail = computed(() => {
    const date = this.selectionStart();
    if (!date) return null;
    const info = this.days()[date] ?? { ...this.fallbackStatus(date), profileId: null };
    return {
      status: info.status,
      reason: info.reason,
      profileName: this.profileName(info.profileId),
      actions: this.plannedByDate()[date] ?? [],
      expected: info.status === 'workday' || info.status === 'forced' ? this.expectedTimesFor(date) : [],
    };
  });

  monthLabel(): string {
    return new Date(Date.UTC(this.year(), this.month(), 1)).toLocaleDateString('sl-SI', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }

  statusLabel(status: string): string {
    return STATUS_LABELS[status] ?? status;
  }

  absenceLabel(type: AbsenceResponse['type']): string {
    return ABSENCE_LABELS[type];
  }

  absenceColor(type: AbsenceResponse['type']): string {
    return type === 'sick' ? 'danger' : type === 'vacation' ? 'primary' : 'medium';
  }

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  async shiftMonth(delta: number): Promise<void> {
    const next = new Date(Date.UTC(this.year(), this.month() + delta, 1));
    this.year.set(next.getUTCFullYear());
    this.month.set(next.getUTCMonth());
    await this.reload();
  }

  async onProfileChange(event: CustomEvent<{ value?: unknown }>): Promise<void> {
    const value = event.detail.value;
    if (typeof value !== 'string') return;
    this.selectedProfileId.set(value === this.ALL_PROFILES ? null : value);
    await this.reload();
  }

  pickDay(cell: CalendarCell): void {
    if (!cell.inMonth) return;
    this.notice.set(null);
    const start = this.selectionStart();
    if (start === null || this.selectionEnd() !== null) {
      this.selectionStart.set(cell.date);
      this.selectionEnd.set(null);
      this.syncDayDraft();
      return;
    }
    if (cell.date === start) {
      this.clearSelection();
      return;
    }
    // Drugi klik pred prvim pomeni obdobje nazaj — namesto zavrnitve se konca zamenjata.
    if (cell.date < start) {
      this.selectionStart.set(cell.date);
      this.selectionEnd.set(start);
    } else {
      this.selectionEnd.set(cell.date);
    }
    this.syncDayDraft();
  }

  clearSelection(): void {
    this.selectionStart.set(null);
    this.selectionEnd.set(null);
    this.syncDayDraft();
  }

  /** Osnutek se sestavi iz strežnikovega stanja, nikoli iz prejšnjega osnutka — po shranjevanju
   * ali osvežitvi mora kazati, kaj je RES zapisano, in ne, kaj je bilo natipkano. */
  private syncDayDraft(): void {
    const date = this.selectionStart();
    const single = date !== null && this.selectionEnd() === null;
    const actions = single ? (this.plannedByDate()[date] ?? []) : [];

    this.dayDraft.set(
      actions.map((a) => ({
        id: a.id,
        actionName: a.actionName,
        time: a.baseLocalTime.slice(0, 5),
        state: a.state,
        editable: EDITABLE_STATES.includes(a.state),
      })),
    );
    this.dayLocationId = actions[0]?.locationId ?? (date ? (this.owningProfile(date)?.locationId ?? '') : '');
  }

  /**
   * Zavrže še neizvedene akcije tega dne in jih sestavi znova po TRENUTNEM urniku.
   *
   * Potrebno je, ker je načrt dneva ob nastanku zamrznjen (`$setOnInsert`): sprememba urnika
   * dneva, ki je že načrtovan, ne doseže, in v koledarju ostanejo stare ure. Ročni popravki
   * tega dne se pri tem izgubijo — zato je to gumb in ne samodejno vedenje.
   */
  async refreshDayFromSchedule(): Promise<void> {
    const date = this.selectionStart();
    if (!date) return;

    this.busy.set(true);
    try {
      const result = await firstValueFrom(
        this.http.post<{ created: number; replaced: number; reason: string }>(
          apiUrl('/time-tracking/rebuild-plan'),
          { date, force: true },
          { withCredentials: true },
        ),
      );
      this.notice.set({
        ok: true,
        text:
          result.created > 0
            ? `Dan ${date} je osvežen po urniku: ${result.replaced} starih akcij zamenjanih z ${result.created} novimi.`
            : `Dan ${date} po urniku nima akcij — ${result.reason}.`,
      });
      await this.reload();
    } catch (err) {
      this.notice.set({ ok: false, text: problemDetail(err) ?? 'Dneva ni bilo mogoče osvežiti.' });
    } finally {
      this.busy.set(false);
    }
  }

  /** Načrt obstaja samo za danes in jutri (research.md §3). Za urejanje poljubnega dneva ga je
   * treba najprej materializirati — `POST /rebuild-plan` z datumom je natanko to in je
   * idempotenten, zato dvakratni klik ne podvoji ničesar. */
  async prepareDay(): Promise<void> {
    const date = this.selectionStart();
    if (!date) return;

    this.busy.set(true);
    try {
      await firstValueFrom(
        this.http.post(apiUrl('/time-tracking/rebuild-plan'), { date }, { withCredentials: true }),
      );
      await this.reload();
      this.notice.set(
        this.dayDraft().length > 0
          ? { ok: true, text: `Dan ${date} je pripravljen — ure in lokacijo lahko spremeniš spodaj.` }
          : { ok: false, text: `Za ${date} ni nastala nobena akcija. Preveri urnik in status dneva.` },
      );
    } catch (err) {
      this.notice.set({ ok: false, text: problemDetail(err) ?? 'Dneva ni bilo mogoče pripraviti.' });
    } finally {
      this.busy.set(false);
    }
  }

  /** Shrani samo to, kar se je RES spremenilo — vsak PATCH je pri strežniku svoj zapis in svoja
   * možnost zavrnitve (npr. trk imen ob zamenjavi lokacije), zato jih ne pošiljamo po nepotrebnem. */
  async saveDay(): Promise<void> {
    const date = this.selectionStart();
    if (!date) return;
    const current = this.plannedByDate()[date] ?? [];
    const byId = new Map(current.map((a) => [a.id, a]));

    const changes: Array<{ id: string; body: Record<string, unknown> }> = [];
    for (const row of this.dayDraft()) {
      if (!row.editable) continue;
      const server = byId.get(row.id);
      if (!server) continue;
      const body: Record<string, unknown> = {};
      if (/^([01]\d|2[0-3]):[0-5]\d$/.test(row.time) && row.time !== server.baseLocalTime.slice(0, 5)) {
        body.localTime = row.time;
      }
      if (this.dayLocationId && this.dayLocationId !== server.locationId) {
        body.locationId = this.dayLocationId;
      }
      if (Object.keys(body).length > 0) changes.push({ id: row.id, body });
    }

    if (changes.length === 0) {
      this.notice.set({ ok: true, text: 'Ni sprememb za shranjevanje.' });
      return;
    }

    this.busy.set(true);
    let done = 0;
    try {
      for (const change of changes) {
        await firstValueFrom(
          this.http.patch(apiUrl(`/time-tracking/planned-actions/${change.id}`), change.body, {
            withCredentials: true,
          }),
        );
        done += 1;
      }
      this.notice.set({ ok: true, text: `Dan ${date} je shranjen (${done} sprememb).` });
    } catch (err) {
      const detail = problemDetail(err) ?? 'Spremembe ni bilo mogoče shraniti.';
      this.notice.set({
        ok: false,
        text: done === 0 ? detail : `Shranjenih je bilo ${done} sprememb, nato: ${detail}`,
      });
    } finally {
      this.busy.set(false);
      await this.reload();
    }
  }

  async submitAbsence(type: AbsenceResponse['type']): Promise<void> {
    const dates = this.selectedDates();
    const start = dates[0];
    const end = dates[dates.length - 1];
    if (!start || !end) return;

    this.busy.set(true);
    try {
      await firstValueFrom(
        this.http.post(
          apiUrl('/time-tracking/absences'),
          { type, startDate: start, endDate: end },
          { withCredentials: true },
        ),
      );
      this.notice.set({
        ok: true,
        text: `${ABSENCE_LABELS[type]} vnesena za ${dates.length === 1 ? start : `${start} – ${end}`}. Načrtovane akcije v tem obdobju so preklicane.`,
      });
      this.clearSelection();
      await this.reload();
    } catch (err) {
      // Strežnik pove TOČEN datum, ki je v napoto (422, `assertNoForceWorkdayOverlap`) —
      // prej je bilo to sporočilo prepisano z ugibanjem in uporabnik ni vedel, kateri dan
      // popraviti.
      this.notice.set({ ok: false, text: problemDetail(err) ?? 'Vnosa ni bilo mogoče shraniti. Poskusi znova.' });
    } finally {
      this.busy.set(false);
    }
  }

  /** `POST /overrides` sprejme EN datum, zato gre obdobje skozi zanko. Prvi neuspeh ustavi
   * zanko — vztrajanje bi pustilo obdobje vsiljeno do polovice, brez sledi o tem, do kje. */
  async forceWorkday(): Promise<void> {
    const dates = this.selectedDates();
    if (dates.length === 0) return;

    this.busy.set(true);
    let done = 0;
    try {
      for (const localDate of dates) {
        await firstValueFrom(
          this.http.post(
            apiUrl('/time-tracking/overrides'),
            { localDate, kind: 'forceWorkday' },
            { withCredentials: true },
          ),
        );
        done += 1;
      }
      await this.rebuildPlan(dates);
      this.notice.set({
        ok: true,
        text:
          dates.length === 1
            ? `${dates[0]} je vsiljen kot delovni dan. Ure zanj lahko urediš spodaj.`
            : `Izredni delovni dan je vnesen za ${done} dni.`,
      });
      // Izbira OSTANE: vsiljen delovni dan skoraj vedno spremlja popravek ur, urejevalnik pa
      // se pokaže samo za izbrani dan.
      await this.reload();
    } catch (err) {
      const detail = problemDetail(err) ?? 'Vnosa ni bilo mogoče shraniti.';
      this.notice.set({
        ok: false,
        text: done === 0 ? detail : `Vnesenih je bilo ${done} dni, nato: ${detail}`,
      });
      await this.reload();
    } finally {
      this.busy.set(false);
    }
  }

  async deleteAbsence(absence: AbsenceResponse): Promise<void> {
    this.busy.set(true);
    try {
      await firstValueFrom(
        this.http.delete(apiUrl(`/time-tracking/absences/${absence.id}`), { withCredentials: true }),
      );
      // Brisanje odsotnosti načrta NE sestavi samo (router.ts, DELETE /absences) — brez tega
      // klica bi dan ostal brez akcij do naslednjega tika razporejevalnika. Pretekli dnevi
      // odsotnosti so mimo, zato se obnovijo samo tisti od danes naprej.
      await this.rebuildPlan(
        daysBetween(absence.startDate, absence.endDate).filter((d) => d >= this.today),
      );
      this.notice.set({ ok: true, text: `${ABSENCE_LABELS[absence.type]} (${absence.startDate}) je odstranjena.` });
      await this.reload();
    } catch (err) {
      this.notice.set({ ok: false, text: problemDetail(err) ?? 'Odstranitev ni uspela. Poskusi znova.' });
    } finally {
      this.busy.set(false);
    }
  }

  overrideOn(date: string): OverrideResponse | undefined {
    return this.overrides().find((o) => o.localDate === date);
  }

  overrideLabel(kind: OverrideResponse['kind']): string {
    return kind === 'forceWorkday' ? 'Izredni delovni dan' : 'Ročno označen prost dan';
  }

  /** Zakaj urejevalnika ni. Prej je bil na takem dnevu prazen prostor brez pojasnila, kar je
   * bilo videti kot okvara. */
  notEditableReason(status: string): string {
    if (status === 'unknown') return 'za ta dan ni urnika, ki bi ga pokrival.';
    if (status === 'weekend') return 'noben urnik ta dan ne dela. Če hočeš, da dela, vsili delovni dan.';
    return `dan ni delovni (${this.statusLabel(status)}). Najprej odstrani odsotnost ali vsili delovni dan.`;
  }

  async removeOverride(override: OverrideResponse): Promise<void> {
    this.busy.set(true);
    try {
      await firstValueFrom(
        this.http.delete(apiUrl(`/time-tracking/overrides/${override.id}`), { withCredentials: true }),
      );
      this.notice.set({
        ok: true,
        text: `Izjema za ${override.localDate} je odstranjena — dan je spet takšen, kot ga določa urnik.`,
      });
      await this.reload();
    } catch (err) {
      this.notice.set({ ok: false, text: problemDetail(err) ?? 'Izjeme ni bilo mogoče odstraniti.' });
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * `POST /rebuild-plan` brez `date` sestavi načrt za DANES, ne za dan, ki ga je klic zadeval.
   * Brez izrecnega datuma je vsiljen delovni dan v prihodnosti dobil izjemo, načrta pa ne —
   * dan je bil v mreži videti kot delovni, urejevalnik ur pa je ostal prazen, ker akcij ni
   * bilo. Datum je zato obvezen povsod, kjer vemo, katerega dne se sprememba tiče.
   *
   * `force: true`, ker to kliče samo tisti, ki je dan pravkar spremenil iz prostega v delovni
   * (odstranjena odsotnost, vsiljen delovni dan). Navaden `rebuild-plan` akcije samo doda
   * (`$setOnInsert`) — preklicane iz obdobja odsotnosti bi ostale `cancelled` in dan bi bil
   * videti delovni, zgodilo pa se ne bi nič. `force` jih zavrže in sestavi znova; izvedenih
   * in ročno vnesenih se ne dotakne (router.ts, `POST /rebuild-plan`).
   */
  private async rebuildPlan(dates: readonly string[]): Promise<void> {
    for (const date of dates) {
      try {
        await firstValueFrom(
          this.http.post(apiUrl('/time-tracking/rebuild-plan'), { date, force: true }, { withCredentials: true }),
        );
      } catch {
        // Načrt se sestavi tudi sam ob naslednjem tiku (scheduler-steps.ts) — neuspeh tu ni
        // razlog, da vnos ne bi obveljal.
      }
    }
  }

  private async reload(): Promise<void> {
    this.loading.set(true);
    const weeks = this.weeks();
    const first = weeks[0]?.[0]?.date ?? isoDate(this.year(), this.month(), 1);
    const last = weeks[weeks.length - 1]?.[6]?.date ?? isoDate(this.year(), this.month() + 1, 0);

    try {
      const [profiles, absences, holidays, planned, locations, overrides] = await Promise.all([
        firstValueFrom(this.http.get<ProfileResponse[]>(apiUrl('/time-tracking/profiles'), { withCredentials: true })),
        firstValueFrom(this.http.get<AbsenceResponse[]>(apiUrl('/time-tracking/absences'), { withCredentials: true })),
        firstValueFrom(
          this.http.get<HolidayResponse[]>(apiUrl(`/time-tracking/holidays?year=${this.year()}`), {
            withCredentials: true,
          }),
        ),
        firstValueFrom(
          this.http.get<PlannedActionResponse[]>(
            apiUrl(`/time-tracking/planned-actions?from=${first}&to=${last}`),
            { withCredentials: true },
          ),
        ),
        firstValueFrom(this.http.get<LocationOption[]>(apiUrl('/time-tracking/locations'), { withCredentials: true })),
        firstValueFrom(
          this.http.get<OverrideResponse[]>(apiUrl(`/time-tracking/overrides?from=${first}&to=${last}`), {
            withCredentials: true,
          }),
        ),
      ]);

      this.profiles.set(profiles);
      this.absences.set(absences);
      this.holidays.set(Object.fromEntries(holidays.map((h) => [h.date, h])));
      this.locations.set(locations);
      this.overrides.set(overrides);

      // Izbrani urnik obdrži veljavnost samo, dokler obstaja; sicer nazaj na "vsi".
      const selected = profiles.some((p) => p.id === this.selectedProfileId()) ? this.selectedProfileId() : null;
      this.selectedProfileId.set(selected);

      const visibleProfileIds = new Set(
        profiles.filter((p) => (selected ? p.id === selected : p.active)).map((p) => p.id),
      );

      // Načrtovane akcije so za VSE profile (endpoint filtra po profilu ne pozna).
      //
      // `cancelled` se izloči: to je akcija, ki se NE bo zgodila (dan je postal dela prost —
      // vnesen dopust, praznik, profil OFF). Dokler je bila v mreži, je dan dopusta kazal ure
      // preklicanega načrta in bil videti kot navaden delovni dan, urejevalnik pa je ponujal
      // urejanje ur, ki jih nihče ne bo pritisnil.
      const byDate: Record<string, PlannedActionResponse[]> = {};
      for (const action of planned.filter((a) => visibleProfileIds.has(a.profileId) && a.state !== 'cancelled')) {
        (byDate[action.localDate] ??= []).push(action);
      }
      for (const actions of Object.values(byDate)) actions.sort((a, b) => a.baseLocalTime.localeCompare(b.baseLocalTime));
      this.plannedByDate.set(byDate);

      // Status dneva zna izračunati samo strežnik (`resolveDayStatus`), in vedno za EN urnik —
      // odgovor je zato po ena vrstica na (dan, urnik). Združevanje v en dan je naloga
      // odjemalca (glej STATUS_RANK).
      const profileQuery = selected ? `&profileId=${selected}` : '';
      const rows = await firstValueFrom(
        this.http.get<CalendarDayResponse[]>(
          apiUrl(`/time-tracking/calendar?from=${first}&to=${last}${profileQuery}`),
          { withCredentials: true },
        ),
      );
      this.days.set(mergeDays(rows.filter((r) => visibleProfileIds.has(r.profileId))));
      this.loadError.set(false);
    } catch {
      this.loadError.set(true);
    } finally {
      this.loading.set(false);
      // Osnutek vedno iz sveže naloženega stanja — po shranjevanju mora kazati, kaj je RES
      // zapisano na strežniku.
      this.syncDayDraft();
    }
  }

  /** Nadomestni status, kadar urnika (in s tem odgovora `/calendar`) ni: pokaže vsaj to, kar od
   * profila ni odvisno — vneseno odsotnost, praznik in vikend. Brez tega bi bil koledar do
   * prvega urnika povsem prazen in vnesenega dopusta ne bi bilo nikjer videti. */
  private fallbackStatus(date: string): { status: string; reason: string } {
    const absence = this.absences().find((a) => a.startDate <= date && date <= a.endDate);
    if (absence) return { status: absence.type, reason: ABSENCE_LABELS[absence.type].toLowerCase() };

    const holiday = this.holidays()[date];
    if (holiday?.isWorkFree) return { status: 'holiday', reason: holiday.name };

    if (isoWeekday(date) >= 6) return { status: 'weekend', reason: 'vikend' };
    return { status: 'unknown', reason: 'urnika ni — status ni izračunan' };
  }
}

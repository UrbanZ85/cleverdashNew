import { Component, EventEmitter, Input, OnChanges, Output, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  IonItem,
  IonInput,
  IonSelect,
  IonSelectOption,
  IonToggle,
  IonButton,
  IonText,
  IonNote,
  IonIcon,
} from '@ionic/angular/standalone';
import { apiUrl } from '../../../core/api/api-base.js';

export interface ProfileActionValue {
  actionName: string;
  /** V obrazcu `HH:MM` (kar da `<input type="time">`); strežnik terja `HH:MM:SS`. */
  localTime: string;
  jitterSeconds: number;
  enabled: boolean;
}

export interface ProfileFormValue {
  id?: string;
  name: string;
  daysOfWeek: number[];
  locationId: string;
  mode: 'AUTO' | 'REMIND_ONLY' | 'OFF';
  actions: ProfileActionValue[];
  graceMinutes: number;
  maxDelayMinutes: number;
  maxAttempts: number;
  retryBackoffSeconds: number[];
  maxReminders: number;
  reminderIntervalMinutes: number;
  active: boolean;
}

export interface LocationOption {
  id: string;
  name: string;
  startAction: string;
}

/** ISO dnevi, 1 = ponedeljek … 7 = nedelja — enako kot `TrackingProfile.daysOfWeek` na
 * strežniku. NE `Date.getDay()`. */
const DAYS = [
  { iso: 1, label: 'pon' },
  { iso: 2, label: 'tor' },
  { iso: 3, label: 'sre' },
  { iso: 4, label: 'čet' },
  { iso: 5, label: 'pet' },
  { iso: 6, label: 'sob' },
  { iso: 7, label: 'ned' },
] as const;

// Imena akcij so imena GUMBOV na delodajalčevi strani; merodajen seznam je na strežniku v
// `apps/api/src/domain/clock-state.ts`. Napačno ime ne obstaja in bi akcija obvisela kot
// zamujena, zato je tu spustni seznam in ne prosto besedilo (enak razlog kot pri lokacijah,
// settings/time-tracking-locations.component.ts).
//
// Štiri različice začetka dela (`Prijava na delo`, `Prihod na delo`, `Delo od doma`,
// `Delo na terenu`) so tu ZLITE v en vnos: kateri gumb se res pritisne, določa LOKACIJA
// profila (FR-090, `resolveActionForLocation`), ne urnik. Če bi jih ponudili vse štiri, bi
// bila to izbira brez učinka — dve izbrani hkrati pa bi se ob sestavljanju načrta tiho
// zlili v isto ime in druga bi se zavrgla (schedule-builder.service.ts).
const ACTION_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'Prijava na delo', label: 'Začetek dela' },
  { value: 'Malica', label: 'Malica' },
  { value: 'Konec malice', label: 'Konec malice' },
  { value: 'Odmor med delom', label: 'Odmor med delom' },
  { value: 'Konec dela', label: 'Konec dela' },
];

const START_ACTIONS = ['Prijava na delo', 'Prihod na delo', 'Delo od doma', 'Delo na terenu'];

/** Privzeti delovnik za nov profil — brez tega se začne pri praznem seznamu in prvi urnik je
 * štirje ročni vnosi namesto enega popravka. */
function defaultActions(): ProfileActionValue[] {
  return [
    { actionName: 'Prijava na delo', localTime: '08:00', jitterSeconds: 300, enabled: true },
    { actionName: 'Malica', localTime: '12:00', jitterSeconds: 300, enabled: true },
    { actionName: 'Konec malice', localTime: '12:30', jitterSeconds: 300, enabled: true },
    { actionName: 'Konec dela', localTime: '16:00', jitterSeconds: 300, enabled: true },
  ];
}

export function emptyProfileValue(locationId = ''): ProfileFormValue {
  return {
    name: '',
    daysOfWeek: [1, 2, 3, 4, 5],
    locationId,
    mode: 'AUTO',
    actions: defaultActions(),
    graceMinutes: 10,
    maxDelayMinutes: 90,
    maxAttempts: 3,
    retryBackoffSeconds: [30, 120, 300],
    maxReminders: 3,
    reminderIntervalMinutes: 10,
    active: true,
  };
}

/** RFC 9457 `detail` iz odgovora strežnika (platform/errors/problem.ts), če ga je poslal. */
function problemDetail(err: unknown): string | null {
  const problem: unknown = err instanceof HttpErrorResponse ? err.error : null;
  return problem && typeof problem === 'object' && typeof (problem as { detail?: unknown }).detail === 'string'
    ? (problem as { detail: string }).detail
    : null;
}

// US2: obrazec za urniški profil — dodajanje IN urejanje, `profile` vhod odloči način (enak
// vzorec kot cameras/manage/camera-form.component.ts). Do zdaj profila ni bilo mogoče
// ustvariti drugače kot s klicem API-ja, čeprav so vse poti (`POST`/`PUT`/`DELETE`
// `/time-tracking/profiles`) obstajale ves čas — zaslon Urnik je znal samo brati.
@Component({
  selector: 'app-schedule-profile-form',
  standalone: true,
  imports: [
    FormsModule,
    IonItem,
    IonInput,
    IonSelect,
    IonSelectOption,
    IonToggle,
    IonButton,
    IonText,
    IonNote,
    IonIcon,
  ],
  template: `
    <ion-item>
      <ion-input label="Ime urnika" labelPlacement="stacked" placeholder="Delovni teden" [(ngModel)]="value.name"></ion-input>
    </ion-item>

    <div class="field">
      <span class="field-label">Dnevi v tednu</span>
      <div class="days">
        @for (day of days; track day.iso) {
          <button
            type="button"
            class="day"
            [class.on]="value.daysOfWeek.includes(day.iso)"
            [attr.aria-pressed]="value.daysOfWeek.includes(day.iso)"
            (click)="toggleDay(day.iso)"
          >
            {{ day.label }}
          </button>
        }
      </div>
      <ion-note class="facts">
        Dva AKTIVNA urnika se ne smeta prekrivati v dnevih — za posebno soboto uporabi izjemo
        v Koledarju, ne drugega urnika za iste dni.
      </ion-note>
    </div>

    <ion-item>
      <ion-select label="Lokacija" labelPlacement="stacked" [(ngModel)]="value.locationId">
        @for (location of locations; track location.id) {
          <ion-select-option [value]="location.id">{{ location.name }}</ion-select-option>
        }
      </ion-select>
    </ion-item>
    @if (selectedLocation(); as location) {
      <ion-note class="facts">
        Začetek dela bo na tej lokaciji pritisnil gumb “{{ location.startAction }}”. Gumb je
        lastnost lokacije, ne urnika — isti urnik iz pisarne, od doma ali s terena pritisne
        drug gumb, časi pa ostanejo isti.
      </ion-note>
    }

    <ion-item>
      <ion-select label="Način" labelPlacement="stacked" [(ngModel)]="value.mode">
        <ion-select-option value="AUTO">Samodejno — akcije se izvedejo same</ion-select-option>
        <ion-select-option value="REMIND_ONLY">Samo opozarjanje — pritisneš ročno</ion-select-option>
        <ion-select-option value="OFF">Izklopljeno</ion-select-option>
      </ion-select>
    </ion-item>

    <div class="field">
      <span class="field-label">Akcije čez dan</span>
      @for (action of value.actions; track $index) {
        <div class="action-row">
          <ion-select
            class="action-name"
            label="Akcija"
            labelPlacement="stacked"
            interface="popover"
            [(ngModel)]="action.actionName"
          >
            @for (option of actionOptions(); track option.value) {
              <ion-select-option [value]="option.value">{{ option.label }}</ion-select-option>
            }
          </ion-select>
          <ion-input
            class="action-time"
            label="Ura"
            labelPlacement="stacked"
            type="time"
            [(ngModel)]="action.localTime"
          ></ion-input>
          <ion-input
            class="action-jitter"
            label="Raztros (s)"
            labelPlacement="stacked"
            type="number"
            [(ngModel)]="action.jitterSeconds"
          ></ion-input>
          <ion-button fill="clear" color="danger" aria-label="Odstrani akcijo" (click)="removeAction($index)">
            <ion-icon name="trash-outline" slot="icon-only" aria-hidden="true"></ion-icon>
          </ion-button>
        </div>
      }
      <ion-button size="small" fill="outline" (click)="addAction()">
        <ion-icon name="add-outline" slot="start" aria-hidden="true"></ion-icon>
        Dodaj akcijo
      </ion-button>
      <ion-note class="facts">
        Raztros je naključni zamik okoli vpisane ure (±, v sekundah) — pri 300 s se akcija
        sproži nekje v petih minutah okoli nje, da vpisi niso vsak dan na isto sekundo.
        Vrstni red se ob shranjevanju uredi po uri.
      </ion-note>
    </div>

    <ion-item>
      <ion-toggle [(ngModel)]="value.active">Aktiven</ion-toggle>
    </ion-item>

    <button type="button" class="advanced-head" (click)="showAdvanced.set(!showAdvanced())">
      <ion-icon [name]="showAdvanced() ? 'chevron-down-outline' : 'chevron-forward-outline'" aria-hidden="true"></ion-icon>
      Napredno (zamude, ponovni poskusi, opomniki)
    </button>
    @if (showAdvanced()) {
      <ion-item>
        <ion-input label="Dopustna zamuda (min)" labelPlacement="stacked" type="number" [(ngModel)]="value.graceMinutes"></ion-input>
      </ion-item>
      <ion-item>
        <ion-input label="Največja zamuda (min)" labelPlacement="stacked" type="number" [(ngModel)]="value.maxDelayMinutes"></ion-input>
      </ion-item>
      <ion-item>
        <ion-input label="Največ poskusov" labelPlacement="stacked" type="number" [(ngModel)]="value.maxAttempts"></ion-input>
      </ion-item>
      <ion-item>
        <ion-input
          label="Premori med poskusi (s, ločeni z vejico)"
          labelPlacement="stacked"
          [(ngModel)]="retryBackoffText"
        ></ion-input>
      </ion-item>
      <ion-item>
        <ion-input label="Največ opomnikov" labelPlacement="stacked" type="number" [(ngModel)]="value.maxReminders"></ion-input>
      </ion-item>
      <ion-item>
        <ion-input label="Razmik med opomniki (min)" labelPlacement="stacked" type="number" [(ngModel)]="value.reminderIntervalMinutes"></ion-input>
      </ion-item>
    }

    @if (error(); as message) {
      <ion-text color="danger"><p class="hint">{{ message }}</p></ion-text>
    }

    <div class="actions">
      <ion-button [disabled]="saving()" (click)="save()">
        {{ saving() ? 'Shranjujem …' : (isEditMode() ? 'Shrani spremembe' : 'Ustvari urnik') }}
      </ion-button>
      <ion-button fill="clear" (click)="cancelled.emit()">Prekliči</ion-button>
    </div>
  `,
  styles: `
    .field {
      padding: var(--cd-space-3) var(--cd-space-2);
    }
    .field-label {
      display: block;
      margin-bottom: var(--cd-space-2);
      font-size: 0.8rem;
      opacity: 0.65;
    }
    .days {
      display: flex;
      flex-wrap: wrap;
      gap: var(--cd-space-2);
    }
    .day {
      min-width: 3rem;
      padding: 0.4rem 0.6rem;
      border: 1px solid var(--cd-divider);
      border-radius: 999px;
      background: none;
      color: inherit;
      font: inherit;
      cursor: pointer;
    }
    .day.on {
      background: var(--ion-color-primary);
      border-color: var(--ion-color-primary);
      color: var(--ion-color-primary-contrast);
    }
    .action-row {
      display: flex;
      align-items: end;
      gap: var(--cd-space-2);
      padding: var(--cd-space-2) 0;
      border-top: 1px solid var(--cd-divider);
    }
    .action-row:first-of-type {
      border-top: 0;
    }
    .action-name { flex: 2 1 8rem; }
    .action-time { flex: 1 1 6rem; }
    .action-jitter { flex: 1 1 5rem; }
    .advanced-head {
      display: flex;
      align-items: center;
      gap: var(--cd-space-2);
      width: 100%;
      padding: var(--cd-space-3) var(--cd-space-2);
      background: none;
      border: 0;
      border-top: 1px solid var(--cd-divider);
      color: inherit;
      font: inherit;
      text-align: left;
      cursor: pointer;
    }
    .facts {
      display: block;
      padding: var(--cd-space-2);
      font-size: 0.8rem;
    }
    .hint { font-size: 0.85rem; }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--cd-space-2);
      margin-top: var(--cd-space-3);
    }
  `,
})
export class ScheduleProfileFormComponent implements OnChanges {
  @Input() profile: ProfileFormValue | null = null;
  @Input() locations: LocationOption[] = [];
  @Output() saved = new EventEmitter<string>();
  @Output() cancelled = new EventEmitter<void>();

  private readonly http = inject(HttpClient);

  protected readonly days = DAYS;

  value: ProfileFormValue = emptyProfileValue();
  retryBackoffText = '30, 120, 300';

  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly showAdvanced = signal(false);

  ngOnChanges(): void {
    this.value = this.profile
      ? {
          ...this.profile,
          daysOfWeek: [...this.profile.daysOfWeek],
          actions: this.profile.actions.map((a) => ({ ...a })),
        }
      : emptyProfileValue(this.locations[0]?.id ?? '');
    this.retryBackoffText = this.value.retryBackoffSeconds.join(', ');
    this.error.set(null);
  }

  isEditMode(): boolean {
    return this.profile !== null;
  }

  selectedLocation(): LocationOption | undefined {
    return this.locations.find((l) => l.id === this.value.locationId);
  }

  /** Profil, ki so mu akcijo vpisali prek API-ja z drugo različico začetka dela (ali z imenom,
   * ki ga ta seznam ne pozna), sicer ob odprtju obrazca ne bi imel izbrane nobene možnosti in
   * bi se mu vrednost ob prvem shranjevanju tiho spremenila. */
  actionOptions(): ReadonlyArray<{ value: string; label: string }> {
    const known = new Set(ACTION_OPTIONS.map((o) => o.value));
    const extra = this.value.actions
      .map((a) => a.actionName)
      .filter((name) => name && !known.has(name))
      .map((name) => ({
        value: name,
        label: START_ACTIONS.includes(name) ? `Začetek dela (${name})` : name,
      }));
    return [...ACTION_OPTIONS, ...new Map(extra.map((o) => [o.value, o])).values()];
  }

  toggleDay(iso: number): void {
    const days = this.value.daysOfWeek;
    const at = days.indexOf(iso);
    if (at >= 0) days.splice(at, 1);
    else days.push(iso);
  }

  addAction(): void {
    this.value.actions.push({ actionName: 'Konec dela', localTime: '16:00', jitterSeconds: 300, enabled: true });
  }

  removeAction(index: number): void {
    this.value.actions.splice(index, 1);
  }

  async save(): Promise<void> {
    const body = this.buildBody();
    if (!body) return;

    this.saving.set(true);
    this.error.set(null);
    try {
      const saved = await firstValueFrom(
        this.profile?.id
          ? this.http.put<{ id: string }>(apiUrl(`/time-tracking/profiles/${this.profile.id}`), body, {
              withCredentials: true,
            })
          : this.http.post<{ id: string }>(apiUrl('/time-tracking/profiles'), body, { withCredentials: true }),
      );
      this.saved.emit(saved.id);
    } catch (err) {
      // 422 je prekrivanje dni (router.ts, `assertNoOverlap`) — `detail` pove IME urnika, ki
      // dan že pokriva, kar je edino, s čimer si uporabnik lahko pomaga. 400 je Zodova
      // zavrnitev oblike in bi bila brez razlikovanja videti enako kot izpad povezave.
      const detail = problemDetail(err);
      if (err instanceof HttpErrorResponse && err.status === 422 && detail) {
        this.error.set(detail);
      } else if (err instanceof HttpErrorResponse && err.status === 400) {
        this.error.set('Vnos ni v pravi obliki — preveri ure in številke.');
      } else {
        this.error.set('Shranjevanje ni uspelo. Poskusi znova.');
      }
    } finally {
      this.saving.set(false);
    }
  }

  /** Preveri vnos in sestavi telo zahteve, ali pa nastavi napako in vrne `null`. Vse, kar je
   * tu preverjeno, strežnik zavrne s 400 brez imena polja — torej s sporočilom, iz katerega
   * uporabnik ne more razbrati, kaj popraviti. */
  private buildBody(): Record<string, unknown> | null {
    if (!this.value.name.trim()) {
      this.error.set('Ime urnika je obvezno.');
      return null;
    }
    if (this.value.daysOfWeek.length === 0) {
      this.error.set('Izberi vsaj en dan v tednu.');
      return null;
    }
    if (!this.value.locationId) {
      this.error.set('Izberi lokacijo.');
      return null;
    }
    if (this.value.actions.length === 0) {
      this.error.set('Urnik brez akcij ne naredi ničesar — dodaj vsaj začetek in konec dela.');
      return null;
    }
    for (const action of this.value.actions) {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(action.localTime)) {
        this.error.set(`Ura za “${action.actionName}” ni vpisana.`);
        return null;
      }
    }
    // Dve akciji z istim imenom bi se ob sestavljanju načrta TIHO zlili v eno (edinstveni
    // indeks na (localDate, profileId, actionName), schedule-builder.service.ts) — druga bi
    // izginila brez sledi. Povemo tu, kjer se to da popraviti.
    const names = this.value.actions.map((a) => a.actionName);
    const duplicate = names.find((name, i) => names.indexOf(name) !== i);
    if (duplicate) {
      this.error.set(`Akcija “${duplicate}” je v urniku dvakrat — vsaka sme biti največ enkrat na dan.`);
      return null;
    }

    const retryBackoffSeconds = this.retryBackoffText
      .split(',')
      .map((part) => Number(part.trim()))
      .filter((n) => Number.isInteger(n) && n >= 0);
    if (retryBackoffSeconds.length === 0) {
      this.error.set('Premori med poskusi morajo biti cela števila, ločena z vejico.');
      return null;
    }

    // Vrstni red po uri: `actionOrder` iz njega gre v načrt in od tam v zgodovino, zato mora
    // ustrezati zaporedju dneva, ne zaporedju vpisovanja v obrazec.
    const actions = [...this.value.actions]
      .sort((a, b) => a.localTime.localeCompare(b.localTime))
      .map((action, index) => ({
        actionName: action.actionName,
        localTime: `${action.localTime}:00`,
        jitterSeconds: Number(action.jitterSeconds) || 0,
        order: index,
        enabled: action.enabled,
      }));

    return {
      name: this.value.name.trim(),
      daysOfWeek: [...this.value.daysOfWeek].sort((a, b) => a - b),
      locationId: this.value.locationId,
      mode: this.value.mode,
      actions,
      graceMinutes: Number(this.value.graceMinutes) || 10,
      maxDelayMinutes: Number(this.value.maxDelayMinutes) || 90,
      maxAttempts: Number(this.value.maxAttempts) || 3,
      retryBackoffSeconds,
      maxReminders: Number(this.value.maxReminders) || 3,
      reminderIntervalMinutes: Number(this.value.reminderIntervalMinutes) || 10,
      active: this.value.active,
    };
  }
}

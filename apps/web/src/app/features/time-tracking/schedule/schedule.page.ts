import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import {
  IonContent,
  IonList,
  IonItem,
  IonLabel,
  IonSelect,
  IonSelectOption,
  IonButton,
  IonIcon,
  IonBadge,
  IonText,
  IonNote,
  IonToggle,
} from '@ionic/angular/standalone';
import { PageHeaderComponent } from '../../../shared/layout/page-header.component.js';
import { apiUrl } from '../../../core/api/api-base.js';
import {
  ScheduleProfileFormComponent,
  type LocationOption,
  type ProfileFormValue,
} from './profile-form.component.js';

interface TrackingProfile {
  id: string;
  name: string;
  daysOfWeek: number[];
  locationId: string;
  locationName?: string;
  mode: 'AUTO' | 'REMIND_ONLY' | 'OFF';
  actions: Array<{ actionName: string; localTime: string; jitterSeconds: number; order: number; enabled: boolean }>;
  graceMinutes: number;
  maxDelayMinutes: number;
  maxAttempts: number;
  retryBackoffSeconds: number[];
  maxReminders: number;
  reminderIntervalMinutes: number;
  active: boolean;
}

interface PreviewResponse {
  localDate: string;
  dayStatus: string;
  reason: string;
  actions: Array<{ actionName: string; baseLocalTime: string; scheduledAt: string }>;
}

interface RebuildResponse {
  created: number;
  skipped: number;
  replaced?: number;
  dayStatus: string;
  reason: string;
}

/** Dve stikali: `SCHEDULER_ENABLED` v okolju (namestitev) in osebno stikalo uporabnika.
 * Strežnik ju vrne LOČENO — samo skupni izid bi pomenil, da uporabnik ob izklopljenem
 * schedulerju ne ve, zakaj njegovo vklopljeno stikalo ne naredi ničesar. */
interface AutomationState {
  schedulerEnabled: boolean;
  userEnabled: boolean;
  effective: boolean;
  changedAt: string | null;
  cancelled?: number;
  rebuilt?: number;
}

const DAY_NAMES = ['', 'pon', 'tor', 'sre', 'čet', 'pet', 'sob', 'ned'];

const MODE_LABEL: Record<TrackingProfile['mode'], string> = {
  AUTO: 'samodejno',
  REMIND_ONLY: 'samo opozarjanje',
  OFF: 'izklopljeno',
};

// US2: pregled IN urejanje urnikov. Prej je ta zaslon znal samo brati in preklopiti način —
// profil je bilo mogoče ustvariti izključno s klicem API-ja, kar je pomenilo, da je bilo
// beleženje časa iz same aplikacije nemogoče nastaviti. Poti so obstajale ves čas, manjkal je
// obrazec (profile-form.component.ts).
@Component({
  selector: 'app-time-tracking-schedule-page',
  standalone: true,
  imports: [
    PageHeaderComponent,
    ScheduleProfileFormComponent,
    RouterLink,
    IonContent,
    IonList,
    IonItem,
    IonLabel,
    IonSelect,
    IonSelectOption,
    IonButton,
    IonIcon,
    IonBadge,
    IonText,
    IonNote,
    IonToggle,
  ],
  template: `
    <app-page-header
      title="Urnik"
      subtitle="Beleženje časa"
      backRoute="/time-tracking"
      backLabel="Danes"
    >
      @if (locations().length > 0 && !creating()) {
        <ion-button slot="end" (click)="startCreate()">
          <ion-icon name="add-outline" slot="start" aria-hidden="true"></ion-icon>
          Nov urnik
        </ion-button>
      }
    </app-page-header>

    <ion-content class="ion-padding">
      <!-- Osebno stikalo stoji NAD urniki, ker velja za vse hkrati. Prikazani sta obe
           stanji: brez tega bi bilo ob izklopljenem schedulerju namestitve videti, kot da
           je vklopljeno stikalo pokvarjeno. -->
      @if (automation(); as state) {
        <div class="automation" [class.on]="state.effective">
          <ion-toggle
            [checked]="state.userEnabled"
            [disabled]="togglingAutomation()"
            (ionChange)="onAutomationToggle($event)"
          >
            Izvajaj moje urnike samodejno
          </ion-toggle>
          @if (!state.schedulerEnabled) {
            <ion-note class="facts" color="warning">
              Samodejno izvajanje je izklopljeno za celotno namestitev
              (<code>SCHEDULER_ENABLED=false</code>), zato se tudi ob vklopljenem stikalu ne bo
              izvedlo nič. Uredi skrbnik strežnika.
            </ion-note>
          } @else if (!state.userEnabled) {
            <ion-note class="facts">
              Urniki so shranjeni, a se ne izvajajo — nič se ne bo kliknilo. Vklopi, ko hočeš,
              da beleženje teče samo.
            </ion-note>
          } @else {
            <ion-note class="facts">
              Urniki se izvajajo samodejno. Izklop takoj prekliče še neizvedene akcije za danes.
            </ion-note>
          }
        </div>
      }

      <!-- Urnik brez lokacije ni mogoč (locationId je obvezen) — brez tega namiga je prazen
           spustni seznam v obrazcu slepa ulica brez pojasnila, kam sploh iti. -->
      @if (locations().length === 0) {
        <ion-text>
          <p>
            Najprej dodaj lokacijo beleženja v <a routerLink="/settings">Nastavitvah</a>,
            razdelek “Beleženje časa”. Urnik pove KDAJ, lokacija pa KJE in na kateri gumb —
            brez nje urnika ni mogoče shraniti.
          </p>
        </ion-text>
      } @else {
        @if (profiles().length === 0 && !creating()) {
          <ion-text>
            <p>
              Urnika še ni. Urnik pove, ob katerih urah se ob izbranih dnevih same izvedejo
              akcije (prijava, malica, konec dela).
            </p>
          </ion-text>
          <ion-button expand="block" (click)="startCreate()">Ustvari prvi urnik</ion-button>
        }

        <ion-list>
          @for (profile of profiles(); track profile.id) {
            <div class="profile">
              <button type="button" class="head" (click)="toggle(profile.id)" [attr.aria-expanded]="isOpen(profile.id)">
                <ion-icon
                  [name]="isOpen(profile.id) ? 'chevron-down-outline' : 'chevron-forward-outline'"
                  aria-hidden="true"
                ></ion-icon>
                <strong>{{ profile.name }}</strong>
                <span class="sub">
                  {{ formatDays(profile.daysOfWeek) }} · {{ profile.locationName ?? 'brez lokacije' }} ·
                  {{ formatActions(profile.actions) }}
                </span>
                @if (!profile.active) {
                  <ion-badge color="medium">neaktiven</ion-badge>
                }
              </button>

              @if (isOpen(profile.id)) {
                <!-- Vrednost obrazca se vzame iz pripravljene preslikave, NE iz klica metode
                     v predlogi: klic bi ob vsakem preverjanju sprememb vrnil nov predmet,
                     ngOnChanges obrazca bi se sprožil in vnos bi se sproti brisal. -->
                @if (formValues()[profile.id]; as formValue) {
                  <app-schedule-profile-form
                    [profile]="formValue"
                    [locations]="locations()"
                    (saved)="onSaved($event)"
                    (cancelled)="toggle(profile.id)"
                  ></app-schedule-profile-form>
                }

                <div class="actions">
                  <ion-button size="small" fill="outline" (click)="loadPreview(profile)">Predogled za danes</ion-button>
                  @if (pendingDelete() === profile.id) {
                    <ion-button size="small" color="danger" (click)="remove(profile)">Res izbriši</ion-button>
                    <ion-button size="small" fill="clear" (click)="pendingDelete.set(null)">Prekliči</ion-button>
                  } @else {
                    <ion-button size="small" fill="outline" color="danger" (click)="pendingDelete.set(profile.id)">
                      Izbriši urnik
                    </ion-button>
                  }
                </div>

                @if (pendingDelete() === profile.id) {
                  <ion-note class="facts">
                    Urnik bo izbrisan, njegove še neizvedene akcije za danes pa preklicane.
                    Že zabeleženi vpisi na delodajalčevi strani ostanejo.
                  </ion-note>
                }

                @if (previews()[profile.id]; as preview) {
                  <ion-note class="facts">
                    <strong>{{ preview.localDate }}</strong> — {{ preview.reason }}
                    @if (preview.actions.length === 0) {
                      <br />Ta dan se ne izvede nič.
                    } @else {
                      @for (action of preview.actions; track action.actionName) {
                        <br />{{ action.actionName }} ob {{ formatInstant(action.scheduledAt) }}
                        (osnova {{ action.baseLocalTime.slice(0, 5) }})
                      }
                    }
                  </ion-note>
                }
              } @else {
                <!-- Preklop načina brez odpiranja obrazca: to je edina sprememba, ki se dela
                     na hitro (npr. "danes ne, samo opozori me"). -->
                <ion-item lines="none">
                  <ion-label>Način</ion-label>
                  <ion-select
                    [value]="profile.mode"
                    interface="popover"
                    (ionChange)="onModeChange(profile, $event)"
                  >
                    <ion-select-option value="AUTO">Samodejno</ion-select-option>
                    <ion-select-option value="REMIND_ONLY">Samo opozarjanje</ion-select-option>
                    <ion-select-option value="OFF">Izklopljeno</ion-select-option>
                  </ion-select>
                </ion-item>
              }
            </div>
          }
        </ion-list>

        @if (creating()) {
          <div class="profile new">
            <div class="head static"><strong>Nov urnik</strong></div>
            <app-schedule-profile-form
              [profile]="null"
              [locations]="locations()"
              (saved)="onSaved($event)"
              (cancelled)="creating.set(false)"
            ></app-schedule-profile-form>
          </div>
        }
      }

      @if (notice(); as message) {
        <ion-text color="medium"><p class="hint">{{ message }}</p></ion-text>
      }
      <!-- Načrt dneva je ob nastanku zamrznjen, zato nove ure danes ne veljajo same od sebe.
           Brez tega gumba je edina pot čakati na jutri — in videti je, kot da urnik ne dela. -->
      @if (forceProfileId(); as profileId) {
        <ion-button size="small" fill="outline" [disabled]="forcing()" (click)="applyToToday(profileId)">
          {{ forcing() ? 'Uporabljam …' : 'Uporabi nove ure že za danes' }}
        </ion-button>
      }
      @if (loadError()) {
        <ion-text color="danger">
          <p class="hint">Urnikov ni bilo mogoče naložiti. Preveri povezavo in poskusi znova.</p>
        </ion-text>
      }

      <ion-button expand="block" fill="clear" (click)="reload()">Osveži</ion-button>
    </ion-content>
  `,
  styles: `
    .automation {
      padding: var(--cd-space-3) var(--cd-space-2);
      margin-bottom: var(--cd-space-3);
      border: 1px solid var(--cd-divider);
      border-radius: var(--cd-radius-sm);
    }
    .automation.on {
      border-color: var(--ion-color-success);
    }
    .profile {
      padding: var(--cd-space-3) 0;
      border-top: 1px solid var(--cd-divider);
    }
    .profile:first-of-type {
      border-top: 0;
    }
    .head {
      display: flex;
      align-items: center;
      gap: var(--cd-space-2);
      width: 100%;
      padding: 0;
      background: none;
      border: 0;
      color: inherit;
      font: inherit;
      text-align: left;
      cursor: pointer;
    }
    .head.static {
      cursor: default;
    }
    .head ion-badge {
      margin-left: auto;
      flex: none;
    }
    .head .sub {
      font-size: 0.8rem;
      opacity: 0.65;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--cd-space-2);
      margin-top: var(--cd-space-2);
    }
    .facts {
      display: block;
      padding: var(--cd-space-2);
      font-size: 0.8rem;
      line-height: 1.6;
    }
    .hint { font-size: 0.85rem; }
  `,
})
export class SchedulePage implements OnInit {
  private readonly http = inject(HttpClient);

  readonly profiles = signal<TrackingProfile[]>([]);
  readonly locations = signal<LocationOption[]>([]);
  /** Vrednosti obrazca po `profile.id` — pripravljene ob nalaganju, da referenca ostane
   * stabilna med preverjanji sprememb (glej opombo v predlogi). */
  readonly formValues = signal<Record<string, ProfileFormValue>>({});
  readonly previews = signal<Record<string, PreviewResponse>>({});
  readonly openIds = signal<ReadonlySet<string>>(new Set());
  readonly automation = signal<AutomationState | null>(null);
  readonly togglingAutomation = signal(false);
  readonly creating = signal(false);
  readonly pendingDelete = signal<string | null>(null);
  readonly notice = signal<string | null>(null);
  readonly loadError = signal(false);
  /** Urnik, ki mu današnje ure niso obveljale, ker je bil dan že načrtovan. */
  readonly forceProfileId = signal<string | null>(null);
  readonly forcing = signal(false);

  formatDays(days: number[]): string {
    return days
      .slice()
      .sort((a, b) => a - b)
      .map((d) => DAY_NAMES[d])
      .join(', ');
  }

  formatActions(actions: TrackingProfile['actions']): string {
    return actions
      .filter((a) => a.enabled)
      .map((a) => a.localTime.slice(0, 5))
      .join(' → ');
  }

  formatInstant(iso: string): string {
    return new Date(iso).toLocaleTimeString('sl-SI', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Ljubljana',
    });
  }

  modeLabel(mode: TrackingProfile['mode']): string {
    return MODE_LABEL[mode];
  }

  isOpen(id: string): boolean {
    return this.openIds().has(id);
  }

  toggle(id: string): void {
    this.openIds.update((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  startCreate(): void {
    this.notice.set(null);
    this.forceProfileId.set(null);
    this.creating.set(true);
  }

  /** Osebno stikalo. Strežnik ob premiku TAKOJ uveljavi posledico (izklop prekliče današnje
   * akcije, vklop načrt sestavi znova) — sporočilo pove, koliko jih je bilo, sicer bi bil
   * premik stikala videti brez učinka do naslednjega dne. */
  async onAutomationToggle(event: CustomEvent<{ checked?: boolean }>): Promise<void> {
    const enabled = event.detail.checked === true;
    if (enabled === this.automation()?.userEnabled) return;

    this.togglingAutomation.set(true);
    try {
      const state = await firstValueFrom(
        this.http.put<AutomationState>(apiUrl('/time-tracking/automation'), { enabled }, { withCredentials: true }),
      );
      this.automation.set(state);
      this.notice.set(this.automationMessage(state));
      await this.reload();
    } catch {
      this.notice.set('Stikala ni bilo mogoče premakniti. Poskusi znova.');
      await this.reload();
    } finally {
      this.togglingAutomation.set(false);
    }
  }

  private automationMessage(state: AutomationState): string {
    if (!state.userEnabled) {
      const cancelled = state.cancelled ?? 0;
      return cancelled > 0
        ? `Samodejno izvajanje je izklopljeno. Preklicanih je bilo ${cancelled} še neizvedenih akcij.`
        : 'Samodejno izvajanje je izklopljeno. Nič ni bilo treba preklicati.';
    }
    if (!state.schedulerEnabled) {
      return 'Stikalo je vklopljeno, a namestitev ima samodejno izvajanje izklopljeno — izvedlo se ne bo nič.';
    }
    const rebuilt = state.rebuilt ?? 0;
    return rebuilt > 0
      ? `Samodejno izvajanje je vklopljeno. Za danes in jutri je načrtovanih ${rebuilt} akcij.`
      : 'Samodejno izvajanje je vklopljeno.';
  }

  /** Odgovor strežnika v obliko obrazca: ure so tam `HH:MM:SS`, `<input type="time">` pa dela
   * s `HH:MM`. */
  private toFormValue(profile: TrackingProfile): ProfileFormValue {
    return {
      id: profile.id,
      name: profile.name,
      daysOfWeek: profile.daysOfWeek,
      locationId: profile.locationId,
      mode: profile.mode,
      actions: profile.actions
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((a) => ({
          actionName: a.actionName,
          localTime: a.localTime.slice(0, 5),
          jitterSeconds: a.jitterSeconds,
          enabled: a.enabled,
        })),
      graceMinutes: profile.graceMinutes,
      maxDelayMinutes: profile.maxDelayMinutes,
      maxAttempts: profile.maxAttempts,
      retryBackoffSeconds: profile.retryBackoffSeconds,
      maxReminders: profile.maxReminders,
      reminderIntervalMinutes: profile.reminderIntervalMinutes,
      active: profile.active,
    };
  }

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  async reload(): Promise<void> {
    try {
      const [profiles, locations, automation] = await Promise.all([
        firstValueFrom(this.http.get<TrackingProfile[]>(apiUrl('/time-tracking/profiles'), { withCredentials: true })),
        firstValueFrom(this.http.get<LocationOption[]>(apiUrl('/time-tracking/locations'), { withCredentials: true })),
        firstValueFrom(this.http.get<AutomationState>(apiUrl('/time-tracking/automation'), { withCredentials: true })),
      ]);
      this.profiles.set(profiles);
      this.locations.set(locations);
      this.automation.set(automation);
      this.formValues.set(Object.fromEntries(profiles.map((p) => [p.id, this.toFormValue(p)])));
      this.loadError.set(false);
    } catch {
      // FR-026 duh: prehodna napaka ne sme sesuti zaslona. Prej je bila POŽRTA v prazen
      // `catch {}` in prazen seznam je bil videti kot "urnikov ni" — kar je bilo tudi
      // dejansko sporočilo ob 401. Zdaj se razlikuje.
      this.loadError.set(true);
    }
  }

  /** Po shranjevanju se načrt za danes sestavi TAKOJ — sicer bi nov urnik prvič zaživel šele
   * ob naslednjem ciklu razporejevalnika in bi bil videti kot da ne dela. */
  async onSaved(profileId: string): Promise<void> {
    this.creating.set(false);
    this.openIds.update((prev) => {
      const next = new Set(prev);
      next.delete(profileId);
      return next;
    });
    // Predogled je bil izračunan iz PREJŠNJIH ur — če ostane, kaže na stare čase pod novim
    // urnikom, kar je slabše od tega, da ga ni.
    this.previews.update((prev) => {
      const next = { ...prev };
      delete next[profileId];
      return next;
    });
    await this.reload();
    await this.rebuildToday(profileId);
  }

  private async rebuildToday(profileId: string): Promise<void> {
    try {
      const result = await firstValueFrom(
        this.http.post<RebuildResponse>(apiUrl('/time-tracking/rebuild-plan'), { profileId }, { withCredentials: true }),
      );
      this.notice.set(this.rebuildMessage(result));
      const dayIsWorking = result.dayStatus === 'workday' || result.dayStatus === 'forced';
      this.forceProfileId.set(dayIsWorking && result.created === 0 ? profileId : null);
    } catch {
      this.notice.set('Urnik je shranjen, načrta za danes pa ni bilo mogoče sestaviti. Poskusi z gumbom Osveži.');
    }
  }

  private rebuildMessage(result: RebuildResponse): string {
    if (result.dayStatus !== 'workday' && result.dayStatus !== 'forced') {
      return `Shranjeno. Danes se ne izvede nič — ${result.reason}.`;
    }
    if (result.created > 0) {
      return `Shranjeno. Za danes je načrtovanih ${result.created} akcij.`;
    }
    // `buildPlanForDay` piše z `$setOnInsert`: akcija, ki je za danes ŽE načrtovana, obdrži
    // svoj prvotni čas tudi po spremembi ure v urniku. Zamolčati to bi pomenilo, da urnik
    // "ne dela", dokler se ne obrne dan.
    return 'Shranjeno. Današnje akcije so bile načrtovane že prej in obdržijo svoje ure — nove ure veljajo od jutri.';
  }

  /** Zavrže današnje še neizvedene akcije tega urnika in jih sestavi znova po novih urah.
   * Ročni popravki današnjega dne se pri tem izgubijo, zato je to izrecen klik. */
  async applyToToday(profileId: string): Promise<void> {
    this.forcing.set(true);
    try {
      const result = await firstValueFrom(
        this.http.post<RebuildResponse>(
          apiUrl('/time-tracking/rebuild-plan'),
          { profileId, force: true },
          { withCredentials: true },
        ),
      );
      this.notice.set(
        result.created > 0
          ? `Nove ure veljajo že danes: ${result.replaced ?? 0} starih akcij zamenjanih z ${result.created} novimi.`
          : `Za danes ni nastala nobena akcija — ${result.reason}.`,
      );
      this.forceProfileId.set(null);
      await this.reload();
    } catch {
      this.notice.set('Novih ur ni bilo mogoče uporabiti za danes. Poskusi znova.');
    } finally {
      this.forcing.set(false);
    }
  }

  async loadPreview(profile: TrackingProfile): Promise<void> {
    try {
      const preview = await firstValueFrom(
        this.http.get<PreviewResponse>(apiUrl(`/time-tracking/profiles/${profile.id}/preview`), {
          withCredentials: true,
        }),
      );
      this.previews.update((prev) => ({ ...prev, [profile.id]: preview }));
    } catch {
      this.notice.set('Predogleda ni bilo mogoče naložiti.');
    }
  }

  async remove(profile: TrackingProfile): Promise<void> {
    this.pendingDelete.set(null);
    try {
      await firstValueFrom(
        this.http.delete(apiUrl(`/time-tracking/profiles/${profile.id}`), { withCredentials: true }),
      );
      this.notice.set(`Urnik “${profile.name}” je izbrisan.`);
      await this.reload();
    } catch {
      this.notice.set('Brisanje ni uspelo. Poskusi znova.');
    }
  }

  async onModeChange(profile: TrackingProfile, event: CustomEvent<{ value?: unknown }>): Promise<void> {
    const value = event.detail.value;
    if (value !== 'AUTO' && value !== 'REMIND_ONLY' && value !== 'OFF') return;
    if (value === profile.mode) return;
    try {
      await firstValueFrom(
        this.http.put(apiUrl(`/time-tracking/profiles/${profile.id}/mode`), { mode: value }, { withCredentials: true }),
      );
      this.notice.set(`Način urnika “${profile.name}” je zdaj ${this.modeLabel(value)}.`);
      await this.reload();
    } catch {
      this.notice.set('Načina ni bilo mogoče spremeniti. Poskusi znova.');
    }
  }
}

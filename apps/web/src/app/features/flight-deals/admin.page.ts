import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonBadge,
  IonButton,
  IonContent,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
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
import { FlightDealsApi } from './flight-deals.api.js';
import {
  OUTCOME_LABELS,
  RUN_STATUS_LABELS,
  describeError,
  formatLjubljana,
  runStatusColor,
  type NotificationAdmin,
  type ProviderAdmin,
  type Run,
  type SchedulePresetId,
  type SchedulerSettings,
} from './flight-deals.model.js';

// Administracija modula Leti (US6, FR-045 do FR-053): urnik, zagoni, viri, outbox dopisov. Stran je
// podpot modula (ne ločen zavihek); do nje pride samo admin, varuje pa jo STREŽNIK
// (modules/flight-deals/admin-guard.ts) — navaden uporabnik tu dobi 403 in to je prikazano.
// Med tekočim zagonom se seznam osvežuje na 5 s.

@Component({
  selector: 'app-flight-admin-page',
  standalone: true,
  imports: [FormsModule, PageHeaderComponent, HelpButtonComponent, IonContent, IonSegment, IonSegmentButton, IonLabel, IonItem, IonInput, IonSelect, IonSelectOption, IonToggle, IonButton, IonIcon, IonList, IonBadge, IonNote, IonText],
  template: `
    <app-page-header title="Administracija letov" backRoute="/flight-deals" backLabel="Leti"></app-page-header>
    <ion-content class="ion-padding">
      <div class="page">
        @if (forbidden()) {
          <ion-text color="danger"><p>Administracija je na voljo samo administratorju.</p></ion-text>
        } @else {
          <ion-segment [value]="tab()" (ionChange)="tab.set($any($event.detail.value))" scrollable>
            <ion-segment-button value="scheduler"><ion-label>Urnik</ion-label></ion-segment-button>
            <ion-segment-button value="runs"><ion-label>Zagoni</ion-label></ion-segment-button>
            <ion-segment-button value="providers"><ion-label>Viri</ion-label></ion-segment-button>
            <ion-segment-button value="notifications"><ion-label>Obvestila</ion-label></ion-segment-button>
          </ion-segment>

          @if (error(); as message) {
            <ion-text color="danger"><p>{{ message }}</p></ion-text>
          }

          @if (tab() === 'scheduler') {
            <section>
              <h2 class="cd-section-title">Urnik preverjanja <app-help topic="flightDeals.scheduler"></app-help></h2>
              @if (scheduler(); as s) {
                <ion-item lines="none">
                  <ion-toggle [checked]="s.enabled" [disabled]="busy()" (ionChange)="saveScheduler({ enabled: $any($event).detail.checked })">Preverjanje je vklopljeno</ion-toggle>
                </ion-item>
                <ion-item>
                  <ion-select label="Urnik" labelPlacement="stacked" interface="popover" [value]="s.preset" [disabled]="busy()" (ionChange)="onPreset($any($event).detail.value)">
                    @for (p of s.presets; track p.id) {
                      <ion-select-option [value]="p.id">{{ p.label }}</ion-select-option>
                    }
                    <ion-select-option value="custom">Po meri (cron izraz)</ion-select-option>
                  </ion-select>
                </ion-item>
                @if (s.preset === 'custom' || customOpen()) {
                  <ion-item>
                    <ion-input label="Cron izraz (minuta ura dan mesec dan-v-tednu)" labelPlacement="stacked" [(ngModel)]="cronDraft" name="cron" placeholder="0 6,18 * * *"></ion-input>
                    <ion-button slot="end" size="small" [disabled]="busy()" (click)="saveScheduler({ cronExpression: cronDraft })">Shrani</ion-button>
                  </ion-item>
                }
                <ion-item>
                  <ion-input label="Časovni pas" labelPlacement="stacked" [(ngModel)]="tzDraft" name="tz"></ion-input>
                  <ion-button slot="end" size="small" [disabled]="busy()" (click)="saveScheduler({ timezone: tzDraft })">Shrani</ion-button>
                </ion-item>
                <ion-note class="cd-section-hint">
                  Izraz: <code>{{ s.cronExpression }}</code> ({{ s.timezone }}).
                  @if (s.nextRunLocal) {
                    Naslednje preverjanje: <strong>{{ s.nextRunLocal }}</strong>.
                  } @else {
                    Preverjanje je izklopljeno; ročni zagon je kljub temu mogoč.
                  }
                  @if (s.updatedBy) {
                    Zadnjič spremenil {{ s.updatedBy.displayName }} {{ formatLjubljana(s.updatedAt) }}.
                  }
                </ion-note>
                @if (saved()) {
                  <ion-text color="success"><p>Shranjeno. Velja ob naslednjem tiku, brez ponovnega zagona.</p></ion-text>
                }
              }
              <div class="actions">
                <ion-button [disabled]="busy() || !!active()" (click)="triggerRun()">
                  <ion-icon slot="start" name="refresh-outline" aria-hidden="true"></ion-icon>
                  Preveri zdaj
                </ion-button>
                @if (active(); as run) {
                  <ion-note>Eno preverjanje že {{ RUN_STATUS_LABELS[run.status] }}.</ion-note>
                  <ion-button fill="outline" color="danger" size="small" [disabled]="run.cancelRequested" (click)="cancel(run)">Prekini</ion-button>
                }
              </div>
            </section>
          }

          @if (tab() === 'runs') {
            <section>
              <h2 class="cd-section-title">Zgodovina zagonov</h2>
              @if (runs().length === 0) {
                <ion-note class="cd-section-hint">Zagonov še ni bilo.</ion-note>
              }
              <ion-list lines="full">
                @for (run of runs(); track run.id) {
                  <ion-item button detail="false" (click)="toggleRun(run.id)">
                    <ion-label>
                      <h3>
                        {{ formatLjubljana(run.startedAt ?? run.scheduledFor ?? run.finishedAt) }}
                        <ion-badge [color]="runStatusColor(run.status)">{{ RUN_STATUS_LABELS[run.status] }}</ion-badge>
                        <ion-badge color="medium">{{ run.trigger === 'manual' ? 'ročno' : 'urnik' }}</ion-badge>
                      </h3>
                      <p>
                        {{ run.counters.rules }} iskanj · {{ run.counters.queries }} poizvedb ({{ run.counters.providerRequests }} klicev) ·
                        {{ run.counters.newMatches }} novih · {{ run.counters.priceDrops }} pocenitev · {{ run.counters.priceRises }} podražitev ·
                        {{ run.counters.unavailable }} ni več na voljo · dopisi: {{ run.counters.notificationsSent }} poslanih, {{ run.counters.notificationsSuppressed }} zadržanih, {{ run.counters.notificationsFailed }} neuspelih
                      </p>
                      @if (run.requestedBy) {
                        <p>sprožil {{ run.requestedBy.displayName }}</p>
                      }
                      @if (expandedRun() === run.id) {
                        <div class="details">
                          @for (p of run.providers; track p.providerId) {
                            @if (p.enabled) {
                              <p>{{ p.providerId }}: ok {{ p.ok }}, brez letov {{ p.noFlights }}, nedosegljiv {{ p.unreachable }}, omejen {{ p.rateLimited }}, nepopoln {{ p.incomplete }}</p>
                            }
                          }
                          @for (e of run.errors; track $index) {
                            <ion-text color="danger"><p>{{ formatLjubljana(e.at) }} · {{ e.providerId ?? '' }} {{ e.code }}: {{ e.message }}</p></ion-text>
                          }
                          @if (run.errors.length === 0) {
                            <p>Brez napak.</p>
                          }
                        </div>
                      }
                    </ion-label>
                  </ion-item>
                }
              </ion-list>
            </section>
          }

          @if (tab() === 'providers') {
            <section>
              <h2 class="cd-section-title">Viri podatkov <app-help topic="flightDeals.sources"></app-help></h2>
              @if (emailConfigured() === false) {
                <ion-text color="warning"><p>E-pošta ni nastavljena (SMTP_HOST, SMTP_FROM) — dopisi se zadržijo in ne pošljejo.</p></ion-text>
              }
              <ion-list lines="full">
                @for (p of providers(); track p.id) {
                  <ion-item>
                    <ion-label>
                      <h3>
                        {{ p.label }}
                        <ion-badge [color]="p.enabled ? 'success' : 'medium'">{{ p.enabled ? 'vklopljen' : 'izklopljen' }}</ion-badge>
                        @if (!p.official) {
                          <ion-badge color="warning">neuradni</ion-badge>
                        }
                      </h3>
                      @if (p.notice) {
                        <p>{{ p.notice }}</p>
                      }
                      <p>
                        zadnji uspeh: {{ p.lastSuccessAt ? formatLjubljana(p.lastSuccessAt) : '—' }}
                        @if (p.lastOutcome) {
                          · zadnji izid: {{ OUTCOME_LABELS[p.lastOutcome] }}
                        }
                        @if (p.dailyLimit !== null) {
                          · danes {{ p.requestsToday }}/{{ p.dailyLimit }} zagonov
                        }
                      </p>
                      @if (p.lastError) {
                        <ion-text color="danger"><p>{{ formatLjubljana(p.lastErrorAt) }}: {{ p.lastError }}</p></ion-text>
                      }
                    </ion-label>
                  </ion-item>
                }
              </ion-list>
              <ion-note class="cd-section-hint">Vire vklopi lastnik namestitve v okolju (FLIGHT_TRAVELPAYOUTS_TOKEN, FLIGHT_RYANAIR_ENABLED). Tu se stanja samo bere.</ion-note>
            </section>
          }

          @if (tab() === 'notifications') {
            <section>
              <h2 class="cd-section-title">Dopisi (outbox)</h2>
              <ion-segment [value]="notificationFilter()" (ionChange)="setNotificationFilter($any($event.detail.value))" scrollable>
                <ion-segment-button value=""><ion-label>Vsi</ion-label></ion-segment-button>
                <ion-segment-button value="sent"><ion-label>Poslani</ion-label></ion-segment-button>
                <ion-segment-button value="pending"><ion-label>Čakajo</ion-label></ion-segment-button>
                <ion-segment-button value="failed"><ion-label>Neuspeli</ion-label></ion-segment-button>
                <ion-segment-button value="suppressed"><ion-label>Zadržani</ion-label></ion-segment-button>
              </ion-segment>
              @if (notifications().length === 0) {
                <ion-note class="cd-section-hint">Ni dopisov.</ion-note>
              }
              <ion-list lines="full">
                @for (n of notifications(); track n.id) {
                  <ion-item>
                    <ion-label>
                      <h3>
                        {{ n.recipient.displayName }} <small>{{ n.recipient.emailHint }}</small>
                        <ion-badge [color]="notificationColor(n.status)">{{ notificationLabel(n) }}</ion-badge>
                      </h3>
                      <p>{{ formatLjubljana(n.createdAt) }} · {{ n.itemCount }} postavk · poskusov {{ n.attemptCount }}</p>
                      @if (n.sentAt) {
                        <p>poslano {{ formatLjubljana(n.sentAt) }}</p>
                      }
                      @if (n.nextAttemptAt && n.status === 'pending') {
                        <p>naslednji poskus {{ formatLjubljana(n.nextAttemptAt) }}</p>
                      }
                      @if (n.lastError) {
                        <ion-text color="danger"><p>{{ n.lastError }}</p></ion-text>
                      }
                    </ion-label>
                  </ion-item>
                }
              </ion-list>
            </section>
          }
        }
      </div>
    </ion-content>
  `,
  styles: [
    `
      .page {
        max-width: 900px;
        margin: 0 auto;
      }
      section {
        margin-top: var(--cd-space-3);
      }
      .cd-section-title {
        display: flex;
        align-items: center;
        gap: var(--cd-space-2);
      }
      .actions {
        display: flex;
        align-items: center;
        gap: var(--cd-space-2);
        flex-wrap: wrap;
        margin-top: var(--cd-space-3);
      }
      h3 ion-badge {
        margin-left: var(--cd-space-1);
        vertical-align: middle;
      }
      h3 small {
        color: var(--cd-text-muted);
        font-weight: 400;
      }
      .details {
        margin-top: var(--cd-space-2);
        padding: var(--cd-space-2);
        background: var(--cd-surface-sunken);
        border-radius: var(--cd-radius-md);
        font-size: var(--cd-font-size-sm);
        white-space: normal;
      }
      code {
        font-family: ui-monospace, monospace;
      }
    `,
  ],
})
export class FlightAdminPage implements OnInit, OnDestroy {
  private readonly api = inject(FlightDealsApi);

  readonly tab = signal<'scheduler' | 'runs' | 'providers' | 'notifications'>('scheduler');
  readonly scheduler = signal<SchedulerSettings | null>(null);
  readonly runs = signal<Run[]>([]);
  readonly active = signal<Run | null>(null);
  readonly providers = signal<ProviderAdmin[]>([]);
  readonly emailConfigured = signal<boolean | null>(null);
  readonly notifications = signal<NotificationAdmin[]>([]);
  readonly notificationFilter = signal('');
  readonly expandedRun = signal<string | null>(null);
  readonly busy = signal(false);
  readonly saved = signal(false);
  readonly error = signal<string | null>(null);
  readonly forbidden = signal(false);
  readonly customOpen = signal(false);

  cronDraft = '';
  tzDraft = 'Europe/Ljubljana';

  readonly RUN_STATUS_LABELS = RUN_STATUS_LABELS;
  readonly OUTCOME_LABELS = OUTCOME_LABELS;
  readonly runStatusColor = runStatusColor;
  readonly formatLjubljana = formatLjubljana;
  readonly hasActive = computed(() => this.active() !== null);

  private poll: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    void this.loadAll();
    this.poll = setInterval(() => {
      if (this.active()) void this.loadRuns();
    }, 5000);
  }

  ngOnDestroy(): void {
    if (this.poll) clearInterval(this.poll);
  }

  async loadAll(): Promise<void> {
    this.error.set(null);
    try {
      const [scheduler, runs, providers, notifications] = await Promise.all([this.api.scheduler(), this.api.runs(30), this.api.adminProviders(), this.api.notifications({ limit: 50 })]);
      this.scheduler.set(scheduler);
      this.cronDraft = scheduler.cronExpression;
      this.tzDraft = scheduler.timezone;
      this.runs.set(runs.runs);
      this.active.set(runs.active);
      this.providers.set(providers.providers);
      this.emailConfigured.set(providers.email.configured);
      this.notifications.set(notifications);
    } catch (err) {
      if ((err as { status?: number })?.status === 403) this.forbidden.set(true);
      else this.error.set(describeError(err, 'Administracije ni bilo mogoče naložiti.'));
    }
  }

  async loadRuns(): Promise<void> {
    try {
      const res = await this.api.runs(30);
      this.runs.set(res.runs);
      this.active.set(res.active);
      if (!res.active) void this.api.notifications({ limit: 50 }).then((n) => this.notifications.set(n));
    } catch {
      // Osveževanje v ozadju: napaka se pokaže ob naslednjem ročnem dejanju.
    }
  }

  onPreset(preset: SchedulePresetId): void {
    if (preset === 'custom') {
      this.customOpen.set(true);
      return;
    }
    this.customOpen.set(false);
    void this.saveScheduler({ preset });
  }

  async saveScheduler(patch: { enabled?: boolean; preset?: SchedulePresetId; cronExpression?: string; timezone?: string }): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    this.saved.set(false);
    try {
      const s = await this.api.updateScheduler(patch);
      this.scheduler.set(s);
      this.cronDraft = s.cronExpression;
      this.tzDraft = s.timezone;
      this.saved.set(true);
      setTimeout(() => this.saved.set(false), 3000);
    } catch (err) {
      this.error.set(describeError(err, 'Urnika ni bilo mogoče shraniti.'));
    } finally {
      this.busy.set(false);
    }
  }

  async triggerRun(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.api.triggerRun();
      await this.loadRuns();
      this.tab.set('runs');
    } catch (err) {
      this.error.set(describeError(err, 'Zagona ni bilo mogoče sprožiti.'));
      await this.loadRuns();
    } finally {
      this.busy.set(false);
    }
  }

  async cancel(run: Run): Promise<void> {
    try {
      await this.api.cancelRun(run.id);
      await this.loadRuns();
    } catch (err) {
      this.error.set(describeError(err, 'Zagona ni bilo mogoče prekiniti.'));
    }
  }

  toggleRun(id: string): void {
    this.expandedRun.set(this.expandedRun() === id ? null : id);
  }

  async setNotificationFilter(status: string): Promise<void> {
    this.notificationFilter.set(status);
    try {
      this.notifications.set(await this.api.notifications({ status: status || undefined, limit: 50 }));
    } catch (err) {
      this.error.set(describeError(err, 'Dopisov ni bilo mogoče naložiti.'));
    }
  }

  notificationColor(status: NotificationAdmin['status']): 'success' | 'warning' | 'danger' | 'medium' | 'primary' {
    switch (status) {
      case 'sent':
        return 'success';
      case 'pending':
      case 'sending':
        return 'primary';
      case 'failed':
        return 'danger';
      case 'suppressed':
        return 'warning';
    }
  }

  notificationLabel(n: NotificationAdmin): string {
    const base: Record<NotificationAdmin['status'], string> = { pending: 'čaka', sending: 'pošilja se', sent: 'poslano', failed: 'neuspelo', suppressed: 'zadržano' };
    const reasons: Record<string, string> = {
      'smtp-not-configured': 'pošta ni nastavljena',
      'no-email': 'brez e-naslova',
      'user-missing': 'uporabnik ne obstaja',
      'no-items': 'ni več ustreznih postavk',
    };
    return n.status === 'suppressed' && n.suppressedReason ? `${base[n.status]}: ${reasons[n.suppressedReason] ?? n.suppressedReason}` : base[n.status];
  }
}

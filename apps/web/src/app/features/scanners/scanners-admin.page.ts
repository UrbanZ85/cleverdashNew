import { Component, OnDestroy, OnInit, Type, computed, effect, inject, signal } from '@angular/core';
import { NgComponentOutlet } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import {
  IonBadge,
  IonButton,
  IonContent,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonSegment,
  IonSegmentButton,
  IonText,
  IonToggle,
} from '@ionic/angular/standalone';
import { PageHeaderComponent } from '../../shared/layout/page-header.component.js';
import { HelpButtonComponent } from '../../shared/help/help-button.component.js';
import { ScannersApi } from '../../core/scanners/scanners.api.js';
import { findScannerUi } from '../../core/scanners/scanner-ui.registry.js';
import {
  OUTCOME_LABELS,
  countersText,
  describeError,
  errorStatus,
  formatLjubljana,
  notificationColor,
  notificationLabel,
  runStatusColor,
  runStatusLabel,
  type NotificationAdmin,
  type Run,
  type ScannerTypeAdmin,
  type SchedulePreset,
  type TypeSchedule,
} from '../../core/scanners/scanners.model.js';
import { ScheduleFormComponent, type ScheduleFormValue } from './schedule-form.component.js';

// Administracija skenerjev (016, US2): tipi z urniki, zagoni vseh tipov, outbox dopisov, dodatki
// tipov (leti: viri). Stran je podpot zavihka (ne ločen zavihek); do nje pride samo admin, varuje
// pa jo STREŽNIK (platform/auth/admin-guard.ts) — navaden uporabnik tu dobi 403 in to je prikazano.
// Nasledila je `features/flight-deals/admin.page.ts` iz 015; `?type=` izbere tip (stara pot
// `/flight-deals/admin` preusmeri sem z `type=flights`). Med tekočim zagonom se osvežuje na 5 s.
//
// Dodatek tipa (`adminExtrasComponent` iz registra) se vstavi z `NgComponentOutlet`; stran o tipu
// ne ve ničesar — tudi ne, ali ga sploh ima.

type Tab = 'types' | 'runs' | 'notifications';

@Component({
  selector: 'app-scanners-admin-page',
  standalone: true,
  imports: [NgComponentOutlet, PageHeaderComponent, HelpButtonComponent, ScheduleFormComponent, IonContent, IonSegment, IonSegmentButton, IonLabel, IonItem, IonToggle, IonButton, IonIcon, IonList, IonBadge, IonNote, IonText],
  template: `
    <app-page-header title="Administracija skenerjev" backRoute="/scanners" backLabel="Skenerji"></app-page-header>
    <ion-content class="ion-padding">
      <div class="page">
        @if (forbidden()) {
          <ion-text color="danger"><p>Administracija je na voljo samo administratorju.</p></ion-text>
        } @else {
          @if (error(); as message) {
            <ion-text color="danger"><p>{{ message }}</p></ion-text>
          }
          @if (emailConfigured() === false) {
            <ion-text color="warning"><p>E-pošta ni nastavljena (SMTP_HOST, SMTP_FROM) — dopisi se zadržijo in ne pošljejo.</p></ion-text>
          }

          <ion-segment [value]="selectedType()" (ionChange)="selectType($any($event.detail.value))" scrollable>
            @for (t of types(); track t.type) {
              <ion-segment-button [value]="t.type"><ion-label>{{ t.label }}</ion-label></ion-segment-button>
            }
          </ion-segment>

          @if (current(); as t) {
            <ion-segment class="tabs" [value]="tab()" (ionChange)="tab.set($any($event.detail.value))">
              <ion-segment-button value="types"><ion-label>Urnik</ion-label></ion-segment-button>
              <ion-segment-button value="runs"><ion-label>Zagoni</ion-label></ion-segment-button>
              <ion-segment-button value="notifications"><ion-label>Obvestila</ion-label></ion-segment-button>
            </ion-segment>

            @if (tab() === 'types') {
              <section>
                <h2 class="cd-section-title">Urnik tipa <app-help topic="scanners.schedule"></app-help></h2>
                <ion-note class="cd-section-hint">
                  {{ t.description }} · {{ t.definitionCount }} skenerjev · {{ t.enabled ? 'vklopljen' : 'izklopljen v tej namestitvi' }}
                </ion-note>
                @if (t.schedule; as s) {
                  <ion-item lines="none">
                    <ion-toggle [checked]="s.enabled" [disabled]="busy()" (ionChange)="saveSchedule({ enabled: $any($event).detail.checked })">Preverjanje je vklopljeno</ion-toggle>
                  </ion-item>
                  <app-schedule-form [presets]="presets()" [value]="scheduleValue(s)" [disabled]="busy()" [immediate]="true" (valueChange)="saveSchedule($event)"></app-schedule-form>
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
                  <div class="actions">
                    <ion-button [disabled]="busy() || activeOfType().length > 0" (click)="triggerRun(t.type)">
                      <ion-icon slot="start" name="play-outline" aria-hidden="true"></ion-icon>
                      Preveri zdaj
                    </ion-button>
                    @for (run of activeOfType(); track run.id) {
                      <ion-note>Zagon {{ runStatusLabel(run.status) }}.</ion-note>
                      <ion-button fill="outline" color="danger" size="small" [disabled]="run.cancelRequested" (click)="cancel(run)">
                        <ion-icon slot="start" name="stop-circle-outline" aria-hidden="true"></ion-icon>
                        Prekini
                      </ion-button>
                    }
                  </div>
                } @else {
                  <ion-note class="cd-section-hint">Ta tip se izvaja na skener — urnik nastavi lastnik pri vsakem skenerju. Ročni zagon posameznega skenerja je na njegovi strani.</ion-note>
                  @for (run of activeOfType(); track run.id) {
                    <div class="actions">
                      <ion-note>Zagon {{ runStatusLabel(run.status) }}.</ion-note>
                      <ion-button fill="outline" color="danger" size="small" [disabled]="run.cancelRequested" (click)="cancel(run)">Prekini</ion-button>
                    </div>
                  }
                }
              </section>
              @if (extrasComponent(); as cmp) {
                <section>
                  <ng-container *ngComponentOutlet="cmp; inputs: { extras: t.extras }"></ng-container>
                </section>
              }
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
                          {{ formatLjubljana(run.startedAt ?? run.scheduledFor ?? run.finishedAt ?? run.createdAt) }}
                          <ion-badge [color]="runStatusColor(run.status)">{{ runStatusLabel(run.status) }}</ion-badge>
                          <ion-badge color="medium">{{ run.trigger === 'manual' ? 'ročno' : 'urnik' }}</ion-badge>
                          @if (run.scope.kind === 'definition') {
                            <ion-badge color="tertiary">en skener</ion-badge>
                          }
                        </h3>
                        <p>{{ countersText(run.counters) }}</p>
                        @if (run.requestedBy) {
                          <p>sprožil {{ run.requestedBy.displayName }}</p>
                        }
                        @if (expandedRun() === run.id) {
                          <div class="details">
                            @for (d of run.definitions; track d.scannerId) {
                              <p>skener {{ d.name ?? d.scannerId }}: <ion-text [color]="d.outcome === 'failed' ? 'danger' : undefined">{{ OUTCOME_LABELS[d.outcome] }}</ion-text>@if (d.message) { — {{ d.message }} }</p>
                            }
                            @for (e of run.errors; track $index) {
                              <ion-text color="danger"><p>{{ formatLjubljana(e.at) }} · {{ e.code }}: {{ e.message }}</p></ion-text>
                            }
                            @if (run.errors.length === 0) {
                              <p>Brez napak.</p>
                            }
                            @if (run.extras) {
                              <pre class="extras">{{ extrasText(run.extras) }}</pre>
                            }
                          </div>
                        }
                      </ion-label>
                    </ion-item>
                  }
                </ion-list>
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
          } @else if (loaded()) {
            <ion-note class="cd-section-hint">V tej namestitvi ni registriranih tipov skenerjev.</ion-note>
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
      .tabs {
        margin-top: var(--cd-space-2);
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
      .extras {
        font-size: var(--cd-font-size-xs);
        white-space: pre-wrap;
        margin: 0;
      }
      code {
        font-family: ui-monospace, monospace;
      }
    `,
  ],
})
export class ScannersAdminPage implements OnInit, OnDestroy {
  private readonly api = inject(ScannersApi);
  private readonly route = inject(ActivatedRoute);

  readonly tab = signal<Tab>('types');
  readonly types = signal<ScannerTypeAdmin[]>([]);
  readonly presets = signal<SchedulePreset[]>([]);
  readonly selectedType = signal<string | null>(null);
  readonly runs = signal<Run[]>([]);
  readonly active = signal<Run[]>([]);
  readonly notifications = signal<NotificationAdmin[]>([]);
  readonly notificationFilter = signal('');
  readonly expandedRun = signal<string | null>(null);
  readonly emailConfigured = signal<boolean | null>(null);
  readonly extrasComponent = signal<Type<unknown> | null>(null);
  readonly busy = signal(false);
  readonly saved = signal(false);
  readonly loaded = signal(false);
  readonly error = signal<string | null>(null);
  readonly forbidden = signal(false);

  readonly current = computed(() => this.types().find((t) => t.type === this.selectedType()) ?? null);
  readonly activeOfType = computed(() => this.active().filter((r) => r.type === this.selectedType()));

  readonly OUTCOME_LABELS = OUTCOME_LABELS;
  readonly runStatusLabel = runStatusLabel;
  readonly runStatusColor = runStatusColor;
  readonly notificationLabel = notificationLabel;
  readonly notificationColor = notificationColor;
  readonly formatLjubljana = formatLjubljana;
  readonly countersText = countersText;

  private poll: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Ob menjavi tipa naloži njegov dodatek (lazy) in filtriraj zagone ter dopise.
    effect(() => {
      const type = this.selectedType();
      if (!type) return;
      void this.loadExtrasComponent(type);
      void this.loadRuns();
      void this.loadNotifications();
    });
  }

  ngOnInit(): void {
    void this.loadAll();
    this.poll = setInterval(() => {
      if (this.active().length > 0) void this.loadRuns();
    }, 5000);
  }

  ngOnDestroy(): void {
    if (this.poll) clearInterval(this.poll);
  }

  async loadAll(): Promise<void> {
    this.error.set(null);
    try {
      const [admin, ref] = await Promise.all([this.api.adminTypes(), this.api.types()]);
      this.types.set(admin.types);
      this.presets.set(ref.presets);
      this.emailConfigured.set(admin.email.configured);
      const wanted = this.route.snapshot.queryParamMap.get('type');
      const first = admin.types.find((t) => t.type === wanted)?.type ?? admin.types[0]?.type ?? null;
      this.selectedType.set(first);
      this.loaded.set(true);
    } catch (err) {
      if (errorStatus(err) === 403) this.forbidden.set(true);
      else this.error.set(describeError(err, 'Administracije ni bilo mogoče naložiti.'));
    }
  }

  async loadTypes(): Promise<void> {
    try {
      const admin = await this.api.adminTypes();
      this.types.set(admin.types);
      this.emailConfigured.set(admin.email.configured);
    } catch (err) {
      this.error.set(describeError(err, 'Tipov ni bilo mogoče naložiti.'));
    }
  }

  async loadRuns(): Promise<void> {
    const type = this.selectedType();
    if (!type) return;
    try {
      const res = await this.api.adminRuns({ type, limit: 30 });
      this.runs.set(res.runs);
      this.active.set(res.active);
      if (res.active.length === 0) void this.loadNotifications();
    } catch {
      // Osveževanje v ozadju: napaka se pokaže ob naslednjem ročnem dejanju.
    }
  }

  async loadNotifications(): Promise<void> {
    const type = this.selectedType();
    if (!type) return;
    try {
      this.notifications.set(await this.api.adminNotifications({ type, status: this.notificationFilter() || undefined, limit: 50 }));
    } catch (err) {
      this.error.set(describeError(err, 'Dopisov ni bilo mogoče naložiti.'));
    }
  }

  async loadExtrasComponent(type: string): Promise<void> {
    this.extrasComponent.set(null);
    const plugin = findScannerUi(type);
    if (!plugin?.adminExtrasComponent) return;
    try {
      const cmp = await plugin.adminExtrasComponent();
      if (this.selectedType() === type) this.extrasComponent.set(cmp);
    } catch {
      // Brez dodatka — administracija deluje tudi brez njega.
    }
  }

  selectType(type: string): void {
    this.selectedType.set(type);
    this.expandedRun.set(null);
  }

  scheduleValue(s: TypeSchedule): ScheduleFormValue {
    return { preset: s.preset, cronExpression: s.cronExpression, timezone: s.timezone };
  }

  async saveSchedule(patch: Partial<ScheduleFormValue> & { enabled?: boolean }): Promise<void> {
    const type = this.selectedType();
    if (!type) return;
    this.busy.set(true);
    this.error.set(null);
    this.saved.set(false);
    try {
      const schedule = await this.api.updateTypeSchedule(type, patch);
      this.types.set(this.types().map((t) => (t.type === type ? { ...t, schedule } : t)));
      this.saved.set(true);
      setTimeout(() => this.saved.set(false), 3000);
    } catch (err) {
      this.error.set(describeError(err, 'Urnika ni bilo mogoče shraniti.'));
    } finally {
      this.busy.set(false);
    }
  }

  async triggerRun(type: string): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.api.triggerRun({ type });
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
    await this.loadNotifications();
  }

  extrasText(extras: unknown): string {
    return JSON.stringify(extras, null, 1);
  }
}

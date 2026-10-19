import { Component, OnDestroy, OnInit, Type, computed, inject, signal } from '@angular/core';
import { NgComponentOutlet } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IonBadge, IonButton, IonContent, IonIcon, IonLabel, IonList, IonItem, IonNote, IonSegment, IonSegmentButton, IonText, IonToggle } from '@ionic/angular/standalone';
import { PageHeaderComponent } from '../../shared/layout/page-header.component.js';
import { HelpButtonComponent } from '../../shared/help/help-button.component.js';
import { ScannersApi } from '../../core/scanners/scanners.api.js';
import { findScannerUi } from '../../core/scanners/scanner-ui.registry.js';
import {
  changeLabel,
  countersText,
  describeError,
  errorStatus,
  formatLjubljana,
  formatPriceOrDash,
  lastRunText,
  runStatusColor,
  runStatusLabel,
  scheduleSummary,
  type Result,
  type ResultDetail,
  type RunSummary,
  type Scanner,
} from '../../core/scanners/scanners.model.js';
import { ScannerResultListComponent } from './result-list.component.js';

// Generični kontejner rezultatov enega skenerja (US5, FR-042): glava z urnikom in zadnjim zagonom,
// "Zaženi zdaj" (samo lasten urnik), stikalo vklopa, segment Rezultati / Zagoni, podrobnosti
// rezultata z zgodovino. Tip lahko prispeva svoj prikaz (`resultsComponent`), sicer privzeti seznam.

@Component({
  selector: 'app-scanner-results-page',
  standalone: true,
  imports: [NgComponentOutlet, RouterLink, PageHeaderComponent, HelpButtonComponent, ScannerResultListComponent, IonContent, IonButton, IonIcon, IonBadge, IonNote, IonText, IonToggle, IonSegment, IonSegmentButton, IonLabel, IonList, IonItem],
  template: `
    <app-page-header [title]="scanner()?.name ?? 'Skener'" backRoute="/scanners" backLabel="Skenerji" [subtitle]="scanner()?.typeLabel ?? null">
      @if (scanner(); as s) {
        <ion-button slot="end" [routerLink]="s.links.edit" aria-label="Uredi">
          <ion-icon slot="icon-only" name="create-outline"></ion-icon>
        </ion-button>
      }
    </app-page-header>
    <ion-content>
      <div class="page">
        @if (notFound()) {
          <ion-text color="danger"><p>Skener ne obstaja.</p></ion-text>
        } @else if (scanner(); as s) {
          @if (error(); as message) {
            <ion-text color="danger"><p>{{ message }}</p></ion-text>
          }
          <section class="head">
            <p>{{ scheduleSummary(s.schedule, s.enabled && s.typeAvailable) }}</p>
            <p><ion-text [color]="lastRun(s).color">{{ lastRun(s).text }}</ion-text></p>
            @if (!s.typeAvailable) {
              <ion-badge color="warning">tip ni na voljo</ion-badge>
            }
            <div class="actions">
              @if (s.schedule.mode === 'own') {
                <ion-button size="small" [disabled]="busy() || !s.typeAvailable" (click)="runNow()">
                  <ion-icon slot="start" name="play-outline" aria-hidden="true"></ion-icon>
                  Zaženi zdaj
                </ion-button>
              }
              <ion-toggle [checked]="s.enabled" [disabled]="busy() || !s.typeAvailable" (ionChange)="toggleEnabled($any($event).detail.checked)">Vklopljen</ion-toggle>
            </div>
          </section>

          <ion-segment [value]="tab()" (ionChange)="tab.set($any($event.detail.value))">
            <ion-segment-button value="results"><ion-label>Rezultati ({{ total() }})</ion-label></ion-segment-button>
            <ion-segment-button value="runs"><ion-label>Zagoni</ion-label></ion-segment-button>
          </ion-segment>

          @if (tab() === 'results') {
            <section>
              <h2 class="cd-section-title">Rezultati <app-help topic="scanners.results"></app-help></h2>
              <ion-toggle [checked]="includeUnavailable()" (ionChange)="setIncludeUnavailable($any($event).detail.checked)">pokaži tudi nedosegljive</ion-toggle>
              @if (resultsComponent(); as cmp) {
                <ng-container *ngComponentOutlet="cmp; inputs: { scannerId: s.id, results: results() }"></ng-container>
              } @else {
                <app-scanner-result-list [results]="results()" [total]="total()" [emptyText]="emptyText()" (select)="openResult($event)"></app-scanner-result-list>
              }
              @if (detail(); as d) {
                <section class="detail">
                  <h3>{{ d.title }} <ion-button fill="clear" size="small" (click)="detail.set(null)">zapri</ion-button></h3>
                  <p>{{ formatPriceOrDash(d.price) }} · {{ changeLabel(d.lastChangeType) }} · podatek z dne {{ formatLjubljana(d.dataAt) }}</p>
                  <ion-list lines="none">
                    @for (h of d.history; track h.checkedAt) {
                      <ion-item>
                        <ion-label>{{ formatLjubljana(h.checkedAt) }} · {{ formatPriceOrDash(h.price) }} · {{ changeLabel(h.changeType) }}</ion-label>
                      </ion-item>
                    }
                  </ion-list>
                </section>
              }
            </section>
          }

          @if (tab() === 'runs') {
            <section>
              <h2 class="cd-section-title">Zagoni</h2>
              @if (runs().length === 0) {
                <ion-note class="cd-section-hint">Zagonov še ni bilo.</ion-note>
              }
              <ion-list lines="full">
                @for (run of runs(); track run.id) {
                  <ion-item>
                    <ion-label>
                      <h3>
                        {{ formatLjubljana(run.startedAt ?? run.scheduledFor ?? run.finishedAt) }}
                        <ion-badge [color]="runStatusColor(run.status)">{{ runStatusLabel(run.status) }}</ion-badge>
                        <ion-badge color="medium">{{ run.trigger === 'manual' ? 'ročno' : 'urnik' }}</ion-badge>
                      </h3>
                      <p>{{ countersText(run.counters) }}</p>
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
        padding: var(--cd-space-2) var(--cd-page-padding) var(--cd-space-6);
      }
      .head p {
        margin: 0 0 var(--cd-space-1);
      }
      .actions {
        display: flex;
        align-items: center;
        gap: var(--cd-space-3);
        margin: var(--cd-space-2) 0;
      }
      .cd-section-title {
        display: flex;
        align-items: center;
        gap: var(--cd-space-2);
        margin-top: var(--cd-space-3);
      }
      h3 ion-badge {
        margin-left: var(--cd-space-1);
        vertical-align: middle;
      }
      .detail {
        margin-top: var(--cd-space-3);
        padding: var(--cd-space-2);
        background: var(--cd-surface-sunken);
        border-radius: var(--cd-radius-md);
      }
    `,
  ],
})
export class ScannerResultsPage implements OnInit, OnDestroy {
  private readonly api = inject(ScannersApi);
  private readonly route = inject(ActivatedRoute);

  readonly scanner = signal<Scanner | null>(null);
  readonly results = signal<Result[]>([]);
  readonly total = signal(0);
  readonly runs = signal<RunSummary[]>([]);
  readonly detail = signal<ResultDetail | null>(null);
  readonly resultsComponent = signal<Type<unknown> | null>(null);
  readonly tab = signal<'results' | 'runs'>('results');
  readonly includeUnavailable = signal(false);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly notFound = signal(false);

  readonly emptyText = computed(() => (this.scanner()?.lastRun ? 'Rezultatov, ki bi ustrezali, trenutno ni.' : 'Zagon še ni tekel; prvi termin je v glavi strani.'));

  readonly scheduleSummary = scheduleSummary;
  readonly lastRun = lastRunText;
  readonly runStatusLabel = runStatusLabel;
  readonly runStatusColor = runStatusColor;
  readonly countersText = countersText;
  readonly formatLjubljana = formatLjubljana;
  readonly formatPriceOrDash = formatPriceOrDash;
  readonly changeLabel = changeLabel;

  private poll: ReturnType<typeof setInterval> | null = null;
  private id = '';

  async ngOnInit(): Promise<void> {
    this.id = this.route.snapshot.paramMap.get('scannerId') ?? '';
    await this.load();
  }

  ngOnDestroy(): void {
    this.stopPolling();
  }

  async load(): Promise<void> {
    this.error.set(null);
    try {
      const scanner = await this.api.get(this.id);
      this.scanner.set(scanner);
      await this.loadResultsComponent(scanner.type);
      await Promise.all([this.loadResults(), this.loadRuns()]);
    } catch (err) {
      if (errorStatus(err) === 404) this.notFound.set(true);
      else this.error.set(describeError(err, 'Skenerja ni bilo mogoče naložiti.'));
    }
  }

  private async loadResultsComponent(type: string): Promise<void> {
    const plugin = findScannerUi(type);
    if (!plugin?.resultsComponent) return;
    try {
      this.resultsComponent.set(await plugin.resultsComponent());
    } catch {
      this.resultsComponent.set(null);
    }
  }

  async loadResults(): Promise<void> {
    const res = await this.api.results(this.id, { sort: 'seen', includeUnavailable: this.includeUnavailable(), limit: 200 });
    this.results.set(res.results);
    this.total.set(res.total);
  }

  async loadRuns(): Promise<void> {
    this.runs.set(await this.api.runs(this.id, 20));
  }

  async setIncludeUnavailable(value: boolean): Promise<void> {
    this.includeUnavailable.set(value);
    await this.loadResults();
  }

  async openResult(r: Result): Promise<void> {
    try {
      this.detail.set(await this.api.result(this.id, r.id));
    } catch (err) {
      this.error.set(describeError(err, 'Podrobnosti ni bilo mogoče naložiti.'));
    }
  }

  async runNow(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.api.run(this.id);
      this.tab.set('runs');
      this.startPolling();
    } catch (err) {
      this.error.set(describeError(err, 'Zagona ni bilo mogoče sprožiti.'));
    } finally {
      this.busy.set(false);
    }
  }

  private startPolling(): void {
    this.stopPolling();
    let ticks = 0;
    this.poll = setInterval(async () => {
      ticks += 1;
      await this.loadRuns();
      const active = this.runs().some((r) => r.status === 'queued' || r.status === 'running');
      if (!active || ticks > 40) {
        this.stopPolling();
        await this.load();
      }
    }, 3000);
  }

  private stopPolling(): void {
    if (this.poll) clearInterval(this.poll);
    this.poll = null;
  }

  async toggleEnabled(enabled: boolean): Promise<void> {
    const s = this.scanner();
    if (!s || s.enabled === enabled) return;
    this.busy.set(true);
    try {
      this.scanner.set(await this.api.update(this.id, { enabled }));
    } catch (err) {
      this.error.set(describeError(err, 'Spremembe ni bilo mogoče shraniti.'));
    } finally {
      this.busy.set(false);
    }
  }
}

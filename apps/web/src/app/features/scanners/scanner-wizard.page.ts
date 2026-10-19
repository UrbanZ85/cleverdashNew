import { Component, OnInit, Type, ViewChild, computed, inject, signal } from '@angular/core';
import { NgComponentOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { IonButton, IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCardTitle, IonContent, IonIcon, IonInput, IonItem, IonNote, IonText, IonToggle } from '@ionic/angular/standalone';
import { PageHeaderComponent } from '../../shared/layout/page-header.component.js';
import { HelpButtonComponent } from '../../shared/help/help-button.component.js';
import { ScannersApi } from '../../core/scanners/scanners.api.js';
import { findScannerUi } from '../../core/scanners/scanner-ui.registry.js';
import type { ScannerConfigForm } from '../../core/scanners/scanner-config-form.js';
import { describeError, type Scanner, type ScannerTypeInfo, type SchedulePreset } from '../../core/scanners/scanners.model.js';
import { ScheduleFormComponent, type ScheduleFormValue } from './schedule-form.component.js';

// Čarovnik (US4, FR-041): 1. tip → 2. obrazec tipa → 3. ime, urnik, obvestila. Tip z lastnimi
// definicijami (leti) se po 1. koraku preusmeri na svojo pot (`createRoute`) — njegov obrazec je
// celota s svojimi preverjanji in urnik je tipov (plan.md, Complexity Tracking). Obrazec tipa pride
// iz registra (`configComponent`) in se vstavi z `NgComponentOutlet`; čarovnik o tipu ne ve ničesar.
// Pri urejanju (`/scanners/:id/edit`) je 1. korak preskočen.

type Step = 1 | 2 | 3;

@Component({
  selector: 'app-scanner-wizard-page',
  standalone: true,
  imports: [NgComponentOutlet, FormsModule, PageHeaderComponent, HelpButtonComponent, ScheduleFormComponent, IonContent, IonCard, IonCardHeader, IonCardTitle, IonCardSubtitle, IonCardContent, IonItem, IonInput, IonToggle, IonButton, IonIcon, IonNote, IonText],
  template: `
    <app-page-header [title]="isEdit() ? 'Uredi skener' : 'Nov skener'" backRoute="/scanners" backLabel="Skenerji"></app-page-header>
    <ion-content>
      <div class="page">
        @if (error(); as message) {
          <ion-text color="danger"><p>{{ message }}</p></ion-text>
        }
        <ion-note class="steps">Korak {{ step() }} od 3 — {{ stepTitle() }}</ion-note>

        @if (step() === 1) {
          <section>
            <h2 class="cd-section-title">Izberi tip <app-help topic="scanners.types"></app-help></h2>
            @if (!loading() && selectableTypes().length === 0) {
              <ion-note class="cd-section-hint">V tej namestitvi ni vklopljenega tipa, ki bi ga lahko ustvaril.</ion-note>
            }
            <div class="cards">
              @for (t of selectableTypes(); track t.type) {
                <ion-card button (click)="chooseType(t)">
                  <ion-card-header>
                    <ion-card-title><ion-icon [name]="t.icon" aria-hidden="true"></ion-icon> {{ t.label }}</ion-card-title>
                    <ion-card-subtitle>{{ t.execution === 'batch' ? 'po urniku tipa' : 'lasten urnik' }}</ion-card-subtitle>
                  </ion-card-header>
                  <ion-card-content>{{ t.description }}</ion-card-content>
                </ion-card>
              }
            </div>
          </section>
        }

        @if (step() === 2) {
          <section>
            <h2 class="cd-section-title">Nastavitve: {{ chosen()?.label }}</h2>
            @if (configComponent(); as cmp) {
              <ng-container *ngComponentOutlet="cmp; inputs: { initial: initialConfig() }"></ng-container>
            } @else if (configLoaded()) {
              <ion-note class="cd-section-hint">Ta tip nima obrazca v tej namestitvi; nastavitve je mogoče vnesti samo prek API-ja.</ion-note>
            }
            <div class="actions">
              @if (!isEdit()) {
                <ion-button fill="outline" (click)="step.set(1)">Nazaj</ion-button>
              }
              <ion-button [disabled]="!configComponent()" (click)="next()">Naprej</ion-button>
            </div>
          </section>
        }

        @if (step() === 3) {
          <section>
            <h2 class="cd-section-title">Ime, urnik in obvestila <app-help topic="scanners.schedule"></app-help></h2>
            <ion-item>
              <ion-input label="Ime skenerja" labelPlacement="stacked" [(ngModel)]="name" name="name" maxlength="80" placeholder="npr. Testni echo"></ion-input>
            </ion-item>
            <ion-item lines="none">
              <ion-toggle [(ngModel)]="enabled" name="enabled">Vklopljen — izvaja se po urniku</ion-toggle>
            </ion-item>
            <app-schedule-form #schedule [presets]="presets()" [value]="scheduleValue()" (valueChange)="onSchedule($event)"></app-schedule-form>
            <ion-item lines="none">
              <ion-toggle [(ngModel)]="notify" name="notify">Obveščaj me po e-pošti ob novih rezultatih in spremembah</ion-toggle>
            </ion-item>
            <div class="actions">
              <ion-button fill="outline" (click)="step.set(2)">Nazaj</ion-button>
              <ion-button [disabled]="saving()" (click)="save()">{{ saving() ? 'Shranjujem …' : 'Shrani' }}</ion-button>
            </div>
          </section>
        }
      </div>
    </ion-content>
  `,
  styles: [
    `
      .page {
        max-width: 760px;
        margin: 0 auto;
        padding: var(--cd-space-2) var(--cd-page-padding) var(--cd-space-6);
      }
      .steps {
        display: block;
        margin-bottom: var(--cd-space-2);
      }
      .cd-section-title {
        display: flex;
        align-items: center;
        gap: var(--cd-space-2);
      }
      .cards {
        display: grid;
        gap: var(--cd-space-2);
        grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      }
      ion-card {
        margin: 0;
      }
      .actions {
        display: flex;
        gap: var(--cd-space-2);
        margin-top: var(--cd-space-3);
      }
    `,
  ],
})
export class ScannerWizardPage implements OnInit {
  private readonly api = inject(ScannersApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  @ViewChild(NgComponentOutlet) private outlet?: NgComponentOutlet;
  @ViewChild('schedule') private scheduleForm?: ScheduleFormComponent;

  readonly step = signal<Step>(1);
  readonly types = signal<ScannerTypeInfo[]>([]);
  readonly presets = signal<SchedulePreset[]>([]);
  readonly chosen = signal<ScannerTypeInfo | null>(null);
  readonly configComponent = signal<Type<unknown> | null>(null);
  readonly configLoaded = signal(false);
  readonly initialConfig = signal<Record<string, unknown> | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly editingId = signal<string | null>(null);

  name = '';
  enabled = true;
  notify = true;
  private schedule: ScheduleFormValue = { preset: 'daily-06', cronExpression: '0 6 * * *', timezone: 'Europe/Ljubljana' };
  readonly scheduleValue = signal<ScheduleFormValue>(this.schedule);

  readonly isEdit = computed(() => this.editingId() !== null);
  readonly selectableTypes = computed(() => this.types().filter((t) => t.enabled && t.available));
  readonly stepTitle = computed(() => (this.step() === 1 ? 'tip skenerja' : this.step() === 2 ? 'nastavitve' : 'urnik in obvestila'));

  async ngOnInit(): Promise<void> {
    this.loading.set(true);
    try {
      const ref = await this.api.types();
      this.types.set(ref.types);
      this.presets.set(ref.presets);
      const id = this.route.snapshot.paramMap.get('scannerId');
      if (id) await this.loadExisting(id);
    } catch (err) {
      this.error.set(describeError(err, 'Tipov ni bilo mogoče naložiti.'));
    } finally {
      this.loading.set(false);
    }
  }

  private async loadExisting(id: string): Promise<void> {
    const scanner: Scanner = await this.api.get(id);
    this.editingId.set(id);
    this.name = scanner.name;
    this.enabled = scanner.enabled;
    this.notify = scanner.notifications.enabled;
    this.schedule = {
      preset: scanner.schedule.preset ?? 'custom',
      cronExpression: scanner.schedule.cronExpression ?? '',
      timezone: scanner.schedule.timezone ?? 'Europe/Ljubljana',
    };
    this.scheduleValue.set(this.schedule);
    this.initialConfig.set(scanner.config);
    const type = this.types().find((t) => t.type === scanner.type) ?? null;
    this.chosen.set(type);
    await this.loadConfigComponent(scanner.type);
    this.step.set(2);
  }

  async chooseType(t: ScannerTypeInfo): Promise<void> {
    if (t.ownsDefinitions && t.createRoute) {
      // Tip hrani definicije sam (leti): njegov obrazec je celota s svojimi preverjanji.
      await this.router.navigateByUrl(t.createRoute);
      return;
    }
    this.chosen.set(t);
    this.error.set(null);
    await this.loadConfigComponent(t.type);
    this.step.set(2);
  }

  private async loadConfigComponent(type: string): Promise<void> {
    this.configComponent.set(null);
    this.configLoaded.set(false);
    const plugin = findScannerUi(type);
    if (plugin?.configComponent) {
      try {
        this.configComponent.set(await plugin.configComponent());
      } catch {
        this.configComponent.set(null);
      }
    }
    this.configLoaded.set(true);
  }

  private form(): ScannerConfigForm | null {
    const instance = this.outlet?.componentInstance as ScannerConfigForm | null | undefined;
    return instance && typeof instance.validate === 'function' ? instance : null;
  }

  next(): void {
    const form = this.form();
    const problem = form?.validate() ?? null;
    if (problem) {
      this.error.set(problem);
      return;
    }
    this.error.set(null);
    this.step.set(3);
  }

  onSchedule(partial: Partial<ScheduleFormValue>): void {
    this.schedule = { ...this.schedule, ...partial };
    this.scheduleValue.set(this.schedule);
  }

  async save(): Promise<void> {
    const type = this.chosen();
    if (!type) return;
    const name = this.name.trim();
    if (!name) {
      this.error.set('Ime je obvezno.');
      return;
    }
    const current = this.scheduleForm?.currentDraft() ?? this.schedule;
    const schedule = current.preset === 'custom' ? { cronExpression: current.cronExpression, timezone: current.timezone } : { preset: current.preset, timezone: current.timezone };
    const config = this.lastConfig ?? {};
    this.saving.set(true);
    this.error.set(null);
    try {
      const id = this.editingId();
      const saved = id
        ? await this.api.update(id, { name, enabled: this.enabled, schedule, notifications: { enabled: this.notify }, config })
        : await this.api.create({ name, type: type.type, enabled: this.enabled, schedule, notifications: { enabled: this.notify }, config });
      await this.router.navigateByUrl(saved.links.results);
    } catch (err) {
      this.error.set(describeError(err, 'Skenerja ni bilo mogoče shraniti.'));
    } finally {
      this.saving.set(false);
    }
  }

  /** Nastavitve se preberejo ob prehodu iz 2. koraka, ker se obrazec tipa ob 3. koraku odstrani iz DOM-a. */
  private lastConfig: Record<string, unknown> | null = null;

  ngAfterViewChecked(): void {
    const form = this.form();
    if (form && this.step() === 2) this.lastConfig = form.config();
  }
}

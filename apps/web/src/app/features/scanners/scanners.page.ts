import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AlertController, IonBadge, IonButton, IonContent, IonIcon, IonItem, IonLabel, IonList, IonRefresher, IonRefresherContent, IonText, IonToggle } from '@ionic/angular/standalone';
import { PageHeaderComponent } from '../../shared/layout/page-header.component.js';
import { HelpButtonComponent } from '../../shared/help/help-button.component.js';
import { CurrentUserService } from '../../core/user/current-user.service.js';
import { ScannersApi } from '../../core/scanners/scanners.api.js';
import { describeError, lastRunText, scheduleSummary, type Limits, type ScannerSummary } from '../../core/scanners/scanners.model.js';

// Zavihek "Skenerji" (platform/tabs/registry.ts, id `scanners`) — seznam skenerjev VSEH tipov
// (US3, FR-040): generične definicije in vrstice, ki jih prispevajo tipi (leti), v isti obliki.
// Stran nobenega tipa ne pozna po imenu: ime tipa, urnik in povezave pridejo s strežnika
// (`links.edit`, `links.results`). Stikalo vklopa in brisanje veljata samo za generične
// definicije (urejajo se prek `/scanners/...`); vrstice tipov vodijo na njihove strani.

@Component({
  selector: 'app-scanners-page',
  standalone: true,
  imports: [RouterLink, PageHeaderComponent, HelpButtonComponent, IonContent, IonRefresher, IonRefresherContent, IonList, IonItem, IonLabel, IonBadge, IonButton, IonIcon, IonText, IonToggle],
  template: `
    <app-page-header title="Skenerji" [subtitle]="subtitle()">
      @if (isAdmin()) {
        <ion-button slot="end" routerLink="/scanners/admin" aria-label="Administracija">
          <ion-icon slot="icon-only" name="settings-outline"></ion-icon>
        </ion-button>
      }
      <ion-button slot="end" routerLink="/scanners/new" aria-label="Nov skener">
        <ion-icon slot="icon-only" name="add-outline"></ion-icon>
      </ion-button>
    </app-page-header>
    <ion-content>
      <ion-refresher slot="fixed" (ionRefresh)="refresh($event)"><ion-refresher-content></ion-refresher-content></ion-refresher>
      <div class="page">
        @if (error(); as message) {
          <ion-text color="danger"><p class="msg">{{ message }}</p></ion-text>
          <ion-button fill="clear" size="small" (click)="load()">Poskusi znova</ion-button>
        }
        <h2 class="cd-section-title">Moji skenerji <app-help topic="scanners.types"></app-help></h2>
        @if (!loading() && scanners().length === 0) {
          <div class="empty">
            <p>Še nimaš nobenega skenerja. Skener po urniku preveri vir, si zapomni rezultate in te obvesti ob spremembah.</p>
            <ion-button fill="outline" size="small" routerLink="/scanners/new">
              <ion-icon slot="start" name="add-outline" aria-hidden="true"></ion-icon>
              Nov skener
            </ion-button>
          </div>
        }
        <ion-list lines="full">
          @for (s of scanners(); track s.id) {
            <ion-item [routerLink]="s.links.results" detail="true" [class.unavailable]="!s.typeAvailable">
              <ion-label>
                <h2>
                  {{ s.name }}
                  <ion-badge color="medium">{{ s.typeLabel }}</ion-badge>
                  @if (s.resultCount > 0) {
                    <ion-badge color="primary">{{ s.resultCount }}</ion-badge>
                  }
                  @if (!s.typeAvailable) {
                    <ion-badge color="warning">tip ni na voljo</ion-badge>
                  }
                </h2>
                <p>{{ scheduleSummary(s.schedule, s.enabled && s.typeAvailable) }}</p>
                <p><ion-text [color]="lastRun(s.lastRun).color">{{ lastRun(s.lastRun).text }}</ion-text></p>
              </ion-label>
              @if (isGeneric(s)) {
                <ion-toggle slot="end" [checked]="s.enabled" [disabled]="busy() === s.id || !s.typeAvailable" (click)="$event.stopPropagation()" (ionChange)="toggleEnabled(s, $any($event).detail.checked)" aria-label="Vklopljen"></ion-toggle>
                <ion-button slot="end" fill="clear" [routerLink]="s.links.edit" (click)="$event.stopPropagation()" aria-label="Uredi">
                  <ion-icon slot="icon-only" name="create-outline"></ion-icon>
                </ion-button>
                <ion-button slot="end" fill="clear" color="danger" [disabled]="busy() === s.id" (click)="confirmDelete(s, $event)">
                  <ion-icon slot="icon-only" name="trash-outline" aria-label="Izbriši"></ion-icon>
                </ion-button>
              }
            </ion-item>
          }
        </ion-list>
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
      .cd-section-title {
        display: flex;
        align-items: center;
        gap: var(--cd-space-2);
      }
      .empty,
      .msg {
        padding: var(--cd-space-2) 0;
      }
      h2 ion-badge {
        margin-left: var(--cd-space-1);
        vertical-align: middle;
      }
      .unavailable {
        opacity: 0.75;
      }
    `,
  ],
})
export class ScannersPage implements OnInit {
  private readonly api = inject(ScannersApi);
  private readonly router = inject(Router);
  private readonly alerts = inject(AlertController);
  private readonly currentUser = inject(CurrentUserService);

  readonly scanners = signal<ScannerSummary[]>([]);
  readonly limits = signal<Limits | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly busy = signal<string | null>(null);

  readonly isAdmin = computed(() => this.currentUser.user()?.scopes.includes('admin') === true);
  readonly subtitle = computed(() => {
    if (this.loading() && this.scanners().length === 0) return 'Nalagam …';
    const n = this.scanners().length;
    return n === 1 ? '1 skener' : n === 2 ? '2 skenerja' : n === 3 || n === 4 ? `${n} skenerji` : `${n} skenerjev`;
  });

  readonly scheduleSummary = scheduleSummary;
  readonly lastRun = lastRunText;

  private initialised = false;

  ngOnInit(): void {
    void this.currentUser.ensureLoaded();
    void this.load();
    this.initialised = true;
  }

  ionViewWillEnter(): void {
    if (this.initialised) void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const res = await this.api.list();
      this.scanners.set(res.scanners);
      this.limits.set(res.limits);
    } catch (err) {
      this.error.set(describeError(err, 'Skenerjev ni bilo mogoče naložiti.'));
    } finally {
      this.loading.set(false);
    }
  }

  async refresh(event: CustomEvent): Promise<void> {
    await this.load();
    (event.target as { complete?: () => void } | null)?.complete?.();
  }

  /** Generična definicija ima povezave pod `/scanners/`; vrstico tipa ureja tip sam. */
  isGeneric(s: ScannerSummary): boolean {
    return s.links.edit.startsWith('/scanners/');
  }

  async toggleEnabled(s: ScannerSummary, enabled: boolean): Promise<void> {
    if (s.enabled === enabled) return;
    this.busy.set(s.id);
    const previous = this.scanners();
    this.scanners.set(previous.map((x) => (x.id === s.id ? { ...x, enabled } : x)));
    try {
      await this.api.update(s.id, { enabled });
      await this.load();
    } catch (err) {
      this.scanners.set(previous);
      this.error.set(describeError(err, 'Spremembe ni bilo mogoče shraniti.'));
    } finally {
      this.busy.set(null);
    }
  }

  async confirmDelete(s: ScannerSummary, event: Event): Promise<void> {
    event.stopPropagation();
    const alert = await this.alerts.create({
      header: 'Izbrišem skener?',
      message: `Skener "${s.name}" bo izbrisan skupaj s svojimi rezultati in zgodovino.`,
      buttons: [
        { text: 'Prekliči', role: 'cancel' },
        { text: 'Izbriši', role: 'destructive' },
      ],
    });
    await alert.present();
    const { role } = await alert.onDidDismiss();
    if (role !== 'destructive') return;
    this.busy.set(s.id);
    try {
      await this.api.delete(s.id);
      this.scanners.set(this.scanners().filter((x) => x.id !== s.id));
    } catch (err) {
      this.error.set(describeError(err, 'Skenerja ni bilo mogoče izbrisati.'));
    } finally {
      this.busy.set(null);
    }
  }

  open(s: ScannerSummary): void {
    void this.router.navigateByUrl(s.links.results);
  }
}

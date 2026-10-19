import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AlertController, IonBadge, IonButton, IonContent, IonIcon, IonItem, IonLabel, IonList, IonNote, IonText, IonToggle } from '@ionic/angular/standalone';
import { PageHeaderComponent } from '../../shared/layout/page-header.component.js';
import { FlightDealsApi } from './flight-deals.api.js';
import {
  dayWindowText,
  describeError,
  checkAnalysisText,
  pluralNights,
  pluralSearches,
  searchStatusText,
  windowText,
  type FlightSearch,
  type Limits,
} from './flight-deals.model.js';

// Moja iskanja (US1): seznam z opisom kriterijev, stanjem zadnjega preverjanja, hitrim stikalom
// aktivnosti in brisanjem s potrditvijo. Uporabnik vidi SAMO svoja iskanja — strežnik drugih ne vrne.

@Component({
  selector: 'app-flight-searches-page',
  standalone: true,
  imports: [RouterLink, PageHeaderComponent, IonContent, IonList, IonItem, IonLabel, IonBadge, IonButton, IonIcon, IonNote, IonText, IonToggle],
  template: `
    <app-page-header title="Moja iskanja" backRoute="/flight-deals" backLabel="Leti" [subtitle]="subtitle()">
      <ion-button slot="end" routerLink="/flight-deals/searches/new" [disabled]="atLimit()" aria-label="Novo iskanje">
        <ion-icon slot="icon-only" name="add-outline"></ion-icon>
      </ion-button>
    </app-page-header>
    <ion-content>
      <div class="page">
        @if (error(); as message) {
          <ion-text color="danger"><p>{{ message }}</p></ion-text>
        }
        @if (atLimit()) {
          <ion-note class="cd-section-hint">Dosegel si mejo {{ limits()?.maxSearchesPerUser }} iskanj. Izbriši ali združi kakšno, preden ustvariš novo.</ion-note>
        }
        @if (!loading() && searches().length === 0) {
          <div class="empty">
            <p>Še nimaš nobenega iskanja.</p>
            <ion-button fill="outline" size="small" routerLink="/flight-deals/searches/new">
              <ion-icon slot="start" name="add-outline" aria-hidden="true"></ion-icon>
              Novo iskanje
            </ion-button>
          </div>
        }
        <ion-list lines="full">
          @for (s of searches(); track s.id) {
            <ion-item [routerLink]="['/flight-deals/searches', s.id]" detail="true">
              <ion-label>
                <h2>
                  {{ s.name }}
                  @if (s.offerCount > 0) {
                    <ion-badge color="primary">{{ s.offerCount }}</ion-badge>
                  }
                </h2>
                <p>{{ describe(s) }}</p>
                <p>{{ windowLine(s) }}</p>
                <p><ion-text [color]="status(s).color">{{ status(s).text }}</ion-text></p>
                @if (analysis(s); as a) {
                  <p>{{ a }}</p>
                }
              </ion-label>
              <ion-toggle slot="end" [checked]="s.active" [disabled]="busy() === s.id" (click)="$event.stopPropagation()" (ionChange)="toggleActive(s, $any($event).detail.checked)" aria-label="Aktivno"></ion-toggle>
              <ion-button slot="end" fill="clear" color="danger" [disabled]="busy() === s.id" (click)="confirmDelete(s, $event)">
                <ion-icon slot="icon-only" name="trash-outline" aria-label="Izbriši"></ion-icon>
              </ion-button>
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
        padding-bottom: var(--cd-space-6);
      }
      .empty {
        padding: var(--cd-space-4) var(--cd-page-padding);
        text-align: center;
      }
      h2 ion-badge {
        margin-left: var(--cd-space-1);
        vertical-align: middle;
      }
    `,
  ],
})
export class FlightSearchesPage implements OnInit {
  private readonly api = inject(FlightDealsApi);
  private readonly router = inject(Router);
  private readonly alerts = inject(AlertController);

  readonly searches = signal<FlightSearch[]>([]);
  readonly limits = signal<Limits | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly busy = signal<string | null>(null);

  readonly subtitle = computed(() => (this.loading() ? 'Nalagam …' : pluralSearches(this.searches().length)));
  readonly atLimit = computed(() => {
    const limits = this.limits();
    return limits !== null && this.searches().length >= limits.maxSearchesPerUser;
  });

  private initialised = false;

  ngOnInit(): void {
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
      const res = await this.api.listSearches();
      this.searches.set(res.searches);
      this.limits.set(res.limits);
    } catch (err) {
      this.error.set(describeError(err, 'Iskanj ni bilo mogoče naložiti.'));
    } finally {
      this.loading.set(false);
    }
  }

  describe(s: FlightSearch): string {
    const dest =
      s.destination.mode === 'any'
        ? 'kamor koli'
        : s.destination.mode === 'countries'
          ? s.destination.countries.join(', ')
          : s.destination.airports.join(', ');
    const nights = s.minNights === null ? 'enosmerno' : s.minNights === s.maxNights ? pluralNights(s.minNights) : `${s.minNights}–${s.maxNights} nočitev`;
    return `${s.departureAirports.join(', ')} → ${dest} · ${nights} · odhod ${dayWindowText(s.outbound)}`;
  }

  windowLine(s: FlightSearch): string {
    const base = s.dates.mode === 'rolling' ? `naslednjih ${s.dates.months} mesecev` : windowText(s.preview.outboundWindow);
    return s.flexDays > 0 ? `${base} (±${s.flexDays} dni)` : base;
  }

  status(s: FlightSearch) {
    return searchStatusText(s);
  }

  analysis(s: FlightSearch): string | null {
    return checkAnalysisText(s);
  }

  async toggleActive(s: FlightSearch, active: boolean): Promise<void> {
    if (s.active === active) return;
    this.busy.set(s.id);
    const previous = this.searches();
    this.searches.set(previous.map((x) => (x.id === s.id ? { ...x, active } : x)));
    try {
      const updated = await this.api.updateSearch(s.id, { active });
      this.searches.set(this.searches().map((x) => (x.id === s.id ? updated : x)));
    } catch (err) {
      this.searches.set(previous);
      this.error.set(describeError(err, 'Spremembe ni bilo mogoče shraniti.'));
    } finally {
      this.busy.set(null);
    }
  }

  async confirmDelete(s: FlightSearch, event: Event): Promise<void> {
    event.stopPropagation();
    const alert = await this.alerts.create({
      header: 'Izbrišem iskanje?',
      message: `Iskanje "${s.name}" in njegova ujemanja bodo izbrisana. Ponudbe drugih iskanj ostanejo.`,
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
      await this.api.deleteSearch(s.id);
      this.searches.set(this.searches().filter((x) => x.id !== s.id));
    } catch (err) {
      this.error.set(describeError(err, 'Iskanja ni bilo mogoče izbrisati.'));
    } finally {
      this.busy.set(null);
    }
  }

  open(id: string): void {
    void this.router.navigate(['/flight-deals/searches', id]);
  }
}

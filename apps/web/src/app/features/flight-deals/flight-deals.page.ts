import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonBadge, IonButton, IonChip, IonContent, IonIcon, IonLabel, IonNote, IonRefresher, IonRefresherContent, IonText } from '@ionic/angular/standalone';
import { PageHeaderComponent } from '../../shared/layout/page-header.component.js';
import { CurrentUserService } from '../../core/user/current-user.service.js';
import { FlightDealsApi } from './flight-deals.api.js';
import { FlightOfferTableComponent } from './offer-table.component.js';
import { OfferViewStore } from './offer-view.store.js';
import { runStatusLabel } from '../../core/scanners/scanners.model.js';
import {
  DEFAULT_OFFER_VIEW,
  checkAnalysisText,
  describeError,
  formatLjubljana,
  pluralOffers,
  pluralSearches,
  searchStatusText,
  type FlightSearch,
  type Offer,
  type OfferView,
  type Overview,
} from './flight-deals.model.js';

// Zavihek "Leti" (platform/tabs/registry.ts, id `flight-deals`) — glavna stran modula (FR-032):
// moja iskanja s stanjem in ENA tabela vseh ponudb (offer-table.component.ts) z iskanjem, filtri,
// obsegom Vse / Moje / Deljene z mano in razvrščanjem. Pogled, ki ga uporabnik nastavi, se shrani
// (offer-view.store.ts) in je ob naslednjem obisku privzet.
//
// Strežnik vrne največ 200 ponudb (najcenejše najprej, z nedosegljivimi vred); filtriranje in
// razvrščanje sta v brskalniku — čiste funkcije v flight-deals.model.ts. Povezava do
// administracije (od 016 v jedru skenerjev, `/scanners/admin`) se pokaže samo adminu — pravi varuh je
// strežnik (platform/auth/admin-guard.ts).

const OFFER_LIMIT = 200;

@Component({
  selector: 'app-flight-deals-page',
  standalone: true,
  imports: [RouterLink, PageHeaderComponent, FlightOfferTableComponent, IonContent, IonRefresher, IonRefresherContent, IonButton, IonIcon, IonChip, IonLabel, IonBadge, IonNote, IonText],
  template: `
    <app-page-header title="Leti" [subtitle]="subtitle()">
      @if (isAdmin()) {
        <ion-button slot="end" routerLink="/scanners/admin" [queryParams]="{ type: 'flights' }" aria-label="Administracija">
          <ion-icon slot="icon-only" name="settings-outline"></ion-icon>
        </ion-button>
      }
      <ion-button slot="end" routerLink="/flight-deals/searches/new" aria-label="Novo iskanje">
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

        @if (loading() && !overview()) {
          <div class="cd-skeleton row-skeleton"></div>
          <div class="cd-skeleton row-skeleton"></div>
        } @else if (overview(); as data) {
          <section>
            <h2 class="cd-section-title">
              Moja iskanja
              <a routerLink="/flight-deals/searches" class="all">vsa</a>
            </h2>
            @if (data.searches.length === 0) {
              <div class="empty">
                <p>Še nimaš nobenega iskanja. Opiši, od kod in kam bi letel, in sistem bo po urniku preverjal cene.</p>
                <ion-button fill="outline" size="small" routerLink="/flight-deals/searches/new">
                  <ion-icon slot="start" name="add-outline" aria-hidden="true"></ion-icon>
                  Novo iskanje
                </ion-button>
                <ion-button fill="clear" size="small" routerLink="/flight-deals/shared">Deljene ponudbe</ion-button>
              </div>
            } @else {
              <div class="chips">
                <ion-chip [outline]="view().searchId !== null" (click)="setSearch(null)">Vsa iskanja</ion-chip>
                @for (s of data.searches; track s.id) {
                  <ion-chip [outline]="view().searchId !== s.id" [color]="statusOf(s).color === 'danger' ? 'danger' : undefined" (click)="setSearch(s.id)">
                    <ion-label>{{ s.name }}</ion-label>
                    <ion-badge>{{ s.offerCount }}</ion-badge>
                  </ion-chip>
                }
              </div>
              @if (activeSearch(); as s) {
                <ion-note class="cd-section-hint">
                  {{ statusOf(s).text }} · <a [routerLink]="['/flight-deals/searches', s.id]">uredi iskanje</a>
                  @if (analysisOf(s); as a) {
                    <br />{{ a }}
                  }
                </ion-note>
              }
            }
          </section>

          @if (data.searches.length > 0 || hasShared()) {
            <section>
              <h2 class="cd-section-title">Ponudbe</h2>
              <app-flight-offer-table
                [offers]="offers()"
                [total]="total()"
                [now]="now()"
                [view]="view()"
                (viewChange)="onView($event)"
                [noOffersText]="noOffersText()"
              ></app-flight-offer-table>
            </section>
          }

          <ion-note class="cd-section-hint foot">
            @if (data.lastRun; as run) {
              Zadnje preverjanje: {{ formatLjubljana(run.at) }} ({{ runLabel(run.status) }}).
            } @else {
              Preverjanje še ni teklo.
            }
            Cene so take, kot jih je ob preverjanju pokazal vir; pred rezervacijo jih preveri pri viru.
          </ion-note>
        }
      </div>
    </ion-content>
  `,
  styles: [
    `
      .page {
        padding: var(--cd-space-2) var(--cd-page-padding) var(--cd-space-6);
        max-width: 1100px;
        margin: 0 auto;
      }
      section {
        margin-bottom: var(--cd-space-5);
      }
      .cd-section-title {
        display: flex;
        align-items: center;
        gap: var(--cd-space-2);
      }
      .cd-section-title .all {
        margin-left: auto;
        font-size: var(--cd-font-size-sm);
        font-weight: 400;
      }
      .chips {
        display: flex;
        flex-wrap: nowrap;
        gap: 4px;
        overflow-x: auto;
        scrollbar-width: none;
        padding-bottom: var(--cd-space-1);
      }
      .chips::-webkit-scrollbar {
        display: none;
      }
      .chips ion-chip {
        flex: 0 0 auto;
        white-space: nowrap;
      }
      .empty,
      .msg {
        padding: var(--cd-space-2) 0;
      }
      .foot {
        display: block;
        margin-top: var(--cd-space-4);
      }
      .row-skeleton {
        height: 96px;
        margin-bottom: var(--cd-space-2);
        border-radius: var(--cd-radius-lg);
      }
    `,
  ],
})
export class FlightDealsPage implements OnInit {
  private readonly api = inject(FlightDealsApi);
  private readonly currentUser = inject(CurrentUserService);
  private readonly viewStore = inject(OfferViewStore);

  readonly overview = signal<Overview | null>(null);
  readonly offers = signal<Offer[]>([]);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  /** Trenutek zadnjega nalaganja: meja za "odhod je mimo" (ne teče, da se vrstice ne premikajo same). */
  readonly now = signal(Date.now());
  readonly view = signal<OfferView>(DEFAULT_OFFER_VIEW);

  readonly formatLjubljana = formatLjubljana;

  readonly isAdmin = computed(() => this.currentUser.user()?.scopes.includes('admin') === true);
  readonly activeSearch = computed(() => this.overview()?.searches.find((s) => s.id === this.view().searchId) ?? null);
  readonly hasShared = computed(() => this.offers().some((o) => o.matches.some((m) => !m.isOwn)));
  readonly noOffersText = computed(() =>
    this.overview()?.lastRun
      ? 'Ponudb, ki bi ustrezale tvojim iskanjem, trenutno ni.'
      : 'Preverjanje še ni teklo. Prvo preverjanje sproži urnik, ki ga nastavi administrator.',
  );
  readonly subtitle = computed(() => {
    const data = this.overview();
    if (this.loading() && !data) return 'Nalagam …';
    if (!data) return null;
    return `${pluralSearches(data.searches.length)} · ${pluralOffers(data.cheapest.total)}`;
  });

  private initialised = false;
  private viewLoaded = false;

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
      // Ključ shranjenega pogleda je po uporabniku, zato najprej on.
      await this.currentUser.ensureLoaded();
      if (!this.viewLoaded) {
        this.view.set(this.viewStore.load('overview'));
        this.viewLoaded = true;
      }
      const [data, list] = await Promise.all([
        this.api.overview(20),
        this.api.listOffers({ scope: 'all', sort: 'price', includeUnavailable: true, limit: OFFER_LIMIT }),
      ]);
      this.overview.set(data);
      this.offers.set(list.offers);
      this.total.set(list.total);
      this.now.set(Date.now());
      // Shranjeno iskanje, ki ga ni več (izbrisano), bi dalo prazno tabelo brez razloga.
      const searchId = this.view().searchId;
      if (searchId && !data.searches.some((s) => s.id === searchId)) this.onView({ ...this.view(), searchId: null });
    } catch (err) {
      this.error.set(describeError(err, 'Ponudb ni bilo mogoče naložiti.'));
    } finally {
      this.loading.set(false);
    }
  }

  async refresh(event: CustomEvent): Promise<void> {
    await this.load();
    (event.target as { complete?: () => void } | null)?.complete?.();
  }

  onView(view: OfferView): void {
    this.view.set(view);
    this.viewStore.save('overview', view);
  }

  /** Klik na že izbrani čip iskanja ga izklopi. */
  setSearch(id: string | null): void {
    this.onView({ ...this.view(), searchId: this.view().searchId === id ? null : id });
  }

  statusOf(search: FlightSearch) {
    return searchStatusText(search);
  }

  analysisOf(search: FlightSearch): string | null {
    return checkAnalysisText(search);
  }

  runLabel(status: string): string {
    return runStatusLabel(status);
  }
}

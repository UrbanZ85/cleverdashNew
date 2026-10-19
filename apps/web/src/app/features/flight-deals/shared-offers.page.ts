import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { IonButton, IonContent, IonNote, IonRefresher, IonRefresherContent, IonText } from '@ionic/angular/standalone';
import { PageHeaderComponent } from '../../shared/layout/page-header.component.js';
import { CurrentUserService } from '../../core/user/current-user.service.js';
import { FlightDealsApi } from './flight-deals.api.js';
import { FlightOfferTableComponent } from './offer-table.component.js';
import { OfferViewStore } from './offer-view.store.js';
import { DEFAULT_OFFER_VIEW, describeError, pluralOffers, type Offer, type OfferView } from './flight-deals.model.js';

// Deljene ponudbe (US5, FR-041): ponudbe iskanj, pri katerih je klicatelj prejemnik — ista tabela
// kot na glavni strani (offer-table.component.ts), brez izbire obsega (tu je vse deljeno); stolpec
// Iskanje nosi ime iskanja in lastnika. Pogled (vrsta, direktni, pretečene, red) se shrani posebej
// za to stran. Kriterijev iskanja tu NI in jih strežnik ne vrne.

const OFFER_LIMIT = 200;

@Component({
  selector: 'app-flight-shared-offers-page',
  standalone: true,
  imports: [PageHeaderComponent, FlightOfferTableComponent, IonContent, IonRefresher, IonRefresherContent, IonNote, IonText, IonButton],
  template: `
    <app-page-header title="Deljene ponudbe" backRoute="/flight-deals" backLabel="Leti" [subtitle]="subtitle()"></app-page-header>
    <ion-content>
      <ion-refresher slot="fixed" (ionRefresh)="refresh($event)"><ion-refresher-content></ion-refresher-content></ion-refresher>
      <div class="page">
        @if (error(); as message) {
          <ion-text color="danger"><p>{{ message }}</p></ion-text>
          <ion-button fill="clear" size="small" (click)="load()">Poskusi znova</ion-button>
        }
        @if (loading() && !loaded()) {
          <div class="cd-skeleton row-skeleton"></div>
          <div class="cd-skeleton row-skeleton"></div>
        } @else if (loaded() && offers().length === 0 && !error()) {
          <div class="empty">
            <p>Nihče še ne deli ponudb s tabo.</p>
            <ion-note>Lastnik iskanja te doda med prejemnike obvestil; od takrat vidiš njegove ponudbe tukaj in dobivaš iste dopise.</ion-note>
          </div>
        } @else if (loaded()) {
          <app-flight-offer-table
            [offers]="offers()"
            [total]="total()"
            [now]="now()"
            [view]="view()"
            (viewChange)="onView($event)"
            [allowScope]="false"
          ></app-flight-offer-table>
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
      .empty {
        padding: var(--cd-space-4) 0;
      }
      .row-skeleton {
        height: 96px;
        margin-bottom: var(--cd-space-2);
        border-radius: var(--cd-radius-lg);
      }
    `,
  ],
})
export class FlightSharedOffersPage implements OnInit {
  private readonly api = inject(FlightDealsApi);
  private readonly currentUser = inject(CurrentUserService);
  private readonly viewStore = inject(OfferViewStore);

  readonly offers = signal<Offer[]>([]);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly loaded = signal(false);
  readonly error = signal<string | null>(null);
  readonly now = signal(Date.now());
  readonly view = signal<OfferView>(DEFAULT_OFFER_VIEW);

  readonly subtitle = computed(() => (this.loading() && !this.loaded() ? 'Nalagam …' : pluralOffers(this.total())));

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
      await this.currentUser.ensureLoaded();
      if (!this.viewLoaded) {
        // Obseg in izbrano iskanje na tej strani nimata pomena: vse je deljeno, čipov iskanj ni.
        this.view.set({ ...this.viewStore.load('shared'), scope: 'all', searchId: null });
        this.viewLoaded = true;
      }
      const res = await this.api.listOffers({ scope: 'shared', sort: 'price', includeUnavailable: true, limit: OFFER_LIMIT });
      this.offers.set(res.offers);
      this.total.set(res.total);
      this.now.set(Date.now());
      this.loaded.set(true);
    } catch (err) {
      this.error.set(describeError(err, 'Deljenih ponudb ni bilo mogoče naložiti.'));
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
    this.viewStore.save('shared', view);
  }
}

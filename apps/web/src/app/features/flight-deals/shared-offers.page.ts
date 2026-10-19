import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { IonButton, IonContent, IonNote, IonText } from '@ionic/angular/standalone';
import { PageHeaderComponent } from '../../shared/layout/page-header.component.js';
import { FlightDealsApi } from './flight-deals.api.js';
import { FlightOfferCardComponent } from './offer-card.component.js';
import { describeError, pluralOffers, type Offer } from './flight-deals.model.js';

// Deljene ponudbe (US5, FR-041): ponudbe iskanj, pri katerih je klicatelj prejemnik — v skupinah po
// iskanju z imenom lastnika. Kriterijev iskanja tu NI in jih strežnik ne vrne.

interface Group {
  key: string;
  title: string;
  owner: string;
  offers: Offer[];
}

@Component({
  selector: 'app-flight-shared-offers-page',
  standalone: true,
  imports: [PageHeaderComponent, FlightOfferCardComponent, IonContent, IonNote, IonText, IonButton],
  template: `
    <app-page-header title="Deljene ponudbe" backRoute="/flight-deals" backLabel="Leti" [subtitle]="subtitle()"></app-page-header>
    <ion-content>
      <div class="page">
        @if (error(); as message) {
          <ion-text color="danger"><p>{{ message }}</p></ion-text>
          <ion-button fill="clear" size="small" (click)="load()">Poskusi znova</ion-button>
        }
        @if (!loading() && groups().length === 0 && !error()) {
          <div class="empty">
            <p>Nihče še ne deli ponudb s tabo.</p>
            <ion-note>Lastnik iskanja te doda med prejemnike obvestil; od takrat vidiš njegove ponudbe tukaj in dobivaš iste dopise.</ion-note>
          </div>
        }
        @for (group of groups(); track group.key) {
          <section>
            <h2 class="cd-section-title">{{ group.title }} <small>deli {{ group.owner }}</small></h2>
            <div class="list">
              @for (offer of group.offers; track offer.id) {
                <app-flight-offer-card [offer]="offer" [showSearches]="false"></app-flight-offer-card>
              }
            </div>
          </section>
        }
        @if (total() > offers().length) {
          <ion-note class="cd-section-hint">… in še {{ total() - offers().length }}.</ion-note>
        }
      </div>
    </ion-content>
  `,
  styles: [
    `
      .page {
        padding: var(--cd-space-2) var(--cd-page-padding) var(--cd-space-6);
        max-width: 900px;
        margin: 0 auto;
      }
      .cd-section-title small {
        color: var(--cd-text-muted);
        font-weight: 400;
        margin-left: var(--cd-space-2);
      }
      .list {
        display: grid;
        gap: var(--cd-space-2);
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      }
      .empty {
        padding: var(--cd-space-4) 0;
      }
    `,
  ],
})
export class FlightSharedOffersPage implements OnInit {
  private readonly api = inject(FlightDealsApi);

  readonly offers = signal<Offer[]>([]);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly subtitle = computed(() => (this.loading() ? 'Nalagam …' : pluralOffers(this.total())));
  readonly groups = computed<Group[]>(() => {
    const map = new Map<string, Group>();
    for (const offer of this.offers()) {
      for (const match of offer.matches.filter((m) => !m.isOwn)) {
        const group = map.get(match.searchId) ?? { key: match.searchId, title: match.searchName, owner: match.owner?.displayName ?? 'druga oseba', offers: [] };
        group.offers.push(offer);
        map.set(match.searchId, group);
      }
    }
    return [...map.values()];
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
      const res = await this.api.listOffers({ scope: 'shared', sort: 'price', limit: 100 });
      this.offers.set(res.offers);
      this.total.set(res.total);
    } catch (err) {
      this.error.set(describeError(err, 'Deljenih ponudb ni bilo mogoče naložiti.'));
    } finally {
      this.loading.set(false);
    }
  }
}

import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IonBadge, IonButton, IonContent, IonIcon, IonItem, IonLabel, IonList, IonNote, IonText } from '@ionic/angular/standalone';
import { PageHeaderComponent } from '../../shared/layout/page-header.component.js';
import { FlightDealsApi } from './flight-deals.api.js';
import { FlightOfferCardComponent } from './offer-card.component.js';
import { FlightPriceChartComponent } from './price-chart.component.js';
import { AiAnalysisCardComponent } from '../../shared/ai-analysis/ai-analysis-card.component.js';
import { CHANGE_LABELS, changeColor, describeError, formatLjubljana, formatLocalDateTime, formatPrice, type HistoryPoint, type OfferDetail } from './flight-deals.model.js';

// Podrobnosti ponudbe (US3): kartica, graf in tabela zgodovine cen, ujemanja (katera iskanja; pri
// deljenih lastnik), povezava do rezervacije. 404 od strežnika pomeni, da ponudba za klicatelja ne
// obstaja (FR-031) — pokaže se kot "ni najdena", ne kot napaka dostopa.

@Component({
  selector: 'app-flight-offer-detail-page',
  standalone: true,
  imports: [RouterLink, PageHeaderComponent, FlightOfferCardComponent, FlightPriceChartComponent, AiAnalysisCardComponent, IonContent, IonList, IonItem, IonLabel, IonBadge, IonButton, IonIcon, IonNote, IonText],
  template: `
    <app-page-header title="Ponudba" backRoute="/flight-deals" backLabel="Leti" [subtitle]="subtitle()"></app-page-header>
    <ion-content>
      <div class="page">
        @if (error(); as message) {
          <ion-text color="danger"><p>{{ message }}</p></ion-text>
          <ion-button fill="clear" size="small" (click)="load()">Poskusi znova</ion-button>
        }
        @if (offer(); as o) {
          <app-flight-offer-card [offer]="o" [showSearches]="false"></app-flight-offer-card>

          <div class="actions">
            @if (o.bookingUrl) {
              <ion-button [href]="o.bookingUrl" target="_blank" rel="noopener">
                <ion-icon slot="start" name="open-outline" aria-hidden="true"></ion-icon>
                Rezervacija pri viru
              </ion-button>
            } @else {
              <ion-note>Vir ni dal povezave do rezervacije.</ion-note>
            }
          </div>

          @if (o.aiAnalysis; as a) {
            <section>
              <h2 class="cd-section-title">Analiza z umetno inteligenco</h2>
              <app-ai-analysis-card [analysis]="a"></app-ai-analysis-card>
            </section>
          }

          <section>
            <h2 class="cd-section-title">Leti</h2>
            <ion-list lines="full">
              <ion-item>
                <ion-label>
                  <h3>Odhod · {{ o.origin.city }} ({{ o.origin.iata }}) → {{ o.destination.city }} ({{ o.destination.iata }})</h3>
                  <p>{{ formatLocalDateTime(o.outbound.departureAt, o.outbound.departureTz) }} ({{ o.outbound.departureTz }})</p>
                  @if (o.outbound.arrivalAt) {
                    <p>pristanek {{ formatLocalDateTime(o.outbound.arrivalAt, o.outbound.arrivalTz) }} ({{ o.outbound.arrivalTz }})</p>
                  }
                  <p>{{ o.outbound.flightNumbers.join(', ') || o.airline }} · {{ o.outbound.stops === 0 ? 'direktno' : o.outbound.stops + ' prestop' }}</p>
                </ion-label>
              </ion-item>
              @if (o.inbound; as inb) {
                <ion-item>
                  <ion-label>
                    <h3>Povratek · {{ o.destination.city }} → {{ o.origin.city }}</h3>
                    <p>{{ formatLocalDateTime(inb.departureAt, inb.departureTz) }} ({{ inb.departureTz }})</p>
                    @if (inb.arrivalAt) {
                      <p>pristanek {{ formatLocalDateTime(inb.arrivalAt, inb.arrivalTz) }} ({{ inb.arrivalTz }})</p>
                    }
                    <p>{{ inb.flightNumbers.join(', ') || o.airline }} · {{ inb.stops === 0 ? 'direktno' : inb.stops + ' prestop' }}</p>
                  </ion-label>
                </ion-item>
              }
              @if (o.priceIncludes) {
                <ion-item lines="none"><ion-note>{{ o.priceIncludes }}</ion-note></ion-item>
              }
            </ion-list>
          </section>

          <section>
            <h2 class="cd-section-title">Zgodovina cene</h2>
            @if (o.history.length === 0) {
              <ion-note class="cd-section-hint">Zgodovine še ni.</ion-note>
            } @else {
              <app-flight-price-chart [history]="o.history" [currency]="o.price.currency"></app-flight-price-chart>
              <ion-list lines="full">
                @for (h of historyDesc(); track h.checkedAt) {
                  <ion-item>
                    <ion-label>
                      <h3>{{ formatLjubljana(h.checkedAt) }}</h3>
                      <p>{{ CHANGE_LABELS[h.changeType] }}</p>
                    </ion-label>
                    <div slot="end" class="hprice">
                      @if (h.previousPrice && (h.changeType === 'PRICE_DOWN' || h.changeType === 'PRICE_UP')) {
                        <s>{{ formatPrice(h.previousPrice) }}</s>
                      }
                      @if (h.price) {
                        <ion-text [color]="changeColor(h.changeType) ?? undefined"><strong>{{ formatPrice(h.price) }}</strong></ion-text>
                      } @else {
                        <ion-text color="medium">—</ion-text>
                      }
                    </div>
                  </ion-item>
                }
              </ion-list>
            }
          </section>

          <section>
            <h2 class="cd-section-title">Ustreza iskanjem</h2>
            <ion-list lines="full">
              @for (m of o.matches; track m.searchId) {
                <ion-item [routerLink]="m.isOwn ? ['/flight-deals/searches', m.searchId] : null" [detail]="m.isOwn">
                  <ion-label>
                    <h3>{{ m.searchName }}</h3>
                    <p>{{ m.isOwn ? 'tvoje iskanje' : 'deli ' + (m.owner?.displayName ?? 'druga oseba') }} · prvič {{ formatLjubljana(m.firstMatchedAt) }}</p>
                  </ion-label>
                  <ion-badge slot="end" [color]="m.changeType === 'NEW' ? 'primary' : (changeColor(m.changeType) ?? 'medium')">{{ CHANGE_LABELS[m.changeType] }}</ion-badge>
                </ion-item>
              }
            </ion-list>
          </section>
        }
      </div>
    </ion-content>
  `,
  styles: [
    `
      .page {
        padding: var(--cd-space-2) var(--cd-page-padding) var(--cd-space-6);
        max-width: 780px;
        margin: 0 auto;
      }
      section {
        margin-top: var(--cd-space-4);
      }
      .actions {
        margin-top: var(--cd-space-3);
        display: flex;
        gap: var(--cd-space-2);
        align-items: center;
        flex-wrap: wrap;
      }
      .hprice {
        display: flex;
        gap: var(--cd-space-2);
        align-items: baseline;
      }
      .hprice s {
        color: var(--cd-text-muted);
      }
    `,
  ],
})
export class FlightOfferDetailPage implements OnInit {
  private readonly api = inject(FlightDealsApi);
  private readonly route = inject(ActivatedRoute);

  readonly offer = signal<OfferDetail | null>(null);
  readonly error = signal<string | null>(null);

  readonly CHANGE_LABELS = CHANGE_LABELS;
  readonly changeColor = changeColor;
  readonly formatPrice = formatPrice;
  readonly formatLjubljana = formatLjubljana;
  readonly formatLocalDateTime = formatLocalDateTime;

  readonly subtitle = computed(() => {
    const o = this.offer();
    return o ? `${o.origin.iata} → ${o.destination.iata} · ${formatPrice(o.price)}` : null;
  });
  readonly historyDesc = computed<HistoryPoint[]>(() => [...(this.offer()?.history ?? [])].reverse());

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.error.set(null);
    const id = this.route.snapshot.paramMap.get('offerId');
    if (!id) return;
    try {
      this.offer.set(await this.api.getOffer(id));
    } catch (err) {
      this.error.set(describeError(err, 'Ponudbe ni bilo mogoče naložiti ali zate ne obstaja.'));
    }
  }
}

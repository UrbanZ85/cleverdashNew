import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonBadge, IonIcon, IonText } from '@ionic/angular/standalone';
import { riskColor, riskLabel } from '../../core/scanners/scanners.model.js';
import {
  airlinesText,
  changeColor,
  changeText,
  formatLjubljana,
  formatLocalDate,
  formatLocalTime,
  formatPrice,
  offerStatus,
  passengersText,
  pluralNights,
  searchNamesText,
  stopsText,
  type Offer,
} from './flight-deals.model.js';

// Kartica ponudbe (FR-030, FR-032, FR-035): letališči, prevoznik, časi v LOKALNEM času letališča,
// nočitve, potniki, cena, prečrtana stara cena z barvo spremembe, značka vira in čas podatka.
// Uporablja jo stran s podrobnostmi in seznam deljenih ponudb; glavna stran kaže tabelo.
//
// Stara cena je `<s>` in nova obarvana z `ion-text color="success|danger"`: barva sama na nekaterih
// zaslonih ni vidna, prečrtanje je. Pri NOVO ni prejšnje cene in ni primerjave (FR-030).
// Neuradni vir ima opozorilno značko (FR-020); čas podatka je ločen od časa preverjanja (FR-019).
// Značka (Novo / Pocenitev / Pretečeno …) je ista funkcija kot v tabeli (`offerStatus`).

@Component({
  selector: 'app-flight-offer-card',
  standalone: true,
  imports: [RouterLink, IonBadge, IonIcon, IonText],
  template: `
    <a class="card" [class.unavailable]="expired()" [routerLink]="['/flight-deals/offers', offer().id]">
      <div class="route">
        <span class="airport">
          <strong>{{ offer().origin.iata }}</strong>
          <small>{{ offer().origin.city }}</small>
        </span>
        <ion-icon name="airplane-outline" aria-hidden="true"></ion-icon>
        <span class="airport">
          <strong>{{ offer().destination.iata }}</strong>
          <small>{{ offer().destination.city }}, {{ offer().destination.countryName }}</small>
        </span>
        <span class="badges">
          @if (badge(); as b) {
            <ion-badge [color]="b.color">{{ b.label }}</ion-badge>
          }
          @if (!offer().providerOfficial) {
            <ion-badge color="warning" title="Neuradni vir">neuradni vir</ion-badge>
          }
          @if (offer().aiAnalysis; as a) {
            <ion-badge [color]="riskColor(a.riskLevel)" title="Ocena z umetno inteligenco">UI: {{ riskLabel(a.riskLevel) }}</ion-badge>
          }
        </span>
      </div>

      <div class="times">
        <span>
          <ion-icon name="calendar-outline" aria-hidden="true"></ion-icon>
          {{ outDate() }} ob {{ outTime() }}
          @if (offer().inbound; as inbound) {
            → {{ inDate() }} ob {{ inTime() }}
          }
        </span>
        @if (offer().nights !== null) {
          <span>· {{ nights() }}</span>
        }
        <span>· {{ stops() }}</span>
      </div>

      <div class="meta">
        {{ airlines() }} · {{ passengers() }}
        @if (showSearches() && offer().matches.length > 0) {
          · {{ searchNames() }}
        }
      </div>

      <div class="price-row">
        @if (offer().previousPrice && offer().change && offer().change!.type !== 'NEW') {
          <s class="old">{{ formatPrice(offer().previousPrice) }}</s>
        }
        @if (color(); as c) {
          <ion-text [color]="c"><span class="price">{{ formatPrice(offer().price) }}</span></ion-text>
        } @else {
          <span class="price">{{ formatPrice(offer().price) }}</span>
        }
        <span class="per-person">{{ formatPrice(offer().pricePerPerson) }}/osebo</span>
        @if (delta(); as d) {
          <ion-text [color]="color() ?? 'medium'"><span class="delta">{{ d }}</span></ion-text>
        } @else if (offer().providerPreviousPrice && !offer().previousPrice) {
          <span class="per-person" title="Prejšnja cena po navedbi vira">vir: prej {{ formatPrice(offer().providerPreviousPrice) }}</span>
        }
      </div>

      <div class="foot">
        <span>{{ offer().providerLabel }} · podatek {{ dataAt() }}</span>
      </div>
    </a>
  `,
  styles: [
    `
      .card {
        display: block;
        text-decoration: none;
        color: var(--ion-text-color);
        background: var(--cd-surface-raised);
        border: 1px solid var(--cd-divider);
        border-radius: var(--cd-radius-lg);
        padding: var(--cd-space-3) var(--cd-space-4);
        box-shadow: var(--cd-shadow-sm);
      }
      .card.unavailable {
        opacity: 0.6;
      }
      .route {
        display: flex;
        align-items: center;
        gap: var(--cd-space-2);
        flex-wrap: wrap;
      }
      .airport {
        display: flex;
        flex-direction: column;
        line-height: 1.1;
      }
      .airport strong {
        font-size: var(--cd-font-size-lg);
        letter-spacing: 0.02em;
      }
      .airport small {
        color: var(--cd-text-muted);
        font-size: var(--cd-font-size-xs);
      }
      .badges {
        margin-left: auto;
        display: flex;
        gap: var(--cd-space-1);
      }
      .times,
      .meta,
      .foot {
        font-size: var(--cd-font-size-sm);
        color: var(--cd-text-muted);
        margin-top: var(--cd-space-1);
        display: flex;
        gap: var(--cd-space-1);
        flex-wrap: wrap;
        align-items: center;
      }
      .foot {
        font-size: var(--cd-font-size-xs);
      }
      .price-row {
        display: flex;
        align-items: baseline;
        gap: var(--cd-space-2);
        margin-top: var(--cd-space-2);
        flex-wrap: wrap;
      }
      .price {
        font-size: var(--cd-font-size-xl);
        font-weight: 700;
      }
      .old {
        color: var(--cd-text-muted);
      }
      .per-person,
      .delta {
        font-size: var(--cd-font-size-sm);
      }
      .per-person {
        color: var(--cd-text-muted);
      }
      .delta {
        font-weight: 600;
      }
    `,
  ],
})
export class FlightOfferCardComponent {
  readonly offer = input.required<Offer>();
  /** Ali naj kartica izpiše imena iskanj, ki jim ponudba ustreza (na skupnih seznamih da). */
  readonly showSearches = input(true);

  readonly formatPrice = formatPrice;
  readonly riskColor = riskColor;
  readonly riskLabel = riskLabel;

  readonly color = computed(() => changeColor(this.offer().change?.type ?? null));
  readonly delta = computed(() => changeText(this.offer().change, this.offer().price.currency));
  readonly status = computed(() => offerStatus(this.offer()));
  readonly expired = computed(() => this.status().key === 'unavailable' || this.status().key === 'departed');
  readonly badge = computed(() => {
    const s = this.status();
    return s.label ? { label: s.label, color: s.color ?? 'medium' } : null;
  });
  readonly outDate = computed(() => formatLocalDate(this.offer().outbound.departureAt, this.offer().outbound.departureTz));
  readonly outTime = computed(() => formatLocalTime(this.offer().outbound.departureAt, this.offer().outbound.departureTz));
  readonly inDate = computed(() => (this.offer().inbound ? formatLocalDate(this.offer().inbound!.departureAt, this.offer().inbound!.departureTz) : ''));
  readonly inTime = computed(() => (this.offer().inbound ? formatLocalTime(this.offer().inbound!.departureAt, this.offer().inbound!.departureTz) : ''));
  readonly nights = computed(() => pluralNights(this.offer().nights));
  readonly stops = computed(() => stopsText(this.offer()));
  readonly passengers = computed(() => passengersText(this.offer().passengers));
  readonly airlines = computed(() => airlinesText(this.offer()));
  readonly dataAt = computed(() => formatLjubljana(this.offer().dataAt));
  readonly searchNames = computed(() => searchNamesText(this.offer()));
}

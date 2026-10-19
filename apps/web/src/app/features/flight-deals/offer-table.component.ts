import { Component, computed, input, model, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonBadge, IonButton, IonCheckbox, IonChip, IonIcon, IonLabel, IonNote, IonSearchbar, IonSegment, IonSegmentButton, IonText } from '@ionic/angular/standalone';
import { riskColor, riskLabel } from '../../core/scanners/scanners.model.js';
import { AiAnalysisCardComponent } from '../../shared/ai-analysis/ai-analysis-card.component.js';
import {
  airlinesText,
  changeColor,
  changeText,
  filterOffers,
  formatLjubljana,
  formatLocalDate,
  formatLocalDateTime,
  formatLocalTime,
  formatPrice,
  isExpiredOffer,
  offerCounts,
  offerStatus,
  offerViewFilters,
  passengersText,
  pluralNights,
  pluralOffers,
  searchNamesText,
  sortOffers,
  stopsText,
  toggleOfferSort,
  type Offer,
  type OfferKindFilter,
  type OfferScope,
  type OfferSortKey,
  type OfferView,
  type Segment,
} from './flight-deals.model.js';

// Tabela ponudb s filtri — skupna glavni strani (Leti) in strani Deljene ponudbe, da je pogled na
// deljene stvari ENAK pogledu na lastne. Iskalnik, obseg (Vse / Moje / Deljene z mano), čipi vrste,
// samo direktni, pretečene in razvrščanje po stolpcih; klik na vrstico odpre podrobnosti pod njo.
//
// Stanje pogleda (`view`) je dvosmerno (`model`): stran ga poda in ob vsaki spremembi dobi novega,
// da ga shrani (offer-view.store.ts) — kar uporabnik pritisne, je njegov privzeti pogled. Besedilo
// iskalnika in odprta vrstica sta lokalna: to ni nastavitev, ampak trenutna poizvedba.
//
// Vsa logika (kaj je pretečeno, iskanje brez šumnikov, števci, red) je v flight-deals.model.ts.

const COLUMN_COUNT = 9;

@Component({
  selector: 'app-flight-offer-table',
  standalone: true,
  imports: [RouterLink, AiAnalysisCardComponent, IonBadge, IonButton, IonCheckbox, IonChip, IonIcon, IonLabel, IonNote, IonSearchbar, IonSegment, IonSegmentButton, IonText],
  template: `
    <div class="filters">
      <ion-searchbar
        class="search"
        placeholder="Išči: letališče, mesto, država, prevoznik, iskanje"
        aria-label="Išči po ponudbah"
        [debounce]="200"
        [value]="query()"
        (ionInput)="query.set($any($event).detail.value ?? '')"
      ></ion-searchbar>

      <!-- Obseg se pokaže SAMO, kadar so tu lastne in deljene ponudbe hkrati: sicer bi bil preklop
           med dvema enakima seznamoma in tretjim praznim (vzorec recipes.page). -->
      @if (scopeVisible()) {
        <ion-segment class="scope" [value]="view().scope" (ionChange)="setScope($any($event).detail.value)">
          <ion-segment-button value="all"><ion-label>Vse</ion-label></ion-segment-button>
          <ion-segment-button value="own"><ion-label>Moje</ion-label></ion-segment-button>
          <ion-segment-button value="shared"><ion-label>Deljene z mano</ion-label></ion-segment-button>
        </ion-segment>
      }

      <div class="chips">
        <ion-chip [outline]="view().kind !== 'all'" (click)="setKind('all')">
          <ion-label>Vse</ion-label>
          <ion-badge>{{ counts().all }}</ion-badge>
        </ion-chip>
        <ion-chip color="primary" [outline]="view().kind !== 'new'" (click)="setKind('new')">
          <ion-label>Novo</ion-label>
          <ion-badge>{{ counts().new }}</ion-badge>
        </ion-chip>
        <ion-chip color="success" [outline]="view().kind !== 'down'" (click)="setKind('down')">
          <ion-label>Pocenitve</ion-label>
          <ion-badge>{{ counts().down }}</ion-badge>
        </ion-chip>
        <ion-chip color="danger" [outline]="view().kind !== 'up'" (click)="setKind('up')">
          <ion-label>Podražitve</ion-label>
          <ion-badge>{{ counts().up }}</ion-badge>
        </ion-chip>
        <ion-chip [outline]="!view().directOnly" (click)="patch({ directOnly: !view().directOnly })">
          <ion-icon name="airplane-outline" aria-hidden="true"></ion-icon>
          <ion-label>Samo direktni</ion-label>
        </ion-chip>
      </div>

      <ion-checkbox class="expired-toggle" labelPlacement="end" [checked]="view().showExpired" (ionChange)="patch({ showExpired: $any($event).detail.checked })">
        Pokaži tudi pretečene
        @if (counts().expired > 0) {
          ({{ counts().expired }})
        }
      </ion-checkbox>
    </div>

    @if (rows().length === 0) {
      <ion-note class="cd-section-hint">
        @if (offers().length === 0) {
          {{ noOffersText() }}
        } @else if (counts().expired > 0 && !view().showExpired) {
          Nobena aktualna ponudba ne ustreza filtrom; {{ pluralOffers(counts().expired) }} je pretečenih — vklopi »Pokaži tudi pretečene«.
        } @else {
          Nobena ponudba ne ustreza filtrom.
        }
      </ion-note>
    } @else {
      <div class="table-wrap">
        <table class="offers">
          <thead>
            <tr>
              <th class="status"><span class="sr-only">Stanje</span></th>
              <th [class.sorted]="view().sort.key === 'route'" [attr.aria-sort]="ariaSort('route')">
                <button type="button" (click)="setSort('route')">Relacija{{ arrow('route') }}</button>
              </th>
              <th [class.sorted]="view().sort.key === 'departure'" [attr.aria-sort]="ariaSort('departure')">
                <button type="button" (click)="setSort('departure')">Odhod{{ arrow('departure') }}</button>
              </th>
              <th class="opt" [class.sorted]="view().sort.key === 'return'" [attr.aria-sort]="ariaSort('return')">
                <button type="button" (click)="setSort('return')">Povratek{{ arrow('return') }}</button>
              </th>
              <th class="opt">Let</th>
              <th class="num" [class.sorted]="view().sort.key === 'price'" [attr.aria-sort]="ariaSort('price')">
                <button type="button" (click)="setSort('price')">Cena{{ arrow('price') }}</button>
              </th>
              <th class="num opt" [class.sorted]="view().sort.key === 'perPerson'" [attr.aria-sort]="ariaSort('perPerson')">
                <button type="button" (click)="setSort('perPerson')">Na osebo{{ arrow('perPerson') }}</button>
              </th>
              <th class="opt" [class.sorted]="view().sort.key === 'search'" [attr.aria-sort]="ariaSort('search')">
                <button type="button" (click)="setSort('search')">Iskanje{{ arrow('search') }}</button>
              </th>
              <th class="num opt" [class.sorted]="view().sort.key === 'dataAt'" [attr.aria-sort]="ariaSort('dataAt')">
                <button type="button" (click)="setSort('dataAt')">Podatek{{ arrow('dataAt') }}</button>
              </th>
            </tr>
          </thead>
          <tbody>
            @for (row of rows(); track row.id) {
              <tr
                class="row"
                [class.expired]="isExpired(row)"
                [class.open]="expanded() === row.id"
                tabindex="0"
                role="button"
                [attr.aria-expanded]="expanded() === row.id"
                (click)="toggle(row.id)"
                (keydown.enter)="toggle(row.id)"
                (keydown.space)="toggle(row.id); $event.preventDefault()"
              >
                <td class="status">
                  @if (status(row); as s) {
                    @if (s.label) {
                      <ion-badge [color]="s.color">{{ s.label }}</ion-badge>
                    }
                  }
                  @if (!row.providerOfficial) {
                    <ion-badge color="warning" title="Neuradni vir">neuradni</ion-badge>
                  }
                  @if (row.aiAnalysis; as a) {
                    <ion-badge [color]="riskColor(a.riskLevel)" title="Ocena z umetno inteligenco">UI: {{ riskLabel(a.riskLevel) }}</ion-badge>
                  }
                </td>
                <td class="route">
                  <strong>{{ row.origin.iata }} → {{ row.destination.iata }}</strong>
                  <small>{{ row.origin.city }} → {{ row.destination.city }}, {{ row.destination.countryName }}</small>
                </td>
                <td class="when">
                  <span>{{ localDate(row.outbound) }}</span>
                  <small>ob {{ localTime(row.outbound) }}</small>
                  @if (row.inbound; as inb) {
                    <small class="m-only">
                      → {{ localDate(inb) }}
                      @if (row.nights !== null) {
                        · {{ pluralNights(row.nights) }}
                      }
                    </small>
                  }
                </td>
                <td class="when opt">
                  @if (row.inbound; as inb) {
                    <span>{{ localDate(inb) }}</span>
                    <small>
                      ob {{ localTime(inb) }}
                      @if (row.nights !== null) {
                        · {{ pluralNights(row.nights) }}
                      }
                    </small>
                  } @else {
                    <small>enosmerno</small>
                  }
                </td>
                <td class="flight opt">
                  <span>{{ airlinesText(row) }}</span>
                  <small>{{ stopsText(row) }} · {{ passengersText(row.passengers) }}</small>
                </td>
                <td class="num price">
                  @if (row.previousPrice && row.change && row.change.type !== 'NEW' && row.change.type !== 'UNAVAILABLE') {
                    <s>{{ formatPrice(row.previousPrice) }}</s>
                  }
                  @if (changeColor(row.change?.type); as c) {
                    <ion-text [color]="c"><strong>{{ formatPrice(row.price) }}</strong></ion-text>
                    <ion-text [color]="c"><small class="delta">{{ changeText(row.change, row.price.currency) }}</small></ion-text>
                  } @else {
                    <strong>{{ formatPrice(row.price) }}</strong>
                  }
                  <small class="m-only">{{ formatPrice(row.pricePerPerson) }}/osebo</small>
                </td>
                <td class="num opt">{{ formatPrice(row.pricePerPerson) }}</td>
                <td class="searches opt">{{ searchNamesText(row) }}</td>
                <td class="num opt muted">{{ formatLjubljana(row.dataAt) }}</td>
              </tr>
              @if (expanded() === row.id) {
                <tr class="details">
                  <td [attr.colspan]="columnCount">
                    <div class="detail-grid">
                      <div>
                        <h4>Odhod</h4>
                        <p>{{ row.origin.city }} ({{ row.origin.iata }}) → {{ row.destination.city }} ({{ row.destination.iata }})</p>
                        <p>{{ formatLocalDateTime(row.outbound.departureAt, row.outbound.departureTz) }}</p>
                        @if (row.outbound.arrivalAt) {
                          <p class="muted">pristanek {{ formatLocalDateTime(row.outbound.arrivalAt, row.outbound.arrivalTz) }}</p>
                        }
                        <p class="muted">{{ row.outbound.flightNumbers.join(', ') || row.airline }} · {{ segmentStops(row.outbound) }}</p>
                      </div>
                      @if (row.inbound; as inb) {
                        <div>
                          <h4>Povratek</h4>
                          <p>{{ row.destination.city }} ({{ row.destination.iata }}) → {{ row.origin.city }} ({{ row.origin.iata }})</p>
                          <p>{{ formatLocalDateTime(inb.departureAt, inb.departureTz) }}</p>
                          @if (inb.arrivalAt) {
                            <p class="muted">pristanek {{ formatLocalDateTime(inb.arrivalAt, inb.arrivalTz) }}</p>
                          }
                          <p class="muted">{{ inb.flightNumbers.join(', ') || row.airline }} · {{ segmentStops(inb) }}</p>
                        </div>
                      }
                      <div>
                        <h4>Cena</h4>
                        <p><strong>{{ formatPrice(row.price) }}</strong> · {{ formatPrice(row.pricePerPerson) }}/osebo · {{ passengersText(row.passengers) }}</p>
                        @if (row.previousPrice) {
                          <p class="muted">prej {{ formatPrice(row.previousPrice) }} {{ changeText(row.change, row.price.currency) }}</p>
                        } @else if (row.providerPreviousPrice) {
                          <p class="muted">vir navaja prejšnjo ceno {{ formatPrice(row.providerPreviousPrice) }}</p>
                        }
                        @if (row.priceIncludes) {
                          <p class="muted">{{ row.priceIncludes }}</p>
                        }
                        @if (row.fare?.baggage) {
                          <p class="muted">prtljaga: {{ row.fare?.baggage }}</p>
                        }
                      </div>
                      <div>
                        <h4>Vir in iskanja</h4>
                        <p>
                          {{ airlinesText(row) }} · {{ row.providerLabel }}
                          @if (!row.providerOfficial) {
                            <ion-badge color="warning">neuradni vir</ion-badge>
                          }
                        </p>
                        <p class="muted">podatek {{ formatLjubljana(row.dataAt) }} · preverjeno {{ formatLjubljana(row.lastCheckedAt) }}</p>
                        <p>{{ searchNamesText(row) }}</p>
                        @if (status(row); as s) {
                          @if (s.key === 'unavailable') {
                            <p class="muted">Vir te ponudbe ob zadnjem preverjanju ni več vrnil.</p>
                          } @else if (s.key === 'departed') {
                            <p class="muted">Odhod je že mimo; ponudba je prikazana samo za primerjavo.</p>
                          }
                        }
                      </div>
                      @if (row.aiAnalysis; as a) {
                        <div class="ai-cell">
                          <h4>Analiza z umetno inteligenco</h4>
                          <app-ai-analysis-card [analysis]="a" [compact]="true"></app-ai-analysis-card>
                        </div>
                      }
                    </div>
                    <div class="detail-actions">
                      <ion-button size="small" [routerLink]="['/flight-deals/offers', row.id]" (click)="$event.stopPropagation()">
                        <ion-icon slot="start" name="stats-chart-outline" aria-hidden="true"></ion-icon>
                        Zgodovina cene
                      </ion-button>
                      @if (row.bookingUrl) {
                        <ion-button size="small" fill="outline" [href]="row.bookingUrl" target="_blank" rel="noopener" (click)="$event.stopPropagation()">
                          <ion-icon slot="start" name="open-outline" aria-hidden="true"></ion-icon>
                          Rezervacija pri viru
                        </ion-button>
                      }
                    </div>
                  </td>
                </tr>
              }
            }
          </tbody>
        </table>
      </div>
      @if (total() > offers().length) {
        <ion-note class="cd-section-hint">
          Prikazanih je prvih {{ offers().length }} od {{ total() }} ponudb (najcenejše). Izberi iskanje ali zoži filtre.
        </ion-note>
      }
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip: rect(0 0 0 0);
        white-space: nowrap;
      }

      /* ─── filtri ─── */
      .filters {
        display: flex;
        flex-direction: column;
        gap: var(--cd-space-1);
        margin-bottom: var(--cd-space-3);
      }
      .filters .search {
        padding: 0;
        --box-shadow: none;
        --background: var(--cd-surface-sunken);
        --border-radius: var(--cd-radius-md);
      }
      .scope {
        margin: var(--cd-space-1) 0;
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
      .expired-toggle {
        font-size: var(--cd-font-size-sm);
        color: var(--cd-text-muted);
        padding: var(--cd-space-1) 0;
      }

      /* ─── tabela ─── */
      .table-wrap {
        overflow-x: auto;
        border: 1px solid var(--cd-divider);
        border-radius: var(--cd-radius-lg);
        background: var(--cd-surface-raised);
        box-shadow: var(--cd-shadow-sm);
      }
      table.offers {
        width: 100%;
        border-collapse: collapse;
        font-size: var(--cd-font-size-sm);
      }
      thead th {
        text-align: left;
        padding: var(--cd-space-2) var(--cd-space-3);
        border-bottom: 1px solid var(--cd-divider);
        color: var(--cd-text-muted);
        font-size: var(--cd-font-size-xs);
        font-weight: 600;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        white-space: nowrap;
        background: var(--cd-surface-sunken);
      }
      thead th button {
        all: unset;
        cursor: pointer;
        color: inherit;
        font: inherit;
        letter-spacing: inherit;
        text-transform: inherit;
      }
      thead th button:hover {
        color: var(--ion-text-color);
      }
      thead th button:focus-visible {
        outline: 2px solid var(--ion-color-primary);
        outline-offset: 2px;
        border-radius: 2px;
      }
      thead th.sorted button {
        color: var(--ion-text-color);
      }
      tbody td {
        padding: var(--cd-space-2) var(--cd-space-3);
        border-top: 1px solid var(--cd-divider);
        vertical-align: top;
        line-height: 1.3;
      }
      tbody tr:first-child td {
        border-top: none;
      }
      tr.row {
        cursor: pointer;
      }
      tr.row:hover td,
      tr.row.open td {
        background: var(--cd-surface-sunken);
      }
      tr.row:focus-visible {
        outline: 2px solid var(--ion-color-primary);
        outline-offset: -2px;
      }
      tr.row.expired td:not(.status) {
        opacity: 0.55;
      }
      td span,
      td small,
      td s {
        display: block;
      }
      td small {
        color: var(--cd-text-muted);
        font-size: var(--cd-font-size-xs);
      }
      td.status {
        width: 1%;
        white-space: nowrap;
      }
      td.status ion-badge {
        display: block;
        margin-bottom: 2px;
      }
      td.route strong {
        display: block;
        font-size: var(--cd-font-size-md);
        letter-spacing: 0.02em;
        white-space: nowrap;
      }
      td.when span {
        white-space: nowrap;
      }
      .num {
        text-align: right;
        white-space: nowrap;
      }
      td.price strong {
        display: block;
        font-size: var(--cd-font-size-lg);
        font-weight: 700;
      }
      td.price s {
        color: var(--cd-text-muted);
        font-size: var(--cd-font-size-xs);
      }
      td.price .delta {
        color: inherit;
        font-weight: 600;
      }
      td.searches {
        max-width: 180px;
      }
      td.muted {
        color: var(--cd-text-muted);
      }
      .m-only {
        display: none;
      }

      /* ─── podrobnosti vrstice ─── */
      tr.details td {
        padding: var(--cd-space-3) var(--cd-space-4) var(--cd-space-4);
        background: var(--cd-surface-sunken);
        border-top: none;
      }
      .detail-grid {
        display: grid;
        gap: var(--cd-space-3) var(--cd-space-4);
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      }
      .detail-grid h4 {
        margin: 0 0 var(--cd-space-1);
        font-size: var(--cd-font-size-xs);
        font-weight: 600;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--cd-text-muted);
      }
      .detail-grid p {
        margin: 0 0 2px;
      }
      .detail-grid .muted {
        color: var(--cd-text-muted);
      }
      .detail-grid .ai-cell {
        grid-column: 1 / -1;
      }
      .detail-actions {
        display: flex;
        flex-wrap: wrap;
        gap: var(--cd-space-2);
        margin-top: var(--cd-space-3);
      }

      /* Telefon: ostanejo stanje, relacija, odhod (s povratkom v drugi vrstici) in cena (z zneskom
         na osebo); ostali stolpci so v podrobnostih vrstice. */
      @media (max-width: 720px) {
        .opt {
          display: none;
        }
        .m-only {
          display: block;
        }
        thead th,
        tbody td {
          padding: var(--cd-space-2);
        }
        tr.details td {
          padding: var(--cd-space-3);
        }
      }
    `,
  ],
})
export class FlightOfferTableComponent {
  readonly offers = input.required<Offer[]>();
  /** Skupno število na strežniku; če je večje od dolžine `offers`, se izpiše opomba o prvih N. */
  readonly total = input(0);
  /** Meja za "odhod je mimo"; stran jo postavi ob nalaganju, da se vrstice ne premikajo same. */
  readonly now = input<number>(Date.now());
  /** Pogled (filtri + red) — dvosmerno; stran ga shrani ob vsaki spremembi. */
  readonly view = model.required<OfferView>();
  /** Ali sme pokazati izbiro obsega Vse / Moje / Deljene z mano (na strani Deljene ponudbe ne). */
  readonly allowScope = input(true);
  /** Besedilo, kadar strežnik ni vrnil NOBENE ponudbe (ne glede na filtre). */
  readonly noOffersText = input('Ponudb trenutno ni.');

  readonly query = signal('');
  readonly expanded = signal<string | null>(null);

  readonly columnCount = COLUMN_COUNT;
  readonly formatPrice = formatPrice;
  readonly formatLjubljana = formatLjubljana;
  readonly formatLocalDateTime = formatLocalDateTime;
  readonly changeText = changeText;
  readonly changeColor = changeColor;
  readonly pluralNights = pluralNights;
  readonly pluralOffers = pluralOffers;
  readonly passengersText = passengersText;
  readonly stopsText = stopsText;
  readonly searchNamesText = searchNamesText;
  readonly airlinesText = airlinesText;
  readonly riskColor = riskColor;
  readonly riskLabel = riskLabel;

  readonly hasShared = computed(() => this.offers().some((o) => o.matches.some((m) => !m.isOwn)));
  readonly hasOwn = computed(() => this.offers().some((o) => o.matches.some((m) => m.isOwn)));
  readonly scopeVisible = computed(() => this.allowScope() && this.hasShared() && this.hasOwn());
  /** Shranjen obseg "deljene" brez deljenih ponudb bi dal prazno tabelo brez preklopa nazaj → takrat velja "vse". */
  readonly effectiveView = computed<OfferView>(() => (this.scopeVisible() ? this.view() : { ...this.view(), scope: 'all' }));
  readonly filters = computed(() => offerViewFilters(this.effectiveView(), this.query()));
  readonly rows = computed(() => sortOffers(filterOffers(this.offers(), this.filters(), this.now()), this.view().sort));
  readonly counts = computed(() => offerCounts(this.offers(), this.filters(), this.now()));

  patch(change: Partial<OfferView>): void {
    this.view.update((v) => ({ ...v, ...change }));
  }

  /** Klik na že izbrani čip vrste ga izklopi (nazaj na "Vse"). */
  setKind(kind: OfferKindFilter): void {
    this.patch({ kind: this.view().kind === kind && kind !== 'all' ? 'all' : kind });
  }

  setScope(scope: OfferScope): void {
    if (scope !== this.view().scope) this.patch({ scope });
  }

  setSort(key: OfferSortKey): void {
    this.patch({ sort: toggleOfferSort(this.view().sort, key) });
  }

  toggle(id: string): void {
    this.expanded.set(this.expanded() === id ? null : id);
  }

  arrow(key: OfferSortKey): string {
    const sort = this.view().sort;
    if (sort.key !== key) return '';
    return sort.dir === 'asc' ? ' ▲' : ' ▼';
  }

  ariaSort(key: OfferSortKey): 'ascending' | 'descending' | null {
    const sort = this.view().sort;
    if (sort.key !== key) return null;
    return sort.dir === 'asc' ? 'ascending' : 'descending';
  }

  status(offer: Offer) {
    return offerStatus(offer, this.now());
  }

  isExpired(offer: Offer): boolean {
    return isExpiredOffer(offer, this.now());
  }

  localDate(segment: Segment): string {
    return formatLocalDate(segment.departureAt, segment.departureTz);
  }

  localTime(segment: Segment): string {
    return formatLocalTime(segment.departureAt, segment.departureTz);
  }

  segmentStops(segment: Segment): string {
    return stopsText({ outbound: segment, inbound: null });
  }
}

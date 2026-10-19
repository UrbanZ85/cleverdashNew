import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  IonBadge,
  IonButton,
  IonCheckbox,
  IonChip,
  IonContent,
  IonIcon,
  IonLabel,
  IonNote,
  IonRefresher,
  IonRefresherContent,
  IonSearchbar,
  IonText,
} from '@ionic/angular/standalone';
import { PageHeaderComponent } from '../../shared/layout/page-header.component.js';
import { CurrentUserService } from '../../core/user/current-user.service.js';
import { FlightDealsApi } from './flight-deals.api.js';
import {
  DEFAULT_OFFER_SORT,
  RUN_STATUS_LABELS,
  changeColor,
  changeText,
  describeError,
  filterOffers,
  formatLjubljana,
  formatLocalDate,
  formatLocalDateTime,
  formatLocalTime,
  formatPrice,
  isExpiredOffer,
  offerCounts,
  offerStatus,
  passengersText,
  pluralNights,
  pluralOffers,
  pluralSearches,
  searchNamesText,
  searchStatusText,
  sortOffers,
  stopsText,
  toggleOfferSort,
  type FlightSearch,
  type Offer,
  type OfferFilters,
  type OfferKindFilter,
  type OfferSortKey,
  type OfferTableSort,
  type Overview,
  type RunStatus,
  type Segment,
} from './flight-deals.model.js';

// Zavihek "Leti" (platform/tabs/registry.ts, id `flight-deals`) — glavna stran modula (FR-032):
// moja iskanja s stanjem in ENA tabela vseh ponudb z iskanjem, filtri in razvrščanjem po stolpcih.
// Klik na vrstico odpre podrobnosti pod njo (leti, cena, vir, iskanja, povezavi do zgodovine cene
// in rezervacije). Pretečene ponudbe (vir jih ne ponuja več ali je odhod mimo) so privzeto
// skrite; potrditveno polje jih pokaže zasenčene, da je mogoče pogledati nazaj.
//
// Strežnik vrne največ 200 ponudb (najcenejše najprej, z nedosegljivimi vred); filtriranje in
// razvrščanje sta v brskalniku — čiste funkcije v flight-deals.model.ts. Povezava do
// administracije se pokaže samo adminu — pravi varuh je strežnik (modules/flight-deals/admin-guard.ts).

const OFFER_LIMIT = 200;
const COLUMN_COUNT = 9;

@Component({
  selector: 'app-flight-deals-page',
  standalone: true,
  imports: [
    RouterLink,
    PageHeaderComponent,
    IonContent,
    IonRefresher,
    IonRefresherContent,
    IonButton,
    IonIcon,
    IonChip,
    IonLabel,
    IonBadge,
    IonNote,
    IonText,
    IonSearchbar,
    IonCheckbox,
  ],
  template: `
    <app-page-header title="Leti" [subtitle]="subtitle()">
      @if (isAdmin()) {
        <ion-button slot="end" routerLink="/flight-deals/admin" aria-label="Administracija">
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
                <ion-chip [outline]="searchFilter() !== null" (click)="setFilter(null)">Vsa iskanja</ion-chip>
                @for (s of data.searches; track s.id) {
                  <ion-chip [outline]="searchFilter() !== s.id" [color]="statusOf(s).color === 'danger' ? 'danger' : undefined" (click)="setFilter(s.id)">
                    <ion-label>{{ s.name }}</ion-label>
                    <ion-badge>{{ s.offerCount }}</ion-badge>
                  </ion-chip>
                }
              </div>
              @if (activeSearch(); as s) {
                <ion-note class="cd-section-hint">
                  {{ statusOf(s).text }} · <a [routerLink]="['/flight-deals/searches', s.id]">uredi iskanje</a>
                </ion-note>
              }
            }
          </section>

          @if (data.searches.length > 0) {
            <section>
              <h2 class="cd-section-title">Ponudbe <small>{{ counts().all }}</small></h2>

              <div class="filters">
                <ion-searchbar
                  class="search"
                  placeholder="Išči: letališče, mesto, država, prevoznik, iskanje"
                  aria-label="Išči po ponudbah"
                  [debounce]="200"
                  [value]="query()"
                  (ionInput)="query.set($any($event).detail.value ?? '')"
                ></ion-searchbar>
                <div class="chips kinds">
                  <ion-chip [outline]="kind() !== 'all'" (click)="setKind('all')">
                    <ion-label>Vse</ion-label>
                    <ion-badge>{{ counts().all }}</ion-badge>
                  </ion-chip>
                  <ion-chip color="primary" [outline]="kind() !== 'new'" (click)="setKind('new')">
                    <ion-label>Novo</ion-label>
                    <ion-badge>{{ counts().new }}</ion-badge>
                  </ion-chip>
                  <ion-chip color="success" [outline]="kind() !== 'down'" (click)="setKind('down')">
                    <ion-label>Pocenitve</ion-label>
                    <ion-badge>{{ counts().down }}</ion-badge>
                  </ion-chip>
                  <ion-chip color="danger" [outline]="kind() !== 'up'" (click)="setKind('up')">
                    <ion-label>Podražitve</ion-label>
                    <ion-badge>{{ counts().up }}</ion-badge>
                  </ion-chip>
                  <ion-chip [outline]="!directOnly()" (click)="directOnly.set(!directOnly())">
                    <ion-icon name="airplane-outline" aria-hidden="true"></ion-icon>
                    <ion-label>Samo direktni</ion-label>
                  </ion-chip>
                </div>
                <ion-checkbox class="expired-toggle" labelPlacement="end" [checked]="showExpired()" (ionChange)="showExpired.set($any($event).detail.checked)">
                  Pokaži tudi pretečene
                  @if (counts().expired > 0) {
                    ({{ counts().expired }})
                  }
                </ion-checkbox>
              </div>

              @if (rows().length === 0) {
                <ion-note class="cd-section-hint">
                  @if (offers().length === 0) {
                    @if (data.lastRun) {
                      Ponudb, ki bi ustrezale tvojim iskanjem, trenutno ni.
                    } @else {
                      Preverjanje še ni teklo. Prvo preverjanje sproži urnik, ki ga nastavi administrator.
                    }
                  } @else if (counts().expired > 0 && !showExpired()) {
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
                        <th [class.sorted]="sort().key === 'route'" [attr.aria-sort]="ariaSort('route')">
                          <button type="button" (click)="setSort('route')">Relacija{{ arrow('route') }}</button>
                        </th>
                        <th [class.sorted]="sort().key === 'departure'" [attr.aria-sort]="ariaSort('departure')">
                          <button type="button" (click)="setSort('departure')">Odhod{{ arrow('departure') }}</button>
                        </th>
                        <th class="opt" [class.sorted]="sort().key === 'return'" [attr.aria-sort]="ariaSort('return')">
                          <button type="button" (click)="setSort('return')">Povratek{{ arrow('return') }}</button>
                        </th>
                        <th class="opt">Let</th>
                        <th class="num" [class.sorted]="sort().key === 'price'" [attr.aria-sort]="ariaSort('price')">
                          <button type="button" (click)="setSort('price')">Cena{{ arrow('price') }}</button>
                        </th>
                        <th class="num opt" [class.sorted]="sort().key === 'perPerson'" [attr.aria-sort]="ariaSort('perPerson')">
                          <button type="button" (click)="setSort('perPerson')">Na osebo{{ arrow('perPerson') }}</button>
                        </th>
                        <th class="opt" [class.sorted]="sort().key === 'search'" [attr.aria-sort]="ariaSort('search')">
                          <button type="button" (click)="setSort('search')">Iskanje{{ arrow('search') }}</button>
                        </th>
                        <th class="num opt" [class.sorted]="sort().key === 'dataAt'" [attr.aria-sort]="ariaSort('dataAt')">
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
                            <span>{{ row.airlineName ?? row.airline }}</span>
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
                                    {{ row.airlineName ?? row.airline }} · {{ row.providerLabel }}
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
      .cd-section-title small {
        color: var(--cd-text-muted);
        font-weight: 400;
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
      .detail-actions {
        display: flex;
        flex-wrap: wrap;
        gap: var(--cd-space-2);
        margin-top: var(--cd-space-3);
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
export class FlightDealsPage implements OnInit {
  private readonly api = inject(FlightDealsApi);
  private readonly currentUser = inject(CurrentUserService);

  readonly overview = signal<Overview | null>(null);
  readonly offers = signal<Offer[]>([]);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  /** Trenutek zadnjega nalaganja: meja za "odhod je mimo" (ne teče, da se vrstice ne premikajo same). */
  readonly now = signal(Date.now());

  readonly searchFilter = signal<string | null>(null);
  readonly query = signal('');
  readonly kind = signal<OfferKindFilter>('all');
  readonly directOnly = signal(false);
  readonly showExpired = signal(false);
  readonly sort = signal<OfferTableSort>(DEFAULT_OFFER_SORT);
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

  readonly isAdmin = computed(() => this.currentUser.user()?.scopes.includes('admin') === true);
  readonly activeSearch = computed(() => this.overview()?.searches.find((s) => s.id === this.searchFilter()) ?? null);
  readonly filters = computed<OfferFilters>(() => ({
    query: this.query(),
    searchId: this.searchFilter(),
    kind: this.kind(),
    directOnly: this.directOnly(),
    showExpired: this.showExpired(),
  }));
  readonly rows = computed(() => sortOffers(filterOffers(this.offers(), this.filters(), this.now()), this.sort()));
  readonly counts = computed(() => offerCounts(this.offers(), this.filters(), this.now()));
  readonly subtitle = computed(() => {
    const data = this.overview();
    if (this.loading() && !data) return 'Nalagam …';
    if (!data) return null;
    return `${pluralSearches(data.searches.length)} · ${pluralOffers(data.cheapest.total)}`;
  });

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
      const [data, list] = await Promise.all([
        this.api.overview(20),
        this.api.listOffers({ scope: 'all', sort: 'price', includeUnavailable: true, limit: OFFER_LIMIT }),
      ]);
      this.overview.set(data);
      this.offers.set(list.offers);
      this.total.set(list.total);
      this.now.set(Date.now());
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

  setFilter(id: string | null): void {
    this.searchFilter.set(this.searchFilter() === id ? null : id);
  }

  /** Klik na že izbrani čip vrste ga izklopi (nazaj na "Vse"). */
  setKind(kind: OfferKindFilter): void {
    this.kind.set(this.kind() === kind && kind !== 'all' ? 'all' : kind);
  }

  setSort(key: OfferSortKey): void {
    this.sort.set(toggleOfferSort(this.sort(), key));
  }

  toggle(id: string): void {
    this.expanded.set(this.expanded() === id ? null : id);
  }

  arrow(key: OfferSortKey): string {
    const sort = this.sort();
    if (sort.key !== key) return '';
    return sort.dir === 'asc' ? ' ▲' : ' ▼';
  }

  ariaSort(key: OfferSortKey): 'ascending' | 'descending' | null {
    const sort = this.sort();
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

  statusOf(search: FlightSearch) {
    return searchStatusText(search);
  }

  runLabel(status: string): string {
    return RUN_STATUS_LABELS[status as RunStatus] ?? status;
  }
}

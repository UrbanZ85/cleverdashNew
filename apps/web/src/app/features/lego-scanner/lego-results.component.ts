import { Component, computed, inject, input, signal } from '@angular/core';
import { IonBadge, IonItem, IonLabel, IonNote, IonSelect, IonSelectOption, IonText, IonToggle } from '@ionic/angular/standalone';
import { ScannersApi } from '../../core/scanners/scanners.api.js';
import type { ScannerResultsView } from '../../core/scanners/scanner-results-view.js';
import { changeColor, changeLabel, formatLjubljana, formatPrice, formatPriceOrDash, riskColor, riskLabel, type HistoryPoint, type Result } from '../../core/scanners/scanners.model.js';
import { AiAnalysisCardComponent } from '../../shared/ai-analysis/ai-analysis-card.component.js';
import {
  SORT_LABELS,
  activeText,
  calculationRows,
  conditionColor,
  conditionLabel,
  confidenceText,
  kindLabel,
  marketplaceLabel,
  missingReasons,
  priceLabel,
  profitColor,
  profitText,
  readLegoData,
  scoreColor,
  shippingText,
  sortResults,
  valueText,
  type LegoResultData,
  type LegoSort,
} from './lego.model.js';

// Lasten prikaz rezultatov LEGO skenerja (018, FR-024, FR-025): kartice s sliko, številko seta, imenom,
// temo, letnikom, stanjem, tržnico, ceno, poštnino, vrednostjo, dobičkom in oceno; klik razširi podrobnosti
// (oglas, katalog, zgodovina cen, BrickLink primerjava, izračun po postavkah, opozorila, AI analiza).
// Kontejner (`scanner-results.page`) poda `scannerId` in `results`; podrobnosti dodatno naložijo zgodovino.
//
// Slike in povezave so samo `https`; neznano se vedno izpiše kot neznano, ne kot 0.

interface Row {
  result: Result;
  lego: LegoResultData | null;
}

@Component({
  selector: 'app-lego-results',
  standalone: true,
  imports: [AiAnalysisCardComponent, IonBadge, IonItem, IonLabel, IonNote, IonSelect, IonSelectOption, IonText, IonToggle],
  template: `
    <div class="tools">
      <ion-item lines="none">
        <ion-select label="Razvrsti" labelPlacement="start" interface="popover" [value]="sort()" (ionChange)="sort.set($any($event).detail.value)">
          @for (s of sortOptions; track s) {
            <ion-select-option [value]="s">{{ sortLabels[s] }}</ion-select-option>
          }
        </ion-select>
      </ion-item>
      <ion-toggle [checked]="onlyProfit()" (ionChange)="onlyProfit.set($any($event).detail.checked)">samo z izračunanim dobičkom</ion-toggle>
    </div>

    @if (rows().length === 0) {
      <ion-note class="cd-section-hint">Rezultatov, ki bi ustrezali, trenutno ni.</ion-note>
    }

    <div class="cards">
      @for (row of rows(); track row.result.id) {
        @let r = row.result;
        @let d = row.lego;
        <article class="card" [class.unavailable]="r.availability === 'unavailable'" [class.open]="expanded() === r.id">
          <button type="button" class="head" [attr.aria-expanded]="expanded() === r.id" (click)="toggle(r)">
            @if (image(row); as img) {
              <img [src]="img" alt="" loading="lazy" class="thumb" />
            } @else {
              <span class="thumb placeholder" aria-hidden="true"></span>
            }
            <span class="main">
              <span class="title">
                @if (d?.lego?.setNumber) {
                  <strong>{{ d!.lego.setNumber }}</strong>
                  @if (d!.lego.setName) {
                    · {{ d!.lego.setName }}
                  }
                } @else {
                  {{ r.title }}
                }
              </span>
              <span class="meta">
                @if (d?.lego?.theme) {
                  {{ d!.lego.theme }}{{ d!.lego.subtheme ? ' / ' + d!.lego.subtheme : '' }}
                }
                @if (d?.lego?.releaseYear) {
                  · {{ d!.lego.releaseYear }}
                }
                @if (d) {
                  · {{ marketplaceLabel(d.listing.marketplace) }}
                }
              </span>
              <span class="badges">
                @if (d; as dd) {
                  @if (dd.identification.kind !== 'SET') {
                    <ion-badge color="warning">{{ kindLabel(dd.identification.kind) }}</ion-badge>
                  }
                  <ion-badge [color]="conditionColor(dd.lego.condition)">{{ conditionLabel(dd.lego.condition) }}</ion-badge>
                  @if (dd.identification.needsReview) {
                    <ion-badge color="warning">ročni pregled</ion-badge>
                  }
                }
                @if (changeColor(r.lastChangeType); as color) {
                  <ion-badge [color]="color">{{ changeLabel(r.lastChangeType) }}</ion-badge>
                }
                @if (r.aiAnalysis; as a) {
                  <ion-badge [color]="riskColor(a.riskLevel)" title="Ocena z umetno inteligenco">UI: {{ riskLabel(a.riskLevel) }}</ion-badge>
                }
              </span>
            </span>
            <span class="numbers">
              <strong class="price">{{ priceLabel(d?.lego?.listingType, r.price) }}</strong>
              @if (d) {
                <small>{{ shippingText(d.listing) }}</small>
                <small>vrednost: {{ valueText(d.valuation) }}</small>
                <ion-text [color]="profitColor(d.opportunity)"><small class="profit">{{ profitText(d.opportunity) }}</small></ion-text>
                @if (d.opportunity.score !== null) {
                  <ion-badge [color]="scoreColor(d.opportunity.score)" title="Ocena priložnosti 0–100">priložnost {{ d.opportunity.score }}</ion-badge>
                }
              }
            </span>
          </button>

          @if (expanded() === r.id && d) {
            <div class="details">
              <section>
                <h4>Oglas</h4>
                <p>{{ r.title }}</p>
                <p class="muted">
                  {{ marketplaceLabel(d.listing.marketplace) }} · {{ d.lego.sellerCountry ?? 'država prodajalca ni znana' }} · prvič {{ formatLjubljana(r.firstSeenAt) }} · zadnjič {{ formatLjubljana(r.lastSeenAt) }}
                </p>
                @if (d.listing.listingType === 'AUCTION') {
                  <p>
                    Dražba: trenutna ponudba {{ formatPriceOrDash(r.price) }} (ni končna cena)
                    @if (d.listing.bidCount !== null) {
                      · {{ d.listing.bidCount }} ponudb
                    }
                    @if (d.listing.endsAt) {
                      · izteče {{ formatLjubljana(d.listing.endsAt) }}
                    }
                  </p>
                }
                @if (r.availability === 'unavailable') {
                  <p class="muted">Oglasa vir ob zadnjem preverjanju ni več vrnil (to ne pomeni, da je bil prodan).</p>
                }
                @if (d.lego.boxIncluded !== undefined || d.lego.instructionsIncluded !== undefined || d.lego.completenessVerified !== undefined) {
                  <p class="muted">
                    @if (d.lego.boxIncluded !== undefined) {
                      škatla: {{ d.lego.boxIncluded ? 'je' : 'ni' }} ·
                    }
                    @if (d.lego.instructionsIncluded !== undefined) {
                      navodila: {{ d.lego.instructionsIncluded ? 'so' : 'niso' }} ·
                    }
                    @if (d.lego.completenessVerified) {
                      kompletnost: izrecno navedena v oglasu
                    }
                  </p>
                }
                @if (d.lego.condition === 'UNKNOWN' || d.lego.condition === 'USED_INCOMPLETE') {
                  <ion-text color="warning"><p>Kompletnost ni preverjena — vrednost kompletnega seta se ne uporabi.</p></ion-text>
                }
                @if (r.url) {
                  <p><a [href]="r.url" target="_blank" rel="noopener" (click)="$event.stopPropagation()">Odpri izvirni oglas</a></p>
                }
              </section>

              <section>
                <h4>Katalog</h4>
                @if (d.identification.catalog; as c) {
                  <p>
                    <strong>{{ c.setNumber }}</strong> · {{ c.name }}
                  </p>
                  <p class="muted">
                    {{ c.theme ?? 'tema ni znana' }}{{ c.subtheme ? ' / ' + c.subtheme : '' }} · {{ c.year ?? 'letnik ni znan' }} · {{ c.pieces ?? '?' }} kosov
                    @if (c.url) {
                      · <a [href]="c.url" target="_blank" rel="noopener">Rebrickable</a>
                    }
                  </p>
                } @else {
                  <p class="muted">Set ni povezan s katalogom.</p>
                }
                <p class="muted">Prepoznava: {{ kindLabel(d.identification.kind) }}, zaupanje {{ confidenceText(d.identification.confidence) }}. {{ d.identification.reason }}</p>
              </section>

              <section>
                <h4>BrickLink primerjava</h4>
                @if (d.valuation; as v) {
                  <p>
                    {{ v.newOrUsed === 'U' ? 'Rabljeno' : 'Novo' }}: <strong>{{ valueText(v) }}</strong>
                  </p>
                  <p class="muted">
                    Prodaje zadnjih {{ v.periodMonths }} mesecev
                    @if (v.median !== null) {
                      · mediana {{ formatPrice({ amount: v.median, currency: v.currency ?? 'EUR' }) }}
                    }
                  </p>
                  @if (activeText(v); as a) {
                    <p class="muted">{{ a }}</p>
                  }
                  @if (v.note) {
                    <ion-text color="warning"><p>{{ v.note }}</p></ion-text>
                  }
                } @else {
                  <p class="muted">Vrednost ni izračunana (stanje, katalog ali cenik ni na voljo).</p>
                }
              </section>

              <section>
                <h4>Izračun priložnosti <ion-badge color="medium">ocena</ion-badge></h4>
                <table class="calc">
                  <tbody>
                    @for (row of calc(d); track row.label) {
                      <tr [class.strong]="row.strong">
                        <td>{{ row.label }}</td>
                        <td class="num">{{ row.value }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
                @if (d.opportunity.missing.length > 0) {
                  <ion-text color="medium"><p>Dobiček ni izračunan: {{ reasons(d).join('; ') }}.</p></ion-text>
                }
                <p class="muted">Parametri izračuna (provizije, rezerva, konservativnost) so ocene lastnika namestitve; izračun ni nasvet za nakup.</p>
              </section>

              @if (history()[r.id]; as h) {
                <section>
                  <h4>Zgodovina cene</h4>
                  <ul class="history">
                    @for (p of h; track p.checkedAt) {
                      <li>{{ formatLjubljana(p.checkedAt) }} · {{ formatPriceOrDash(p.price) }} · {{ changeLabel(p.changeType) }}</li>
                    }
                  </ul>
                </section>
              }

              @if (r.aiAnalysis; as a) {
                <section>
                  <h4>Analiza z umetno inteligenco</h4>
                  <app-ai-analysis-card [analysis]="a"></app-ai-analysis-card>
                </section>
              }
            </div>
          }
        </article>
      }
    </div>
  `,
  styles: [
    `
      .tools {
        display: flex;
        flex-wrap: wrap;
        gap: var(--cd-space-2);
        align-items: center;
        justify-content: space-between;
        margin-bottom: var(--cd-space-2);
      }
      .cards {
        display: flex;
        flex-direction: column;
        gap: var(--cd-space-2);
      }
      .card {
        border: 1px solid var(--cd-divider);
        border-radius: var(--cd-radius-lg);
        background: var(--cd-surface-raised);
        box-shadow: var(--cd-shadow-sm);
      }
      .card.unavailable {
        opacity: 0.6;
      }
      .head {
        all: unset;
        box-sizing: border-box;
        display: flex;
        gap: var(--cd-space-3);
        width: 100%;
        padding: var(--cd-space-3);
        cursor: pointer;
        align-items: flex-start;
      }
      .head:focus-visible {
        outline: 2px solid var(--ion-color-primary);
        outline-offset: -2px;
        border-radius: var(--cd-radius-lg);
      }
      .thumb {
        width: 72px;
        height: 72px;
        object-fit: contain;
        border-radius: var(--cd-radius-md);
        background: var(--cd-surface-sunken);
        flex: 0 0 auto;
      }
      .placeholder {
        display: inline-block;
      }
      .main {
        display: flex;
        flex-direction: column;
        gap: 2px;
        flex: 1 1 auto;
        min-width: 0;
      }
      .title {
        font-size: var(--cd-font-size-md);
        overflow-wrap: anywhere;
      }
      .meta {
        color: var(--cd-text-muted);
        font-size: var(--cd-font-size-sm);
      }
      .badges {
        display: flex;
        flex-wrap: wrap;
        gap: var(--cd-space-1);
        margin-top: 2px;
      }
      .numbers {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 2px;
        text-align: right;
        flex: 0 0 auto;
        max-width: 45%;
      }
      .numbers small {
        color: var(--cd-text-muted);
        font-size: var(--cd-font-size-xs);
      }
      .numbers .profit {
        font-weight: 600;
      }
      .price {
        font-size: var(--cd-font-size-lg);
      }
      .details {
        border-top: 1px solid var(--cd-divider);
        padding: var(--cd-space-3);
        display: grid;
        gap: var(--cd-space-3) var(--cd-space-4);
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        background: var(--cd-surface-sunken);
        border-radius: 0 0 var(--cd-radius-lg) var(--cd-radius-lg);
      }
      .details h4 {
        margin: 0 0 var(--cd-space-1);
        font-size: var(--cd-font-size-xs);
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--cd-text-muted);
        display: flex;
        align-items: center;
        gap: var(--cd-space-1);
      }
      .details p {
        margin: 0 0 4px;
        font-size: var(--cd-font-size-sm);
      }
      .muted {
        color: var(--cd-text-muted);
      }
      .calc {
        width: 100%;
        border-collapse: collapse;
        font-size: var(--cd-font-size-sm);
      }
      .calc td {
        padding: 2px 0;
        border-top: 1px solid var(--cd-divider);
      }
      .calc .num {
        text-align: right;
        white-space: nowrap;
      }
      .calc tr.strong td {
        font-weight: 700;
      }
      .history {
        margin: 0;
        padding-left: 1.1em;
        font-size: var(--cd-font-size-sm);
      }
      @media (max-width: 640px) {
        .head {
          flex-wrap: wrap;
        }
        .numbers {
          align-items: flex-start;
          text-align: left;
          max-width: none;
          width: 100%;
        }
      }
    `,
  ],
})
export class LegoResultsComponent implements ScannerResultsView {
  private readonly api = inject(ScannersApi);

  readonly scannerId = input.required<string>();
  readonly results = input.required<Result[]>();

  readonly sort = signal<LegoSort>('score');
  readonly onlyProfit = signal(false);
  readonly expanded = signal<string | null>(null);
  readonly history = signal<Record<string, HistoryPoint[]>>({});

  readonly sortOptions = Object.keys(SORT_LABELS) as LegoSort[];
  readonly sortLabels = SORT_LABELS;

  readonly rows = computed<Row[]>(() => {
    const sorted = sortResults(this.results(), this.sort());
    const rows = sorted.map((result) => ({ result, lego: readLegoData(result.data) }));
    return this.onlyProfit() ? rows.filter((r) => r.lego?.opportunity.profit !== null && r.lego?.opportunity.profit !== undefined) : rows;
  });

  readonly changeColor = changeColor;
  readonly changeLabel = changeLabel;
  readonly riskColor = riskColor;
  readonly riskLabel = riskLabel;
  readonly conditionLabel = conditionLabel;
  readonly conditionColor = conditionColor;
  readonly kindLabel = kindLabel;
  readonly marketplaceLabel = marketplaceLabel;
  readonly confidenceText = confidenceText;
  readonly shippingText = shippingText;
  readonly priceLabel = priceLabel;
  readonly valueText = valueText;
  readonly profitText = profitText;
  readonly profitColor = profitColor;
  readonly scoreColor = scoreColor;
  readonly activeText = activeText;
  readonly formatLjubljana = formatLjubljana;
  readonly formatPrice = formatPrice;
  readonly formatPriceOrDash = formatPriceOrDash;

  calc(d: LegoResultData) {
    return calculationRows(d.opportunity);
  }

  reasons(d: LegoResultData): string[] {
    return missingReasons(d.opportunity);
  }

  /** Slika oglasa, sicer katalogska; samo `https`. */
  image(row: Row): string | null {
    const url = row.lego?.listing.images[0] ?? row.lego?.identification.catalog?.imageUrl ?? null;
    return url && url.startsWith('https://') ? url : null;
  }

  async toggle(r: Result): Promise<void> {
    if (this.expanded() === r.id) {
      this.expanded.set(null);
      return;
    }
    this.expanded.set(r.id);
    if (this.history()[r.id]) return;
    try {
      const detail = await this.api.result(this.scannerId(), r.id);
      this.history.update((h) => ({ ...h, [r.id]: detail.history }));
    } catch {
      // Zgodovina je dodatek: podrobnosti so uporabne tudi brez nje.
    }
  }
}

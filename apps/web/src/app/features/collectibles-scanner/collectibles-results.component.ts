import { Component, computed, inject, input, signal } from '@angular/core';
import { IonBadge, IonIcon, IonItem, IonNote, IonSelect, IonSelectOption, IonText, IonToggle } from '@ionic/angular/standalone';
import { ScannersApi } from '../../core/scanners/scanners.api.js';
import type { ScannerResultsView } from '../../core/scanners/scanner-results-view.js';
import { changeColor, changeLabel, formatLjubljana, formatPrice, formatPriceOrDash, riskColor, riskLabel, type HistoryPoint, type Result } from '../../core/scanners/scanners.model.js';
import { AiAnalysisCardComponent } from '../../shared/ai-analysis/ai-analysis-card.component.js';
import {
  BASIS_LABELS,
  SORT_LABELS,
  ambiguityTexts,
  askingText,
  calculationRows,
  categoryLabel,
  conditionColor,
  conditionLabel,
  confidenceText,
  discountText,
  kindLabel,
  marketplaceLabel,
  missingReasons,
  priceLabel,
  profitColor,
  profitText,
  readCollectiblesData,
  scoreColor,
  shippingText,
  sortResults,
  valueText,
  variantText,
  type CollectiblesResultData,
  type CollectiblesSort,
} from './collectibles.model.js';

// Lasten prikaz rezultatov zbirateljskega skenerja (019, FR-030): kartice s sliko, imenom, kategorijo,
// različico, stanjem, tržnico, ceno, poštnino, vrednostjo (z oznako vrste), popustom, dobičkom in oceno;
// klik razširi podrobnosti (oglas, katalog in zaupanje prepoznave, vrednost po vrstah, izračun po postavkah,
// zgodovina cen, AI analiza, povezava na tržnico). Kontejner (`scanner-results.page`) poda `scannerId` in `results`.
//
// Slike in povezave so samo `https`; neznano se vedno izpiše kot neznano, ne kot 0; brez ocene je "premalo podatkov".

interface Row {
  result: Result;
  data: CollectiblesResultData | null;
}

@Component({
  selector: 'app-collectibles-results',
  standalone: true,
  imports: [AiAnalysisCardComponent, IonBadge, IonIcon, IonItem, IonNote, IonSelect, IonSelectOption, IonText, IonToggle],
  template: `
    <div class="tools">
      <ion-item lines="none">
        <ion-select label="Razvrsti" labelPlacement="start" interface="popover" [value]="sort()" (ionChange)="sort.set($any($event).detail.value)">
          @for (s of sortOptions; track s) {
            <ion-select-option [value]="s">{{ sortLabels[s] }}</ion-select-option>
          }
        </ion-select>
      </ion-item>
      <ion-toggle [checked]="onlyValued()" (ionChange)="onlyValued.set($any($event).detail.checked)">samo z vrednostjo</ion-toggle>
    </div>

    @if (rows().length === 0) {
      <ion-note class="cd-section-hint">Rezultatov, ki bi ustrezali, trenutno ni.</ion-note>
    }

    <div class="cards">
      @for (row of rows(); track row.result.id) {
        @let r = row.result;
        @let d = row.data;
        <article class="card" [class.unavailable]="r.availability === 'unavailable'" [class.open]="expanded() === r.id" [class.pinned]="isPinned(r.id)">
          <button type="button" class="head" [attr.aria-expanded]="expanded() === r.id" (click)="toggle(r)">
            @if (image(row); as img) {
              <img [src]="img" alt="" loading="lazy" class="thumb" />
            } @else {
              <span class="thumb placeholder" aria-hidden="true"></span>
            }
            <span class="main">
              <span class="title">
                @if (d?.collectible?.name) {
                  <strong>{{ d!.collectible.name }}</strong>
                } @else {
                  {{ r.title }}
                }
              </span>
              <span class="meta">
                @if (d; as dd) {
                  {{ categoryLabel(dd.collectible.category) }}
                  @if (variant(dd); as v) {
                    · {{ v }}
                  }
                  · {{ marketplaceLabel(dd.listing.marketplace) }}
                }
              </span>
              <span class="badges">
                @if (d; as dd) {
                  @if (dd.identification.kind !== 'CARD' && dd.identification.kind !== 'GAME' && dd.identification.kind !== 'CONSOLE') {
                    <ion-badge color="warning">{{ kindLabel(dd.identification.kind) }}</ion-badge>
                  }
                  <ion-badge [color]="conditionColor(dd.collectible.condition)">{{ conditionLabel(dd.collectible.condition) }}</ion-badge>
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
              <strong class="price">{{ priceLabel(d?.listing?.listingType, r.price) }}</strong>
              @if (d) {
                <small>{{ shippingText(d.listing) }}</small>
                <small>vrednost: {{ valueText(d.valuation) }}</small>
                @if (discountText(d.opportunity); as dt) {
                  <small>{{ dt }}</small>
                }
                <ion-text [color]="profitColor(d.opportunity)"><small class="profit">{{ profitText(d.opportunity) }}</small></ion-text>
                @if (d.opportunity.score !== null) {
                  <ion-badge [color]="scoreColor(d.opportunity.score)" title="Ocena priložnosti 0–100">priložnost {{ d.opportunity.score }}</ion-badge>
                }
              }
            </span>
          </button>
          <button
            type="button"
            class="pin"
            [attr.aria-pressed]="isPinned(r.id)"
            [attr.aria-label]="isPinned(r.id) ? 'Odstrani iz spremljanih' : 'Spremljaj ta zapis'"
            [title]="isPinned(r.id) ? 'Odstrani iz spremljanih' : 'Spremljaj ta zapis'"
            (click)="togglePin(r.id)"
          >
            <ion-icon [name]="isPinned(r.id) ? 'star' : 'star-outline'"></ion-icon>
          </button>

          @if (expanded() === r.id && d) {
            <div class="details">
              <section>
                <h4>Oglas</h4>
                <p>{{ r.title }}</p>
                <p class="muted">
                  {{ marketplaceLabel(d.listing.marketplace) }} · {{ d.collectible.sellerCountry ?? 'država prodajalca ni znana' }} · prvič {{ formatLjubljana(r.firstSeenAt) }} · zadnjič {{ formatLjubljana(r.lastSeenAt) }}
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
                @if (d.collectible.condition === 'UNKNOWN') {
                  <ion-text color="warning"><p>Stanje oglasa ni znano — dobiček se ne izračuna.</p></ion-text>
                }
                <p class="muted">Pristnosti predmeta iz oglasa ni mogoče potrditi.</p>
                @if (r.url) {
                  <p><a [href]="r.url" target="_blank" rel="noopener" (click)="$event.stopPropagation()">Odpri izvirni oglas</a></p>
                }
              </section>

              <section>
                <h4>Katalog in prepoznava</h4>
                @if (d.identification.catalog; as c) {
                  <p>
                    <strong>{{ c.name }}</strong>
                    @if (c.setName) {
                      · {{ c.setName }}
                    }
                    @if (c.number) {
                      · #{{ c.number }}
                    }
                  </p>
                  @if (c.rarity) {
                    <p class="muted">Redkost: {{ c.rarity }}</p>
                  }
                } @else {
                  <p class="muted">Predmet ni povezan s katalogom.</p>
                }
                <p class="muted">Prepoznava: {{ kindLabel(d.identification.kind) }}, zaupanje {{ confidenceText(d.identification.confidence) }}. {{ d.identification.reason }}</p>
                @if (ambiguities(d).length > 0) {
                  <ion-text color="warning"><p>Oglas ne pove: {{ ambiguities(d).join('; ') }} — zato primerjava z vrednostjo ni mogoča.</p></ion-text>
                }
              </section>

              <section>
                <h4>Vrednost <ion-badge color="medium">po vrstah</ion-badge></h4>
                @if (d.valuation; as v) {
                  <p><strong>{{ valueText(v) }}</strong></p>
                  @if (v.sold; as s) {
                    <p class="muted">{{ basisLabels.sold }} ({{ s.source }}): povprečje {{ formatPrice({ amount: s.average, currency: s.currency }) }}, {{ s.count }} prodaj v {{ s.periodMonths }} mesecih</p>
                  }
                  @if (v.estimate; as e) {
                    <p class="muted">
                      {{ basisLabels[e.basis] }} ({{ e.source }}): {{ formatPrice({ amount: e.value, currency: e.currency }) }}
                      @if (e.updatedAt) {
                        · posodobljeno {{ formatLjubljana(e.updatedAt) }}
                      }
                      — ni prodajna cena
                    </p>
                  }
                  @if (asking(v); as a) {
                    <p class="muted">{{ a }}</p>
                  }
                  @if (v.note) {
                    <ion-text color="warning"><p>{{ v.note }}</p></ion-text>
                  }
                } @else {
                  <p class="muted">Vrednost ni izračunana.</p>
                }
              </section>

              <section>
                <h4>Izračun priložnosti <ion-badge color="medium">ocena</ion-badge></h4>
                @if (discountText(d.opportunity); as dt) {
                  <p>Popust: {{ dt }}</p>
                }
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
        position: relative;
        border: 1px solid var(--cd-divider);
        border-radius: var(--cd-radius-lg);
        background: var(--cd-surface-raised);
        box-shadow: var(--cd-shadow-sm);
      }
      .card.pinned {
        border-color: var(--ion-color-primary);
        box-shadow: 0 0 0 2px var(--ion-color-primary), var(--cd-shadow-sm);
      }
      .card .head {
        padding-right: 44px;
      }
      .pin {
        all: unset;
        box-sizing: border-box;
        position: absolute;
        top: var(--cd-space-2);
        right: var(--cd-space-2);
        display: flex;
        padding: 4px;
        border-radius: var(--cd-radius-md);
        cursor: pointer;
        color: var(--cd-text-muted);
        font-size: 20px;
      }
      .card.pinned .pin {
        color: var(--ion-color-warning);
      }
      .pin:focus-visible {
        outline: 2px solid var(--ion-color-primary);
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
export class CollectiblesResultsComponent implements ScannerResultsView {
  private readonly api = inject(ScannersApi);

  readonly scannerId = input.required<string>();
  readonly results = input.required<Result[]>();

  readonly sort = signal<CollectiblesSort>('score');
  readonly onlyValued = signal(false);
  readonly expanded = signal<string | null>(null);
  /** Stanje pripenjanja, ki ga je uporabnik spremenil, dokler seznam ni osvežen s strežnika. */
  readonly pinOverride = signal<Record<string, boolean>>({});
  readonly history = signal<Record<string, HistoryPoint[]>>({});

  readonly sortOptions = Object.keys(SORT_LABELS) as CollectiblesSort[];
  readonly sortLabels = SORT_LABELS;
  readonly basisLabels = BASIS_LABELS;

  readonly rows = computed<Row[]>(() => {
    const sorted = sortResults(this.results(), this.sort());
    // Spremljani zapisi so vedno na vrhu; med seboj ohranijo izbrani vrstni red.
    sorted.sort((a, b) => Number(this.isPinned(b.id)) - Number(this.isPinned(a.id)));
    const rows = sorted.map((result) => ({ result, data: readCollectiblesData(result.data) }));
    return this.onlyValued() ? rows.filter((r) => r.data?.valuation?.primary != null && r.data.valuation.comparable) : rows;
  });

  readonly changeColor = changeColor;
  readonly changeLabel = changeLabel;
  readonly riskColor = riskColor;
  readonly riskLabel = riskLabel;
  readonly categoryLabel = categoryLabel;
  readonly conditionLabel = conditionLabel;
  readonly conditionColor = conditionColor;
  readonly kindLabel = kindLabel;
  readonly marketplaceLabel = marketplaceLabel;
  readonly confidenceText = confidenceText;
  readonly shippingText = shippingText;
  readonly priceLabel = priceLabel;
  readonly valueText = valueText;
  readonly discountText = discountText;
  readonly profitText = profitText;
  readonly profitColor = profitColor;
  readonly scoreColor = scoreColor;
  readonly asking = askingText;
  readonly formatLjubljana = formatLjubljana;
  readonly formatPrice = formatPrice;
  readonly formatPriceOrDash = formatPriceOrDash;

  variant(d: CollectiblesResultData): string {
    return variantText(d.collectible);
  }

  calc(d: CollectiblesResultData) {
    return calculationRows(d.opportunity);
  }

  reasons(d: CollectiblesResultData): string[] {
    return missingReasons(d.opportunity);
  }

  ambiguities(d: CollectiblesResultData): string[] {
    return ambiguityTexts(d.identification);
  }

  /** Slika oglasa, sicer katalogska; samo `https`. */
  image(row: Row): string | null {
    const url = row.data?.listing.images[0] ?? row.data?.identification.catalog?.imageUrl ?? null;
    return url && url.startsWith('https://') ? url : null;
  }

  isPinned(id: string): boolean {
    return this.pinOverride()[id] ?? this.results().find((r) => r.id === id)?.pinned ?? false;
  }

  async togglePin(id: string): Promise<void> {
    const next = !this.isPinned(id);
    this.pinOverride.update((o) => ({ ...o, [id]: next }));
    try {
      await this.api.setPinned(this.scannerId(), id, next);
    } catch {
      this.pinOverride.update((o) => ({ ...o, [id]: !next }));
    }
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

import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonModal,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { TileCardComponent } from '../../../shared/layout/tile-card.component.js';
import { StalenessBadgeComponent } from '../../../shared/staleness/staleness-badge.component.js';
import { NoDataComponent } from '../../../shared/staleness/no-data.component.js';
import { AttributionComponent } from '../../../shared/attribution/attribution.component.js';
import { ForegroundRefreshService } from '../../../core/refresh/foreground-refresh.service.js';
import { MeteoApi } from '../../../core/meteo/meteo.api.js';
import {
  bucketAxisLabels,
  bucketTooltipTitles,
  cumulativePrecipitation,
  formatValue,
  localFullLabel,
  localTimeLabel,
  precipitationAxisMax,
  windDirectionLabel,
  type MeteoHistory,
} from '../../../core/meteo/meteo.model.js';
import { MeteoChartComponent, type MeteoChartSeries } from '../charts/meteo-chart.component.js';

// Ploščica na nadzorni plošči: urne padavine zadnjih 24 ur in trenutno stanje izbrane postaje.
//
// Ploščica v mreži je PREGLED, povečan prikaz je mesto, kjer se z vsebino dela (isti dogovor
// kot pri vtičnikih, 005). Zato ploščica kaže samo stolpce zadnjih 24 ur, povečan prikaz pa
// vsote padavin po oknih (4/8/12/24/48 h) in stolpce celotnih dveh dni, ki jih vir hrani.
//
// Zakaj sta dva prenosa in ne en: stolpci v ploščici so 24-urni, povečan prikaz pa 48-urni.
// Oba gresta prek istega strežniškega predpomnilnika (isti ključ, `meteo:history:<postaja>`),
// zato drugi prenos NE pomeni novega klica na ARSO (člen VIII) — pomeni pa, da ploščica v
// mreži ne nosi podatka, ki ga ne pokaže.
//
// Vsote po oknih pridejo že s prvim odgovorom (strežnik jih računa iz celotne serije), zato so
// v povečanem prikazu vidne takoj, tudi dokler se 48-urni graf še nalaga.
@Component({
  selector: 'app-meteo-tile',
  standalone: true,
  imports: [
    TileCardComponent,
    StalenessBadgeComponent,
    NoDataComponent,
    AttributionComponent,
    MeteoChartComponent,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonModal,
    IonTitle,
    IonToolbar,
  ],
  template: `
    <app-tile-card title="Padavine po urah" icon="rainy-outline" [subtitle]="subtitle()" [loading]="loading()">
      <ion-button
        slot="actions"
        fill="clear"
        size="small"
        (click)="open()"
        aria-label="Odpri povečano"
        title="Odpri povečano"
      >
        <ion-icon slot="icon-only" name="expand-outline"></ion-icon>
      </ion-button>

      @if (data(); as history) {
        <button class="chart-button" type="button" (click)="open()" aria-label="Odpri povečano">
          <div class="now">
            <span class="temp">{{ formatValue(history.summary.latest.temperatureC, '°C') }}</span>
            <span class="rain">{{ formatValue(window24Mm(), 'mm') }} / 24 h</span>
          </div>
          <app-meteo-chart
            title="Padavine po urah, zadnjih 24 ur"
            [labels]="labels()"
            [series]="series()"
            [pointTitles]="tooltipTitles()"
            [leftMax]="axisMax()"
            [leftBeginAtZero]="true"
            [heightPx]="120"
          ></app-meteo-chart>
        </button>
        <p class="detail">
          {{ formatValue(history.summary.latest.windAvgKmh, 'km/h', 0) }}
          @if (direction(); as dir) {
            <span class="muted">iz {{ dir }}</span>
          }
          <span class="muted">· vlaga {{ formatValue(history.summary.latest.humidityPct, '%', 0) }}</span>
          <span class="muted">· {{ measuredAt() }}</span>
        </p>
      } @else if (failed()) {
        <app-no-data (retry)="reload()"></app-no-data>
      } @else {
        <div class="skeleton cd-skeleton" aria-hidden="true"></div>
      }

      <div slot="footer">
        @if (stale()) {
          <app-staleness-badge [ageSeconds]="ageSeconds()"></app-staleness-badge>
        }
        @if (data(); as history) {
          <app-attribution
            [text]="history.source.attribution.text"
            [url]="history.source.attribution.url"
          ></app-attribution>
        }
      </div>
    </app-tile-card>

    <!-- Skoraj celozaslonsko, enako kot povečan prikaz vtičnika (005). -->
    <ion-modal class="meteo-modal" [isOpen]="modalOpen()" (didDismiss)="modalOpen.set(false)">
      <ng-template>
        <ion-header>
          <ion-toolbar>
            <ion-title>
              <span class="modal-title">Padavine</span>
              @if (subtitle(); as station) {
                <span class="modal-subtitle">{{ station }}</span>
              }
            </ion-title>
            <ion-buttons slot="end">
              <ion-button (click)="openTab()" title="Odpri zavihek z vsemi grafi" aria-label="Odpri zavihek">
                <ion-icon slot="icon-only" name="open-outline"></ion-icon>
              </ion-button>
              <ion-button (click)="modalOpen.set(false)" aria-label="Zapri">
                <ion-icon slot="icon-only" name="close-outline"></ion-icon>
              </ion-button>
            </ion-buttons>
          </ion-toolbar>
        </ion-header>
        <ion-content>
          <div class="modal-body">
            @if (data(); as history) {
              <!-- Vsote po oknih so prvo, kar človek išče: "koliko je padlo". Graf je kontekst. -->
              <section class="windows" aria-label="Vsote padavin po oknih">
                @for (window of history.precipitationWindows; track window.hours) {
                  <div class="window" [class.window-dry]="(window.millimeters ?? 0) === 0">
                    <span class="window-hours">{{ window.hours }} h</span>
                    <span class="window-mm">{{ formatValue(window.millimeters, 'mm') }}</span>
                  </div>
                }
              </section>

              <section class="modal-chart">
                <header class="modal-chart-head">
                  <h2>Po urah, {{ enlargedHours() }} h</h2>
                  <span class="muted">stolpec je vsota cele ure, črta skupna vsota</span>
                </header>
                <app-meteo-chart
                  title="Padavine po urah, celotno obdobje"
                  [labels]="enlargedLabels()"
                  [series]="enlargedSeries()"
                  [pointTitles]="enlargedTooltipTitles()"
                  [leftMax]="enlargedAxisMax()"
                  [leftBeginAtZero]="true"
                  [heightPx]="300"
                ></app-meteo-chart>
              </section>

              <dl class="modal-facts">
                <div>
                  <dt>Zadnja meritev</dt>
                  <dd>{{ latestAt() }}</dd>
                </div>
                <div>
                  <dt>Temperatura</dt>
                  <dd>{{ formatValue(history.summary.latest.temperatureC, '°C') }}</dd>
                </div>
                <div>
                  <dt>Vlažnost</dt>
                  <dd>{{ formatValue(history.summary.latest.humidityPct, '%', 0) }}</dd>
                </div>
                <div>
                  <dt>Veter</dt>
                  <dd>
                    {{ formatValue(history.summary.latest.windAvgKmh, 'km/h', 0) }}
                    @if (direction(); as dir) {
                      <span class="muted">iz {{ dir }}</span>
                    }
                  </dd>
                </div>
                <div>
                  <dt>Najmočnejši sunek</dt>
                  <dd>{{ formatValue(history.summary.windMaxKmh, 'km/h', 0) }}</dd>
                </div>
                @if (history.available.snow) {
                  <div>
                    <dt>Snežna odeja</dt>
                    <dd>{{ formatValue(history.summary.latest.snowCm, 'cm', 0) }}</dd>
                  </div>
                }
              </dl>

              <div class="modal-foot">
                <app-attribution
                  [text]="history.source.attribution.text"
                  [url]="history.source.attribution.url"
                ></app-attribution>
                <a class="source-link" [href]="history.source.url" target="_blank" rel="noopener">
                  Izvorna stran postaje
                </a>
              </div>
            }
          </div>
        </ion-content>
      </ng-template>
    </ion-modal>
  `,
  styles: `
    /* Cela vsebina ploščice je gumb, ki odpre povečan prikaz — klik kamor koli v graf je
       najbolj pričakovana poteza, ikona v glavi pa ostane za tipkovnico in za jasnost. */
    .chart-button {
      display: block;
      width: 100%;
      padding: 0;
      border: 0;
      background: none;
      color: inherit;
      text-align: inherit;
      cursor: zoom-in;
      font: inherit;
    }
    .now {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: var(--cd-space-3);
      margin-bottom: var(--cd-space-2);
    }
    .temp {
      font-size: var(--cd-font-size-xl);
      font-weight: 650;
      line-height: 1;
    }
    .rain,
    .muted {
      color: var(--cd-text-muted);
      font-size: var(--cd-font-size-sm);
    }
    .detail {
      margin: var(--cd-space-2) 0 0;
      font-size: var(--cd-font-size-sm);
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem;
    }
    .skeleton {
      width: 100%;
      height: 140px;
    }

    /* ─── Povečan prikaz ─── */
    .meteo-modal {
      --width: 96vw;
      --height: 96vh;
      --max-width: 1100px;
      --border-radius: var(--cd-radius-lg);
    }
    /* Na telefonu celozaslonsko — ozek okvir je poteza za miško, s prstom pa zadetek slučaja
       (ista meja kot pri vtičnikih, Ionicov prag "sm"). */
    @media (max-width: 575.98px) {
      .meteo-modal {
        --width: 100%;
        --height: 100%;
        --border-radius: 0;
      }
    }
    .modal-title {
      display: block;
      font-weight: 650;
    }
    .modal-subtitle {
      display: block;
      font-size: var(--cd-font-size-xs);
      font-weight: 400;
      color: var(--cd-text-muted);
    }
    .modal-body {
      padding: var(--cd-space-5);
      display: grid;
      gap: var(--cd-space-5);
    }
    .windows {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
      gap: var(--cd-space-3);
    }
    .window {
      padding: var(--cd-space-3);
      border: 1px solid var(--cd-divider);
      border-radius: var(--cd-radius-md);
      background: var(--cd-surface);
      display: grid;
      gap: 2px;
    }
    /* Suho okno je videti drugače od mokrega, da se "0,0 mm" ne bere kot manjkajoč podatek. */
    .window-dry {
      background: var(--cd-surface-sunken);
    }
    .window-hours {
      font-size: var(--cd-font-size-xs);
      color: var(--cd-text-muted);
    }
    .window-mm {
      font-size: var(--cd-font-size-lg);
      font-weight: 650;
    }
    .modal-chart-head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: var(--cd-space-3);
      margin-bottom: var(--cd-space-2);
    }
    .modal-chart-head h2 {
      margin: 0;
      font-size: var(--cd-font-size-md);
      font-weight: 650;
    }
    .modal-facts {
      margin: 0;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: var(--cd-space-3);
    }
    .modal-facts dt {
      color: var(--cd-text-muted);
      font-size: var(--cd-font-size-xs);
    }
    .modal-facts dd {
      margin: 2px 0 0;
      font-size: var(--cd-font-size-md);
      font-weight: 600;
      display: flex;
      align-items: baseline;
      gap: var(--cd-space-2);
    }
    .modal-foot {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--cd-space-3);
    }
    .source-link {
      font-size: var(--cd-font-size-xs);
      color: var(--cd-text-muted);
    }
  `,
})
export class MeteoTileComponent implements OnInit, OnDestroy {
  private readonly api = inject(MeteoApi);
  private readonly refresh = inject(ForegroundRefreshService);
  private readonly router = inject(Router);

  readonly formatValue = formatValue;

  /** Okno stolpcev v ploščici. Povečan prikaz gre na 48 ur — toliko, kolikor hrani vir. */
  private static readonly TILE_HOURS = 24;
  private static readonly ENLARGED_HOURS = 48;

  readonly data = signal<MeteoHistory | null>(null);
  /** Daljša serija za povečan prikaz; prenese se ob prvem odprtju. */
  readonly enlarged = signal<MeteoHistory | null>(null);
  readonly loading = signal(false);
  readonly failed = signal(false);
  readonly stale = signal(false);
  readonly ageSeconds = signal(0);
  readonly modalOpen = signal(false);

  private unregister?: () => void;

  readonly subtitle = computed(() => this.data()?.station.title ?? null);
  readonly direction = computed(() => windDirectionLabel(this.data()?.summary.latest.windDirectionDeg));
  readonly measuredAt = computed(() => {
    const iso = this.data()?.summary.latest.validUtc;
    return iso ? localTimeLabel(iso) : '';
  });
  readonly latestAt = computed(() => {
    const iso = this.data()?.summary.latest.validUtc;
    return iso ? localFullLabel(iso) : '';
  });

  /** Vsota zadnjih 24 ur iz strežniških okenskih vsot — ne iz prikazanega okna, da napis v
   * ploščici pomeni isto kot okno "24 h" v povečanem prikazu. */
  readonly window24Mm = computed(
    () => this.data()?.precipitationWindows.find((w) => w.hours === 24)?.millimeters ?? null,
  );

  readonly labels = computed(() => bucketAxisLabels(this.data()?.buckets ?? []));
  readonly tooltipTitles = computed(() => bucketTooltipTitles(this.data()?.buckets ?? []));
  readonly axisMax = computed(() => precipitationAxisMax(this.data()?.buckets ?? []));
  readonly series = computed<MeteoChartSeries[]>(() => [
    {
      label: 'Padavine',
      unit: 'mm',
      kind: 'bar',
      tone: 'precipitation',
      data: (this.data()?.buckets ?? []).map((b) => b.precipitationMm),
    },
  ]);

  /** Dokler daljša serija ne pride, povečan prikaz riše kar 24-urno — nikoli prazen graf. */
  private readonly enlargedData = computed(() => this.enlarged() ?? this.data());
  readonly enlargedHours = computed(() => this.enlargedData()?.hours ?? MeteoTileComponent.ENLARGED_HOURS);
  readonly enlargedLabels = computed(() => bucketAxisLabels(this.enlargedData()?.buckets ?? []));
  readonly enlargedTooltipTitles = computed(() => bucketTooltipTitles(this.enlargedData()?.buckets ?? []));
  readonly enlargedAxisMax = computed(() => precipitationAxisMax(this.enlargedData()?.buckets ?? []));
  readonly enlargedSeries = computed<MeteoChartSeries[]>(() => {
    const buckets = this.enlargedData()?.buckets ?? [];
    return [
      {
        label: 'Padavine',
        unit: 'mm',
        kind: 'bar',
        tone: 'precipitation',
        data: buckets.map((b) => b.precipitationMm),
      },
      {
        label: 'Skupaj',
        unit: 'mm',
        kind: 'line',
        tone: 'total',
        axis: 'right',
        dashed: true,
        width: 1.5,
        data: cumulativePrecipitation(buckets),
      },
    ];
  });

  ngOnInit(): void {
    this.unregister = this.refresh.register(() => this.load());
  }

  ngOnDestroy(): void {
    this.unregister?.();
  }

  open(): void {
    this.modalOpen.set(true);
    // Daljša serija se prenese ob PRVEM odprtju in ne ob izrisu nadzorne plošče: ploščica je
    // na njej vedno, povečan prikaz pa se odpre redko.
    if (!this.enlarged()) void this.loadEnlarged();
  }

  openTab(): void {
    this.modalOpen.set(false);
    void this.router.navigate(['/meteo']);
  }

  reload(): void {
    void this.load();
  }

  async load(): Promise<{ intervalMs: number }> {
    this.loading.set(true);
    try {
      const history = await this.api.history({ hours: MeteoTileComponent.TILE_HOURS });
      this.data.set(history);
      this.failed.set(false);
      this.stale.set(history.source.stale);
      this.ageSeconds.set(history.source.ageSeconds);
      // Odprt povečan prikaz se osveži skupaj s ploščico; zaprt ne, ker njegovih podatkov
      // nihče ne gleda.
      if (this.modalOpen()) void this.loadEnlarged();
      return { intervalMs: history.source.nextPollSeconds * 1000 };
    } catch {
      // Prejšnji prikaz ostane; "ni podatka" pokažemo samo, če ga še nikoli ni bilo.
      if (!this.data()) this.failed.set(true);
      return { intervalMs: 120_000 };
    } finally {
      this.loading.set(false);
    }
  }

  private async loadEnlarged(): Promise<void> {
    try {
      this.enlarged.set(await this.api.history({ hours: MeteoTileComponent.ENLARGED_HOURS }));
    } catch {
      // Povečan prikaz ostane pri 24-urni seriji, ki je že v ploščici — brez lastne napake,
      // ker ta prikaz ni edini vir tega podatka.
    }
  }
}

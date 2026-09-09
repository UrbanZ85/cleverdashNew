import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  IonButton,
  IonContent,
  IonIcon,
  IonSegment,
  IonSegmentButton,
  IonSpinner,
} from '@ionic/angular/standalone';
import { PageHeaderComponent } from '../../shared/layout/page-header.component.js';
import { AttributionComponent } from '../../shared/attribution/attribution.component.js';
import { StalenessBadgeComponent } from '../../shared/staleness/staleness-badge.component.js';
import { ForegroundRefreshService } from '../../core/refresh/foreground-refresh.service.js';
import { MeteoApi } from '../../core/meteo/meteo.api.js';
import {
  METEO_WINDOWS,
  bucketAxisLabels,
  cumulativePrecipitation,
  formatValue,
  localDateTimeLabel,
  localTimeLabel,
  precipitationAxisMax,
  windArrowRotation,
  windDirectionLabel,
  type MeteoHistory,
  type MeteoWindowHours,
} from '../../core/meteo/meteo.model.js';
import { MeteoChartComponent, type MeteoChartSeries } from './charts/meteo-chart.component.js';

// Zavihek "Meritve ARSO" (platform/tabs/registry.ts, id `meteo`).
//
// Kaj kaže: dvodnevno zgodovino ENE samodejne postaje — tiste, ki je izbrana v nastavitvah.
// Grafi so vsi, kar postaja meri: temperatura, padavine po urah, veter s sunki in smerjo,
// vlaga, zračni tlak, sončno obsevanje, višina snega. Katerih grafov NI, pove strežnik
// (`available`) — postaja brez barometra ne dobi prazne osi brez črte, ker je prazen graf
// videti kot okvara (člen VII).
//
// Dve ločljivosti v istem odgovoru in to ni podvajanje: padavine so vsota V INTERVALU, zato
// so smiselne samo po urah (stolpci, kot na Bergfexu), temperatura in veter pa sta trenutni
// meritvi, ki po urah izgubita ravno tisto, kar je zanimivo (jutranji sunek, opoldanska
// konica). Zato: stolpci iz `buckets`, črte iz `measurements`.
@Component({
  selector: 'app-meteo-page',
  standalone: true,
  imports: [
    RouterLink,
    PageHeaderComponent,
    AttributionComponent,
    StalenessBadgeComponent,
    MeteoChartComponent,
    IonContent,
    IonSegment,
    IonSegmentButton,
    IonButton,
    IonIcon,
    IonSpinner,
  ],
  template: `
    <app-page-header [title]="stationTitle()" [subtitle]="subtitle()">
      <ion-button slot="end" routerLink="/settings" aria-label="Izberi postajo" title="Izberi postajo">
        <ion-icon slot="icon-only" name="settings-outline"></ion-icon>
      </ion-button>
      <ion-button slot="end" (click)="reload()" [disabled]="loading()" aria-label="Osveži">
        <ion-icon slot="icon-only" name="refresh-outline"></ion-icon>
      </ion-button>
    </app-page-header>

    <ion-content>
      <div class="page">
        <ion-segment [value]="hours()" (ionChange)="onWindowChange($any($event.detail.value))">
          @for (window of windows; track window.hours) {
            <ion-segment-button [value]="window.hours">{{ window.label }}</ion-segment-button>
          }
        </ion-segment>

        @if (data(); as history) {
          @if (history.source.stale) {
            <app-staleness-badge [ageSeconds]="history.source.ageSeconds"></app-staleness-badge>
          }

          <!-- Zadnja meritev je prva stvar, ki jo človek pogleda; grafi so kontekst zanjo. -->
          <section class="now" [attr.aria-label]="'Zadnja meritev ' + measuredAt()">
            <div class="now-main">
              <span class="now-temp">{{ formatValue(history.summary.latest.temperatureC, '°C') }}</span>
              <span class="now-time">{{ measuredAt() }}</span>
            </div>
            <dl class="now-grid">
              <div>
                <dt>Najnižja / najvišja</dt>
                <dd>
                  {{ formatValue(history.summary.temperatureMinC, '°C') }} /
                  {{ formatValue(history.summary.temperatureMaxC, '°C') }}
                </dd>
              </div>
              <div>
                <dt>Padavine ({{ history.hours }} h)</dt>
                <dd>{{ formatValue(history.summary.precipitationTotalMm, 'mm') }}</dd>
              </div>
              <div>
                <dt>Veter</dt>
                <dd>
                  {{ formatValue(history.summary.latest.windAvgKmh, 'km/h', 0) }}
                  @if (latestDirection(); as dir) {
                    <span class="muted">iz {{ dir }}</span>
                  }
                </dd>
              </div>
              <div>
                <dt>Najmočnejši sunek</dt>
                <dd>{{ formatValue(history.summary.windMaxKmh, 'km/h', 0) }}</dd>
              </div>
              <div>
                <dt>Vlažnost</dt>
                <dd>{{ formatValue(history.summary.latest.humidityPct, '%', 0) }}</dd>
              </div>
              @if (history.available.pressure) {
                <div>
                  <dt>Zračni tlak</dt>
                  <dd>
                    {{
                      formatValue(
                        history.summary.latest.pressureMslHpa ?? history.summary.latest.pressureHpa,
                        'hPa'
                      )
                    }}
                  </dd>
                </div>
              }
              @if (history.available.snow) {
                <div>
                  <dt>Snežna odeja</dt>
                  <dd>{{ formatValue(history.summary.latest.snowCm, 'cm', 0) }}</dd>
                </div>
              }
              @if (history.available.waterTemperature) {
                <div>
                  <dt>Temperatura vode</dt>
                  <dd>{{ formatValue(history.summary.latest.waterTemperatureC, '°C') }}</dd>
                </div>
              }
            </dl>
          </section>

          @if (history.available.precipitation) {
            <section class="card">
              <header class="card-head">
                <h2>Padavine po urah</h2>
                <span class="card-note">
                  skupaj {{ formatValue(history.summary.precipitationTotalMm, 'mm') }}
                </span>
              </header>
              <app-meteo-chart
                title="Padavine po urah"
                [labels]="bucketLabels()"
                [series]="precipitationSeries()"
                [leftMax]="precipitationMax()"
                [leftBeginAtZero]="true"
                [heightPx]="200"
              ></app-meteo-chart>
              @if (!anyPrecipitation()) {
                <p class="card-empty">V tem obdobju ni padlo nič. Os je zato prazna, meritev pa je.</p>
              }
            </section>
          }

          @if (history.available.temperature) {
            <section class="card">
              <header class="card-head">
                <h2>Temperatura</h2>
                <span class="card-note">
                  {{ formatValue(history.summary.temperatureMinC, '°C') }} …
                  {{ formatValue(history.summary.temperatureMaxC, '°C') }}
                </span>
              </header>
              <app-meteo-chart
                title="Temperatura"
                [labels]="pointLabels()"
                [series]="temperatureSeries()"
                [heightPx]="220"
              ></app-meteo-chart>
            </section>
          }

          @if (history.available.wind) {
            <section class="card">
              <header class="card-head">
                <h2>Veter</h2>
                <span class="card-note">sunki do {{ formatValue(history.summary.windMaxKmh, 'km/h', 0) }}</span>
              </header>
              <app-meteo-chart
                title="Veter"
                [labels]="pointLabels()"
                [series]="windSeries()"
                [leftBeginAtZero]="true"
                [heightPx]="200"
              ></app-meteo-chart>
              <!-- Smer je krožna veličina in v grafu z osjo 0–360 nečitljiva (severnik skače
                   med spodnjim in zgornjim robom). Puščice povedo isto na en pogled. -->
              <div class="arrows" aria-label="Smer vetra po urah">
                @for (arrow of windArrows(); track arrow.startUtc) {
                  <span
                    class="arrow"
                    [class.arrow-missing]="arrow.rotation === null"
                    [style.transform]="arrow.rotation === null ? null : 'rotate(' + arrow.rotation + 'deg)'"
                    [title]="arrow.title"
                    >↑</span
                  >
                }
              </div>
            </section>
          }

          @if (history.available.humidity) {
            <section class="card">
              <header class="card-head"><h2>Vlažnost</h2></header>
              <app-meteo-chart
                title="Vlažnost"
                [labels]="pointLabels()"
                [series]="humiditySeries()"
                [leftMin]="0"
                [leftMax]="100"
                [heightPx]="180"
              ></app-meteo-chart>
            </section>
          }

          @if (history.available.pressure) {
            <section class="card">
              <header class="card-head"><h2>Zračni tlak</h2></header>
              <app-meteo-chart
                title="Zračni tlak"
                [labels]="pointLabels()"
                [series]="pressureSeries()"
                [heightPx]="180"
              ></app-meteo-chart>
            </section>
          }

          @if (history.available.radiation) {
            <section class="card">
              <header class="card-head"><h2>Sončno obsevanje</h2></header>
              <app-meteo-chart
                title="Sončno obsevanje"
                [labels]="pointLabels()"
                [series]="radiationSeries()"
                [leftBeginAtZero]="true"
                [heightPx]="180"
              ></app-meteo-chart>
            </section>
          }

          @if (history.available.snow && snowPresent()) {
            <section class="card">
              <header class="card-head"><h2>Snežna odeja</h2></header>
              <app-meteo-chart
                title="Snežna odeja"
                [labels]="pointLabels()"
                [series]="snowSeries()"
                [leftBeginAtZero]="true"
                [heightPx]="160"
              ></app-meteo-chart>
            </section>
          }

          <footer class="page-foot">
            <app-attribution
              [text]="history.source.attribution.text"
              [url]="history.source.attribution.url"
            ></app-attribution>
            <a class="source-link" [href]="history.source.url" target="_blank" rel="noopener">
              Izvorna stran postaje
            </a>
          </footer>
        } @else if (loading()) {
          <div class="state"><ion-spinner name="dots"></ion-spinner></div>
        } @else {
          <!-- Nikoli prazen zaslon brez pojasnila (člen VII). Napaka pove tudi pot ven:
               postaja se izbere v nastavitvah. -->
          <div class="state">
            <p>{{ error() ?? 'Meritev še ni na voljo.' }}</p>
            <ion-button size="small" (click)="reload()">Poskusi znova</ion-button>
            <ion-button size="small" fill="clear" routerLink="/settings">Izberi postajo</ion-button>
          </div>
        }
      </div>
    </ion-content>
  `,
  styles: `
    .page {
      max-width: 1100px;
      margin: 0 auto;
      padding: var(--cd-page-padding);
      display: grid;
      gap: var(--cd-space-4);
    }
    .card,
    .now {
      background: var(--cd-surface);
      border: 1px solid var(--cd-divider);
      border-radius: var(--cd-radius-lg);
      box-shadow: var(--cd-shadow-sm);
      padding: var(--cd-space-4);
    }
    .card-head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: var(--cd-space-3);
      margin-bottom: var(--cd-space-2);
    }
    .card-head h2 {
      margin: 0;
      font-size: var(--cd-font-size-md);
      font-weight: 650;
    }
    .card-note,
    .now-time,
    .muted {
      color: var(--cd-text-muted);
      font-size: var(--cd-font-size-sm);
    }
    .card-empty {
      margin: var(--cd-space-2) 0 0;
      color: var(--cd-text-muted);
      font-size: var(--cd-font-size-sm);
    }
    .now-main {
      display: flex;
      align-items: baseline;
      gap: var(--cd-space-3);
      margin-bottom: var(--cd-space-3);
    }
    .now-temp {
      font-size: var(--cd-font-size-display);
      font-weight: 650;
      line-height: 1;
    }
    .now-grid {
      margin: 0;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: var(--cd-space-3);
    }
    .now-grid dt {
      color: var(--cd-text-muted);
      font-size: var(--cd-font-size-xs);
    }
    .now-grid dd {
      margin: 2px 0 0;
      font-size: var(--cd-font-size-md);
      font-weight: 600;
      display: flex;
      align-items: baseline;
      gap: var(--cd-space-2);
    }
    /* Puščice ležijo pod grafom vetra in so enako široke, da se berejo kot ura za uro. Ujemanje
       z osjo grafa je PRIBLIŽNO — graf si na levi vzame prostor za oznake osi, tega prostora pa
       od zunaj ni mogoče izmeriti brez branja Chart.jsove postavitve. Zato ima vsaka puščica
       svoj namig z dnevom in uro; ta pove natanko, katera ura je, tudi če je pas zamaknjen. */
    .arrows {
      margin-top: var(--cd-space-2);
      display: grid;
      grid-auto-flow: column;
      grid-auto-columns: 1fr;
      align-items: center;
      justify-items: center;
      overflow: hidden;
    }
    .arrow {
      display: inline-block;
      font-size: 0.9rem;
      line-height: 1;
      color: var(--ion-color-primary);
    }
    .arrow-missing {
      opacity: 0.25;
    }
    .page-foot {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--cd-space-3);
      padding-bottom: var(--cd-space-4);
    }
    .source-link {
      font-size: var(--cd-font-size-xs);
      color: var(--cd-text-muted);
    }
    .state {
      display: grid;
      justify-items: center;
      gap: var(--cd-space-3);
      padding: var(--cd-space-6) var(--cd-space-4);
      color: var(--cd-text-muted);
    }
  `,
})
export class MeteoPage implements OnInit, OnDestroy {
  private readonly api = inject(MeteoApi);
  private readonly refresh = inject(ForegroundRefreshService);

  readonly windows = METEO_WINDOWS;
  readonly formatValue = formatValue;

  readonly data = signal<MeteoHistory | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly hours = signal<MeteoWindowHours>(24);

  private unregister?: () => void;

  readonly stationTitle = computed(() => this.data()?.station.title ?? 'Meritve ARSO');
  readonly measuredAt = computed(() => {
    const iso = this.data()?.summary.latest.validUtc;
    return iso ? localDateTimeLabel(iso) : '';
  });
  readonly subtitle = computed(() => {
    const history = this.data();
    if (!history) return null;
    const parts = [`${history.station.id}`];
    if (history.station.altitudeM !== null) parts.push(`${history.station.altitudeM} m`);
    // Da uporabnik ve, da gleda privzeto postajo in ne svoje — sicer išče napako v podatkih.
    if (!history.station.chosen) parts.push('privzeta postaja');
    return parts.join(' · ');
  });
  readonly latestDirection = computed(() => windDirectionLabel(this.data()?.summary.latest.windDirectionDeg));

  /** Oznake pod grafi urnih vrednosti (stolpci padavin). */
  readonly bucketLabels = computed(() => bucketAxisLabels(this.data()?.buckets ?? []));

  /** Oznake pod grafi posameznih meritev — ura in minuta v slovenski coni. */
  readonly pointLabels = computed(() => (this.measurements() ?? []).map((m) => localTimeLabel(m.validUtc)));

  readonly precipitationMax = computed(() => precipitationAxisMax(this.data()?.buckets ?? []));
  readonly anyPrecipitation = computed(() => (this.data()?.summary.precipitationTotalMm ?? 0) > 0);
  readonly snowPresent = computed(() => (this.measurements() ?? []).some((m) => (m.snowCm ?? 0) > 0));

  readonly precipitationSeries = computed<MeteoChartSeries[]>(() => {
    const buckets = this.data()?.buckets ?? [];
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

  readonly temperatureSeries = computed<MeteoChartSeries[]>(() => [
    {
      label: 'Temperatura',
      unit: '°C',
      kind: 'line',
      tone: 'temperature',
      fill: true,
      data: (this.measurements() ?? []).map((m) => m.temperatureC),
    },
  ]);

  readonly windSeries = computed<MeteoChartSeries[]>(() => {
    const measurements = this.measurements() ?? [];
    return [
      {
        label: 'Sunki',
        unit: 'km/h',
        kind: 'line',
        tone: 'gust',
        width: 1.5,
        data: measurements.map((m) => m.windMaxKmh),
      },
      {
        label: 'Povprečna hitrost',
        unit: 'km/h',
        kind: 'line',
        tone: 'wind',
        data: measurements.map((m) => m.windAvgKmh),
      },
    ];
  });

  readonly humiditySeries = computed<MeteoChartSeries[]>(() => [
    {
      label: 'Vlažnost',
      unit: '%',
      kind: 'line',
      tone: 'humidity',
      fill: true,
      data: (this.measurements() ?? []).map((m) => m.humidityPct),
    },
  ]);

  readonly pressureSeries = computed<MeteoChartSeries[]>(() => [
    {
      label: 'Zračni tlak',
      unit: 'hPa',
      kind: 'line',
      tone: 'pressure',
      data: (this.measurements() ?? []).map((m) => m.pressureMslHpa ?? m.pressureHpa),
    },
  ]);

  readonly radiationSeries = computed<MeteoChartSeries[]>(() => {
    const measurements = this.measurements() ?? [];
    return [
      {
        label: 'Globalno',
        unit: 'W/m²',
        kind: 'line',
        tone: 'radiation',
        fill: true,
        data: measurements.map((m) => m.globalRadiationWm2),
      },
      {
        label: 'Difuzno',
        unit: 'W/m²',
        kind: 'line',
        tone: 'total',
        width: 1.5,
        dashed: true,
        data: measurements.map((m) => m.diffuseRadiationWm2),
      },
    ];
  });

  readonly snowSeries = computed<MeteoChartSeries[]>(() => [
    {
      label: 'Snežna odeja',
      unit: 'cm',
      kind: 'line',
      tone: 'snow',
      fill: true,
      data: (this.measurements() ?? []).map((m) => m.snowCm),
    },
  ]);

  /** Puščice smeri vetra — ena na urno vedro, poravnane z osjo grafa nad njimi. */
  readonly windArrows = computed(() =>
    (this.data()?.buckets ?? []).map((bucket) => {
      const label = windDirectionLabel(bucket.windDirectionDeg);
      return {
        startUtc: bucket.startUtc,
        rotation: windArrowRotation(bucket.windDirectionDeg),
        title: label
          ? `${bucket.dayLabel} ${bucket.label}: iz ${label} (${bucket.windDirectionDeg}°)`
          : `${bucket.dayLabel} ${bucket.label}: brez smeri`,
      };
    }),
  );

  private readonly measurements = computed(() => this.data()?.measurements ?? null);

  ngOnInit(): void {
    // Osveževanje samo v ospredju in v intervalu, ki ga pove strežnik (člen VIII) — enako kot
    // ploščice na nadzorni plošči.
    this.unregister = this.refresh.register(() => this.load());
  }

  ngOnDestroy(): void {
    this.unregister?.();
  }

  onWindowChange(hours: MeteoWindowHours | undefined): void {
    if (!hours || hours === this.hours()) return;
    this.hours.set(hours);
    void this.load();
  }

  reload(): void {
    void this.load();
  }

  async load(): Promise<{ intervalMs: number }> {
    this.loading.set(true);
    try {
      const history = await this.api.history({ hours: this.hours(), raw: true });
      this.data.set(history);
      this.error.set(null);
      return { intervalMs: history.source.nextPollSeconds * 1000 };
    } catch (err) {
      // Prejšnji prikaz ostane nedotaknjen; sporočilo se pokaže, samo če podatka še ni bilo.
      if (!this.data()) this.error.set(problemDetail(err));
      return { intervalMs: 120_000 };
    } finally {
      this.loading.set(false);
    }
  }
}

/** Sporočilo iz odgovora RFC 7807, kakor ga vrne naš strežnik (platform/errors/problem.ts).
 * Brez tega bi uporabnik dobil "Http failure response …", kar ne pove ničesar. */
function problemDetail(err: unknown): string {
  const error = err as { error?: { detail?: string; title?: string }; status?: number };
  return (
    error?.error?.detail ??
    error?.error?.title ??
    'Meritev te postaje ni bilo mogoče prenesti. Poskusi znova ali izberi drugo postajo v nastavitvah.'
  );
}

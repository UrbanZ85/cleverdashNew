import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonButton, IonIcon } from '@ionic/angular/standalone';
import { TileCardComponent } from '../../../shared/layout/tile-card.component.js';
import { StalenessBadgeComponent } from '../../../shared/staleness/staleness-badge.component.js';
import { NoDataComponent } from '../../../shared/staleness/no-data.component.js';
import { AttributionComponent } from '../../../shared/attribution/attribution.component.js';
import { ForegroundRefreshService } from '../../../core/refresh/foreground-refresh.service.js';
import { MeteoApi } from '../../../core/meteo/meteo.api.js';
import {
  bucketAxisLabels,
  formatValue,
  localTimeLabel,
  precipitationAxisMax,
  windDirectionLabel,
  type MeteoHistory,
} from '../../../core/meteo/meteo.model.js';
import { MeteoChartComponent, type MeteoChartSeries } from '../charts/meteo-chart.component.js';

// Ploščica na nadzorni plošči: urne padavine zadnjih 24 ur in trenutno stanje izbrane postaje.
// Klik odpre zavihek "Meritve ARSO", kjer so vsi grafi.
//
// Zakaj samo padavine in ne vseh sedem grafov: ploščica je PREGLED (isti dogovor kot pri
// vtičnikih — mreža je pregled, zaslon je delo). "Ali je danes deževalo in koliko" je edino
// vprašanje, ki se odgovori na en pogled; ostalo potrebuje prostor cele strani.
//
// Podatek je prenesen BREZ posameznih meritev (`raw` se ne pošlje) — urne vrednosti so vse,
// kar stolpci potrebujejo, odgovor pa je s tem desetkrat manjši.
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
    IonIcon,
  ],
  template: `
    <app-tile-card title="Padavine po urah" icon="rainy-outline" [subtitle]="subtitle()" [loading]="loading()">
      <ion-button
        slot="actions"
        fill="clear"
        size="small"
        (click)="openTab()"
        aria-label="Odpri meritve postaje"
        title="Odpri meritve postaje"
      >
        <ion-icon slot="icon-only" name="expand-outline"></ion-icon>
      </ion-button>

      @if (data(); as history) {
        <div class="now">
          <span class="temp">{{ formatValue(history.summary.latest.temperatureC, '°C') }}</span>
          <span class="rain">{{ formatValue(history.summary.precipitationTotalMm, 'mm') }} / 24 h</span>
        </div>
        <app-meteo-chart
          title="Padavine po urah, zadnjih 24 ur"
          [labels]="labels()"
          [series]="series()"
          [leftMax]="axisMax()"
          [leftBeginAtZero]="true"
          [heightPx]="120"
        ></app-meteo-chart>
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
  `,
  styles: `
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
  `,
})
export class MeteoTileComponent implements OnInit, OnDestroy {
  private readonly api = inject(MeteoApi);
  private readonly refresh = inject(ForegroundRefreshService);
  private readonly router = inject(Router);

  readonly formatValue = formatValue;

  readonly data = signal<MeteoHistory | null>(null);
  readonly loading = signal(false);
  readonly failed = signal(false);
  readonly stale = signal(false);
  readonly ageSeconds = signal(0);

  private unregister?: () => void;

  readonly subtitle = computed(() => this.data()?.station.title ?? null);
  readonly direction = computed(() => windDirectionLabel(this.data()?.summary.latest.windDirectionDeg));
  readonly measuredAt = computed(() => {
    const iso = this.data()?.summary.latest.validUtc;
    return iso ? localTimeLabel(iso) : '';
  });
  readonly labels = computed(() => bucketAxisLabels(this.data()?.buckets ?? []));
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

  ngOnInit(): void {
    this.unregister = this.refresh.register(() => this.load());
  }

  ngOnDestroy(): void {
    this.unregister?.();
  }

  openTab(): void {
    void this.router.navigate(['/meteo']);
  }

  reload(): void {
    void this.load();
  }

  async load(): Promise<{ intervalMs: number }> {
    this.loading.set(true);
    try {
      const history = await this.api.history({ hours: 24 });
      this.data.set(history);
      this.failed.set(false);
      this.stale.set(history.source.stale);
      this.ageSeconds.set(history.source.ageSeconds);
      return { intervalMs: history.source.nextPollSeconds * 1000 };
    } catch {
      // Prejšnji prikaz ostane; "ni podatka" pokažemo samo, če ga še nikoli ni bilo.
      if (!this.data()) this.failed.set(true);
      return { intervalMs: 120_000 };
    } finally {
      this.loading.set(false);
    }
  }
}

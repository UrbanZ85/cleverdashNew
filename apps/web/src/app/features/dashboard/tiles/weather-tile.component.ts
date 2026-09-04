import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { apiUrl } from '../../../core/api/api-base.js';
import { ForegroundRefreshService } from '../../../core/refresh/foreground-refresh.service.js';
import { AttributionComponent } from '../../../shared/attribution/attribution.component.js';
import { StalenessBadgeComponent } from '../../../shared/staleness/staleness-badge.component.js';
import { NoDataComponent } from '../../../shared/staleness/no-data.component.js';
import { TileCardComponent } from '../../../shared/layout/tile-card.component.js';

interface WeatherReading {
  location: { name: string; latitude: number | null; longitude: number | null };
  observation: {
    temperatureC: number | null;
    humidityPercent: number | null;
    windSpeed: string | null;
    windDirection: string | null;
    skyCondition: string | null;
    measuredAt: string | null;
  };
  source: { ageSeconds: number; stale: boolean; nextPollSeconds: number; attribution: { text: string; url: string } };
}

// FR-023: temperatura, stanje neba, veter, vlažnost in čas meritve. Osveževanje samo v
// ospredju, interval iz odgovora strežnika (FR-022, research.md §8). Uporabljena je v
// `dashboard.page.ts` znotraj `<app-tile-host>` (US4, T099) — izpad tega vira ne sme
// vplivati na radarsko ploščico.
@Component({
  selector: 'app-weather-tile',
  standalone: true,
  imports: [TileCardComponent, AttributionComponent, StalenessBadgeComponent, NoDataComponent],
  template: `
    <app-tile-card
      title="Vreme"
      icon="thermometer-outline"
      [subtitle]="reading()?.location?.name ?? null"
      [loading]="loading()"
    >
      @if (reading(); as w) {
        <div class="now">
          <span class="temp">{{ w.observation.temperatureC ?? '—' }}<span class="unit">°C</span></span>
          <span class="sky">{{ w.observation.skyCondition ?? 'ni podatka' }}</span>
        </div>
        <dl class="facts">
          <div class="fact">
            <dt>Veter</dt>
            <dd>{{ w.observation.windSpeed ?? '—' }} ({{ w.observation.windDirection ?? '—' }})</dd>
          </div>
          <div class="fact">
            <dt>Vlažnost</dt>
            <dd>{{ w.observation.humidityPercent ?? '—' }}%</dd>
          </div>
          <div class="fact">
            <dt>Izmerjeno</dt>
            <dd>{{ formatMeasuredAt(w.observation.measuredAt) }}</dd>
          </div>
        </dl>
      } @else if (neverLoaded()) {
        <app-no-data (retry)="load()"></app-no-data>
      }

      <div slot="footer">
        @if (reading(); as w) {
          @if (w.source.stale) {
            <app-staleness-badge [ageSeconds]="w.source.ageSeconds"></app-staleness-badge>
          }
          <app-attribution
            [text]="w.source.attribution.text"
            [url]="w.source.attribution.url"
          ></app-attribution>
        }
      </div>
    </app-tile-card>
  `,
  styles: `
    .now {
      display: flex;
      align-items: baseline;
      gap: var(--cd-space-3);
      flex-wrap: wrap;
      margin-bottom: var(--cd-space-4);
    }
    .temp {
      font-size: var(--cd-font-size-display);
      font-weight: 300;
      line-height: 1;
      letter-spacing: -0.03em;
      color: var(--ion-text-color);
    }
    .unit {
      font-size: var(--cd-font-size-lg);
      font-weight: 400;
      color: var(--cd-text-muted);
    }
    .sky {
      font-size: var(--cd-font-size-md);
      color: var(--cd-text-muted);
    }
    .facts {
      margin: 0;
      display: grid;
      gap: var(--cd-space-2);
    }
    .fact {
      display: flex;
      justify-content: space-between;
      gap: var(--cd-space-3);
      font-size: var(--cd-font-size-sm);
    }
    .fact dt {
      color: var(--cd-text-muted);
    }
    .fact dd {
      margin: 0;
      font-weight: 600;
      text-align: right;
    }
  `,
})
export class WeatherTileComponent implements OnInit, OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly refresh = inject(ForegroundRefreshService);

  readonly reading = signal<WeatherReading | null>(null);
  readonly neverLoaded = signal(false);
  readonly loading = signal(true);
  private unregister?: () => void;

  ngOnInit(): void {
    this.unregister = this.refresh.register(() => this.load());
  }

  ngOnDestroy(): void {
    this.unregister?.();
  }

  async load(): Promise<{ intervalMs: number }> {
    try {
      const data = await firstValueFrom(
        this.http.get<WeatherReading>(apiUrl('/dashboard/weather'), { withCredentials: true }),
      );
      this.reading.set(data);
      this.neverLoaded.set(false);
      return { intervalMs: data.source.nextPollSeconds * 1000 };
    } catch {
      // 503 pomeni "podatka še ni bilo nikoli" (FR-026) — druge napake pustijo prejšnji
      // prikaz nedotaknjen, saj je lahko šlo za prehodno napako omrežja odjemalca.
      if (!this.reading()) this.neverLoaded.set(true);
      return { intervalMs: 60_000 };
    } finally {
      this.loading.set(false);
    }
  }

  /** Ura meritve v lokalni coni brskalnika. */
  formatMeasuredAt(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleTimeString('sl-SI', { hour: '2-digit', minute: '2-digit' });
  }
}

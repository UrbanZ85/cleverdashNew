import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { apiUrl } from '../../../core/api/api-base.js';
import { ForegroundRefreshService } from '../../../core/refresh/foreground-refresh.service.js';
import { AttributionComponent } from '../../../shared/attribution/attribution.component.js';
import { StalenessBadgeComponent } from '../../../shared/staleness/staleness-badge.component.js';
import { NoDataComponent } from '../../../shared/staleness/no-data.component.js';
import { TileCardComponent } from '../../../shared/layout/tile-card.component.js';

// Oblika je natanko `ForecastResponse` iz apps/api/src/modules/dashboard/mappers/weather.mapper.ts
// (toForecastResponse) — brez padavin, ker jih ARSO v tem viru ne vrne.
interface ForecastEntry {
  validAt: string;
  temperatureC: number | null;
  skyCondition: string | null;
  icon: string | null;
}

interface ForecastResponse {
  location: { name: string };
  entries: ForecastEntry[];
  source: {
    ageSeconds: number;
    stale: boolean;
    nextPollSeconds: number;
    attribution: { text: string; url: string };
  };
}

// GET /dashboard/forecast je na strani API-ja obstajal že od 001 (mappers/weather.mapper.ts,
// toForecastResponse — do 8 vnosov po 3 ure), a ga ni uporabljala NOBENA ploščica. Napoved
// je bila torej že plačana: predpomnjena je pod istim ključem kot trenutno vreme, zato ta
// ploščica ne doda niti enega klica proti ARSO (člen VIII).
@Component({
  selector: 'app-forecast-tile',
  standalone: true,
  imports: [TileCardComponent, AttributionComponent, StalenessBadgeComponent, NoDataComponent],
  template: `
    <app-tile-card
      title="Napoved"
      icon="partly-sunny-outline"
      [subtitle]="forecast()?.location?.name ?? null"
      [loading]="loading()"
    >
      @if (forecast(); as f) {
        @if (f.entries.length === 0) {
          <p class="cd-muted">Napovedi za to lokacijo ni.</p>
        } @else {
          <ul class="forecast">
            @for (entry of f.entries; track entry.validAt) {
              <li class="forecast-slot">
                <span class="slot-time">{{ formatHour(entry.validAt) }}</span>
                <span class="slot-temp">{{ entry.temperatureC ?? '—' }}°</span>
                <span class="slot-sky">{{ entry.skyCondition ?? '—' }}</span>
              </li>
            }
          </ul>
        }
      } @else if (neverLoaded()) {
        <app-no-data (retry)="load()"></app-no-data>
      }

      <div slot="footer">
        @if (forecast(); as f) {
          @if (f.source.stale) {
            <app-staleness-badge [ageSeconds]="f.source.ageSeconds"></app-staleness-badge>
          }
          <app-attribution
            [text]="f.source.attribution.text"
            [url]="f.source.attribution.url"
          ></app-attribution>
        }
      </div>
    </app-tile-card>
  `,
  styles: `
    .forecast {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      gap: var(--cd-space-2);
      overflow-x: auto;
      /* Vodoravno drsenje znotraj ploščice, da osem stolpcev ne razširi strani. */
      scrollbar-width: thin;
      padding-bottom: var(--cd-space-1);
    }
    .forecast-slot {
      flex: none;
      min-width: 68px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      padding: var(--cd-space-2) var(--cd-space-1);
      border-radius: var(--cd-radius-sm);
      background: var(--cd-surface-sunken);
      text-align: center;
    }
    .slot-time {
      font-size: var(--cd-font-size-xs);
      color: var(--cd-text-muted);
    }
    .slot-temp {
      font-size: var(--cd-font-size-lg);
      font-weight: 650;
      line-height: 1.1;
    }
    .slot-sky {
      font-size: var(--cd-font-size-xs);
      color: var(--cd-text-muted);
      line-height: 1.25;
    }
  `,
})
export class ForecastTileComponent implements OnInit, OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly refresh = inject(ForegroundRefreshService);

  readonly forecast = signal<ForecastResponse | null>(null);
  readonly neverLoaded = signal(false);
  readonly loading = signal(true);
  private unregister?: () => void;

  ngOnInit(): void {
    this.unregister = this.refresh.register(() => this.load());
  }

  ngOnDestroy(): void {
    this.unregister?.();
  }

  /** Ura v obliki "15h" v coni brskalnika. Namenoma ne uporablja
   * toISOString().split("T") — člen V ustave to obliko izrecno prepoveduje za dneve, in
   * ista past (premik za časovni pas) velja tudi za ure. */
  formatHour(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return `${d.getHours()}h`;
  }

  async load(): Promise<{ intervalMs: number }> {
    try {
      const data = await firstValueFrom(
        this.http.get<ForecastResponse>(apiUrl('/dashboard/forecast'), { withCredentials: true }),
      );
      this.forecast.set(data);
      this.neverLoaded.set(false);
      return { intervalMs: data.source.nextPollSeconds * 1000 };
    } catch {
      if (!this.forecast()) this.neverLoaded.set(true);
      return { intervalMs: 60_000 };
    } finally {
      this.loading.set(false);
    }
  }
}

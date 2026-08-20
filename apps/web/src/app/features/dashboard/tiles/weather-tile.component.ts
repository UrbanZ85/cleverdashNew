import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { IonCard, IonCardContent } from '@ionic/angular/standalone';
import { apiUrl } from '../../../core/api/api-base.js';
import { ForegroundRefreshService } from '../../../core/refresh/foreground-refresh.service.js';
import { AttributionComponent } from '../../../shared/attribution/attribution.component.js';
import { StalenessBadgeComponent } from '../../../shared/staleness/staleness-badge.component.js';
import { NoDataComponent } from '../../../shared/staleness/no-data.component.js';

interface WeatherReading {
  location: { name: string };
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
  imports: [IonCard, IonCardContent, AttributionComponent, StalenessBadgeComponent, NoDataComponent],
  template: `
    <ion-card>
      <ion-card-content>
        @if (reading(); as w) {
          <h2>{{ w.observation.temperatureC ?? '—' }}°C — {{ w.observation.skyCondition ?? 'ni podatka' }}</h2>
          <p>Veter: {{ w.observation.windSpeed ?? '—' }} ({{ w.observation.windDirection ?? '—' }})</p>
          <p>Vlažnost: {{ w.observation.humidityPercent ?? '—' }}%</p>
          @if (w.source.stale) {
            <app-staleness-badge [ageSeconds]="w.source.ageSeconds"></app-staleness-badge>
          }
          <app-attribution [text]="w.source.attribution.text" [url]="w.source.attribution.url"></app-attribution>
        } @else if (neverLoaded()) {
          <app-no-data (retry)="load()"></app-no-data>
        }
      </ion-card-content>
    </ion-card>
  `,
})
export class WeatherTileComponent implements OnInit, OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly refresh = inject(ForegroundRefreshService);

  readonly reading = signal<WeatherReading | null>(null);
  readonly neverLoaded = signal(false);
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
    }
  }
}

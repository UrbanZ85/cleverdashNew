import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { IonCard, IonCardContent } from '@ionic/angular/standalone';
import { apiUrl } from '../../../core/api/api-base.js';
import { ForegroundRefreshService } from '../../../core/refresh/foreground-refresh.service.js';
import { AttributionComponent } from '../../../shared/attribution/attribution.component.js';
import { StalenessBadgeComponent } from '../../../shared/staleness/staleness-badge.component.js';
import { NoDataComponent } from '../../../shared/staleness/no-data.component.js';

// FR-021, FR-025: slika se nalaga IZKLJUČNO prek /api/v1/dashboard/radar — nikoli
// neposredno z ARSO (research.md §2: mešana vsebina na https://app.si, in člen VIII).
// Ker pot zahteva Authorization glavo, navaden <img src="..."> ne deluje — sliko je
// treba prenesti prek HttpClient (interceptor doda žeton) in jo prikazati kot object URL.
@Component({
  selector: 'app-radar-tile',
  standalone: true,
  imports: [IonCard, IonCardContent, AttributionComponent, StalenessBadgeComponent, NoDataComponent],
  template: `
    <ion-card>
      <ion-card-content>
        @if (imageUrl(); as url) {
          <img [src]="url" alt="Radarska slika padavin ARSO" />
          @if (stale()) {
            <app-staleness-badge [ageSeconds]="ageSeconds()"></app-staleness-badge>
          }
          <app-attribution [text]="attributionText()" [url]="attributionUrl()"></app-attribution>
        } @else if (neverLoaded()) {
          <app-no-data (retry)="load()"></app-no-data>
        }
      </ion-card-content>
    </ion-card>
  `,
  styles: `
    img {
      max-width: 100%;
      display: block;
    }
  `,
})
export class RadarTileComponent implements OnInit, OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly refresh = inject(ForegroundRefreshService);

  readonly imageUrl = signal<string | null>(null);
  readonly neverLoaded = signal(false);
  readonly stale = signal(false);
  readonly ageSeconds = signal(0);
  readonly attributionText = signal('Vir: ARSO');
  readonly attributionUrl = signal('https://meteo.arso.gov.si');

  private unregister?: () => void;
  private previousObjectUrl: string | null = null;

  ngOnInit(): void {
    this.unregister = this.refresh.register(() => this.load());
  }

  ngOnDestroy(): void {
    this.unregister?.();
    if (this.previousObjectUrl) URL.revokeObjectURL(this.previousObjectUrl);
  }

  async load(): Promise<{ intervalMs: number }> {
    try {
      const res = await firstValueFrom(
        this.http.get(apiUrl('/dashboard/radar'), {
          withCredentials: true,
          responseType: 'blob',
          observe: 'response',
        }),
      );
      const nextPollSeconds = Number(res.headers.get('X-Source-Next-Poll-Seconds') ?? '300');
      this.stale.set(res.headers.get('X-Source-Stale') === 'true');
      this.attributionText.set(res.headers.get('X-Source-Attribution') ?? 'Vir: ARSO');

      const fetchedAt = res.headers.get('X-Source-Fetched-At');
      this.ageSeconds.set(fetchedAt ? Math.round((Date.now() - new Date(fetchedAt).getTime()) / 1000) : 0);

      if (this.previousObjectUrl) URL.revokeObjectURL(this.previousObjectUrl);
      const objectUrl = URL.createObjectURL(res.body!);
      this.previousObjectUrl = objectUrl;
      this.imageUrl.set(objectUrl);
      this.neverLoaded.set(false);
      return { intervalMs: nextPollSeconds * 1000 };
    } catch {
      if (!this.imageUrl()) this.neverLoaded.set(true);
      return { intervalMs: 60_000 };
    }
  }
}

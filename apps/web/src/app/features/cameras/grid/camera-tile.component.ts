import { Component, Input, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { IonCard, IonCardContent, IonIcon, IonBadge } from '@ionic/angular/standalone';
import { apiUrl } from '../../../core/api/api-base.js';
import { ForegroundRefreshService } from '../../../core/refresh/foreground-refresh.service.js';
import {
  NetworkStatusService,
  resolveRefreshIntervalMs,
  shouldAutoplayLiveStream,
} from '../../../core/network/network-status.service.js';
import { EmbeddedCameraComponent } from '../viewer/embedded-camera.component.js';
import { StalenessBadgeComponent } from '../../../shared/staleness/staleness-badge.component.js';

export type CameraType = 'snapshot' | 'mjpeg' | 'hls' | 'iframe' | 'snapshot+iframe';
export type CameraHealthState = 'ok' | 'stale' | 'unreachable' | 'unknown' | 'not-applicable';

export interface CameraTileInput {
  id: string;
  name: string;
  type: CameraType;
  refreshIntervalSeconds: number;
  active: boolean;
  /** Naslov, ki ga vrne GET /cameras — pri vrsti `iframe` je to naslov vdelave in mreža ga
   * potrebuje, da vdelavo izriše že v ploščici (ne le v polnem prikazu). */
  previewUrl: string;
}

interface CameraHealthResponse {
  state: CameraHealthState;
  ageSeconds: number | null;
}

// Samo ti dve vrsti imajo posnetek, ki ga `GET /cameras/{id}/snapshot` sploh lahko vrne
// (research.md §3) — ujema se z `isHealthCheckable` na strežniku.
const HAS_SNAPSHOT: ReadonlySet<CameraType> = new Set(['snapshot', 'snapshot+iframe']);

// Odjemalčev približek `CAMERA_DEGRADED_REFRESH_MULTIPLIER` (privzeta strežniška vrednost
// je 4, research.md §13) — FR-011, upočasnjeno osveževanje ob "unreachable". Odjemalec te
// vrednosti nima od kod prebrati (ni je v `/settings` ali `/cameras` odgovoru), zato je tu
// podvojena kot dokumentiran privzetek, ne kot samodejno usklajena konfiguracija.
const DEGRADED_REFRESH_MULTIPLIER = 4;

// FR-011, Story 5: ploščica kamere v mreži — posnetek (če vrsta to omogoča), čas zajema,
// stanje (v redu/staro/nedosegljivo/še ni podatka — vrste brez posnetka značke stanja nimajo,
// ker strežniškega preverjanja zanje ni). Osveževanje teče samo v
// ospredju (ForegroundRefreshService) in se prilagodi mobilnemu omrežju + nastavitvi
// podatkovnega prihranka (Story 7).
@Component({
  selector: 'app-camera-tile',
  standalone: true,
  imports: [RouterLink, IonCard, IonCardContent, IonIcon, IonBadge, StalenessBadgeComponent, EmbeddedCameraComponent],
  template: `
    <ion-card [routerLink]="['/cameras', camera.id]" button="true">
      <ion-card-content>
        @if (hasSnapshot()) {
          @if (snapshotUrl()) {
            <img [src]="snapshotUrl()" [alt]="camera.name" class="camera-tile-image" [class.stale]="isDegraded()" />
          }
        } @else if (showEmbed()) {
          <!-- Vdelava se izriše že v mreži: pri vrsti "iframe" posnetka ni in ploščica je
               bila prej samo siv nadomestek — kamere ni bilo videti nikjer, dokler je
               uporabnik ni odprl. Prosojna plast čez okvir poskrbi, da klik odpre kamero in
               ne pristane v tuji strani (isti prijem kot pri vtičniku na nadzorni plošči). -->
          <div class="camera-tile-embed">
            <app-embedded-camera [url]="camera.previewUrl"></app-embedded-camera>
            <span class="camera-tile-embed-catch"></span>
          </div>
        } @else {
          <div class="camera-tile-placeholder">
            <ion-icon name="videocam-outline"></ion-icon>
            <!-- FR-011: brez posnetka ni česa pokazati; prazen okvir je videti kot okvara,
                 zato pove, kaj je in kje se vidi. -->
            <span>{{ placeholderHint() }}</span>
          </div>
        }
        <h3>{{ camera.name }}</h3>
        @if (health().state === 'stale' || health().state === 'unreachable') {
          <app-staleness-badge [ageSeconds]="health().ageSeconds ?? 0"></app-staleness-badge>
        }
        @if (health().state === 'unreachable') {
          <ion-badge color="danger">Nedosegljivo</ion-badge>
        }
        <!-- FR-011: "še ni podatka" velja SAMO za vrste s posnetkom (prvi zajem še ni uspel).
             Vrste brez posnetka (iframe, mjpeg, hls) strežniško niso preverljive, a to ni
             stanje, ki bi ga bilo vredno označiti: vdelava se ali izriše ali pa se že po
             praznem okvirju vidi, da vir ne dela — značka ob delujoči vdelavi je bila videti
             kot okvara. Zato take ploščice ne dobijo NOBENE značke stanja (in zdravja sploh
             ne poizvedujejo, glej poll() spodaj). -->
        @if (health().state === 'unknown' && hasSnapshot()) {
          <ion-badge color="medium">Še ni podatka</ion-badge>
        }
        @if (!camera.active) {
          <ion-badge color="medium">Neaktivna</ion-badge>
        }
      </ion-card-content>
    </ion-card>
  `,
  styles: `
    .camera-tile-image { width: 100%; border-radius: 4px; object-fit: cover; aspect-ratio: 16 / 9; }
    .camera-tile-image.stale { opacity: 0.5; filter: grayscale(40%); }
    /* Okvir vdelave dobi isto razmerje kot posnetek, da se ploščice v vrstici ne razidejo. */
    .camera-tile-embed { position: relative; aspect-ratio: 16 / 9; border-radius: 4px; overflow: hidden; background: var(--cd-surface-sunken, #000); }
    /* Prosojna plast: klik v mreži mora odpreti kamero (routerLink na ion-card), ne pristati
       v vdelani strani — okvir sam bi klik požrl. */
    .camera-tile-embed-catch { position: absolute; inset: 0; }
    .camera-tile-placeholder { display: flex; flex-direction: column; gap: 0.35rem; align-items: center; justify-content: center; aspect-ratio: 16 / 9; background: var(--ion-color-light, #eee); }
    .camera-tile-placeholder ion-icon { font-size: 2.5rem; opacity: 0.6; }
    .camera-tile-placeholder span { font-size: 0.75rem; opacity: 0.7; }
  `,
})
export class CameraTileComponent implements OnInit, OnDestroy {
  @Input({ required: true }) camera!: CameraTileInput;
  /** Iz `Settings.cameraDataSaverEnabled` (GET /settings) — grid stran jo prebere enkrat
   * in poda vsem ploščicam, da vsaka ne kliče /settings zase. */
  @Input() dataSaverEnabled = true;

  private readonly http = inject(HttpClient);
  private readonly refresh = inject(ForegroundRefreshService);
  private readonly network = inject(NetworkStatusService);

  readonly health = signal<CameraHealthResponse>({ state: 'unknown', ageSeconds: null });
  readonly snapshotUrl = signal<string | null>(null);
  private unregister?: () => void;

  hasSnapshot(): boolean {
    return HAS_SNAPSHOT.has(this.camera.type);
  }

  /** Vdelava v mreži velja SAMO za vrsto `iframe`: pri `snapshot+iframe` je v mreži posnetek
   * (cenejši in za pregled dovolj), pri `mjpeg`/`hls` pa bi mreža odprla toliko živih tokov,
   * kolikor je ploščic. Story 7: ob varčevanju s podatki na mobilnem omrežju vdelave ne
   * zaženemo — ostane nadomestek, ki to pove. */
  showEmbed(): boolean {
    if (this.camera.type !== 'iframe' || this.camera.previewUrl.length === 0) return false;
    return shouldAutoplayLiveStream(this.network.kind(), this.dataSaverEnabled);
  }

  placeholderHint(): string {
    return this.camera.type === 'iframe' && !this.showEmbed()
      ? 'Vdelava — odpri za prikaz (varčevanje s podatki)'
      : 'Vdelava — odpri za prikaz';
  }

  isDegraded(): boolean {
    const state = this.health().state;
    return state === 'stale' || state === 'unreachable';
  }

  ngOnInit(): void {
    this.unregister = this.refresh.register(() => this.poll());
  }

  ngOnDestroy(): void {
    this.unregister?.();
  }

  private async poll(): Promise<{ intervalMs: number }> {
    const baseIntervalMs = Math.max(this.camera.refreshIntervalSeconds, 5) * 1000;

    if (!this.hasSnapshot()) {
      // Brez /health smisla (research.md §3) — ni kaj osveževati, a registracija ostane
      // aktivna, da se komponenta obnaša dosledno, če se vrsta kamere kdaj spremeni.
      return { intervalMs: baseIntervalMs };
    }

    try {
      const health = await firstValueFrom(
        this.http.get<CameraHealthResponse>(apiUrl(`/cameras/${this.camera.id}/health`), { withCredentials: true }),
      );
      this.health.set(health);
      this.snapshotUrl.set(`${apiUrl(`/cameras/${this.camera.id}/snapshot`)}?t=${Date.now()}`);

      const degraded = health.state === 'unreachable';
      const withDegradation = degraded ? baseIntervalMs * DEGRADED_REFRESH_MULTIPLIER : baseIntervalMs;
      return { intervalMs: resolveRefreshIntervalMs(withDegradation, this.network.kind(), this.dataSaverEnabled) };
    } catch {
      // Napaka pri klicu samega API-ja (ne pri viru kamere) — pusti prejšnji prikaz,
      // poskusi znova čez minuto (enak vzorec kot WeatherTileComponent).
      return { intervalMs: 60_000 };
    }
  }
}

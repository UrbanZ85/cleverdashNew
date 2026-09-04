import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { DomSanitizer, type SafeResourceUrl } from '@angular/platform-browser';
import { firstValueFrom } from 'rxjs';
import {
  IonBadge,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonModal,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { apiUrl } from '../../../core/api/api-base.js';
import { SettingsStore } from '../../../core/settings/settings.store.js';
import { ForegroundRefreshService } from '../../../core/refresh/foreground-refresh.service.js';
import { AttributionComponent } from '../../../shared/attribution/attribution.component.js';
import { StalenessBadgeComponent } from '../../../shared/staleness/staleness-badge.component.js';
import { TileCardComponent } from '../../../shared/layout/tile-card.component.js';
import {
  COMMUTE_SWITCH_HOUR,
  clampMapHeightPx,
  commuteDirection,
  directionIcon,
  formatDelay,
  formatDistance,
  formatDuration,
  nextRefreshMs,
  orderedCommuteLegs,
  travelUnavailableMessage,
  type CommuteLayout,
  type CommuteLeg,
  type CommuteResponse,
} from '../commute.model.js';

// Ploščica "Pot": OBA zemljevida v enem okvirju, s časom poti in zamudo zaradi prometa;
// zgoraj tisti za trenutni čas dneva (dopoldne v službo, od poldneva domov). Meja in razlogi
// zanjo so v ../commute.model.ts.
//
// Vse, kar je odvisno od zunanjega vira, pride z ENE poti `GET /dashboard/commute`: čas poti
// (Google Routes API prek strežniškega predpomnilnika, člen VIII) IN naslov vdelanega
// zemljevida (Google navadne povezave v okvirju ne dovoli, zato ga sestavi strežnik —
// apps/api/src/domain/map-embed.ts). Odjemalec zunanjega vira ne kliče nikoli sam in ključa
// ne pozna (člen IV).
//
// Zemljevid je vdelava tuje strani, zato so tu iste odločitve kot pri vtičniku vrste
// `iframe` (plugin-tile.component.ts): naslov gre v `[src]` prek
// `bypassSecurityTrustResourceUrl` in nikoli kot HTML; `referrerpolicy` in `allow` sta v
// predlogi STATIČNA niza, ker Angular vezavo teh dveh na <iframe> zavrne z NG0910 in bi
// ploščica ostala prazna (kanonični vrednosti: core/embeds/embed-address.ts, ujemanje čuva
// tests/unit/embed-iframe-attributes.spec.ts); čez okvir je prosojna plast, ki klik prestreže
// in odpre povečan prikaz.
@Component({
  selector: 'app-commute-tile',
  standalone: true,
  imports: [
    TileCardComponent,
    AttributionComponent,
    StalenessBadgeComponent,
    RouterLink,
    IonBadge,
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
    <app-tile-card title="Pot" icon="car-outline" [subtitle]="subtitle()" [loading]="loading()">
      @if (legs().length > 0) {
        <div class="legs" [class.horizontal]="layout() === 'horizontal'">
        @for (leg of legs(); track leg.direction; let first = $first) {
          <div class="leg">
            <div class="leg-head">
              <ion-icon [name]="icon(leg)" aria-hidden="true"></ion-icon>
              <span class="leg-label">{{ leg.label }}</span>
              @if (first) {
                <ion-badge color="primary">Zdaj</ion-badge>
              }
              @if (leg.stale) {
                <app-staleness-badge [ageSeconds]="leg.ageSeconds ?? 0"></app-staleness-badge>
              }
            </div>

            @if (leg.travel; as travel) {
              <p class="travel">
                <span class="duration">{{ duration(travel.durationSeconds) }}</span>
                @if (delay(travel.delaySeconds); as text) {
                  <!-- Zamuda je edini razlog, da vir vrne tudi trajanje brez prometa —
                       "40 min" brez nje ne pove, ali je to običajno. -->
                  <span class="delay">{{ text }}</span>
                } @else {
                  <span class="no-delay">brez zamude</span>
                }
                <span class="distance">{{ distance(travel.distanceMeters) }}</span>
              </p>
            } @else if (leg.travelUnavailable; as reason) {
              <p class="cd-muted travel-missing">{{ message(reason) }}</p>
            }

            @if (leg.mapEmbedUrl; as url) {
              <div class="map-wrap" [style.height.px]="mapHeight()">
                <iframe
                  class="map"
                  [src]="safe(url)"
                  [title]="'Zemljevid — ' + leg.label"
                  loading="lazy"
                  referrerpolicy="strict-origin-when-cross-origin"
                  allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
                  sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-presentation"
                ></iframe>
                <button class="map-catch" type="button" (click)="enlarged.set(leg)" aria-label="Odpri povečano">
                  <span class="map-hint">Klikni za povečan prikaz</span>
                </button>
              </div>
            }
          </div>
        }
        </div>
      } @else {
        <p class="cd-muted hint">
          Nastavi kraja “doma” in “služba” — do {{ switchHour }}:00 je zgoraj pot v službo,
          pozneje pot domov.
        </p>
      }

      @if (!configured()) {
        <ion-button expand="block" fill="outline" size="small" routerLink="/settings">
          <ion-icon slot="start" name="settings-outline" aria-hidden="true"></ion-icon>
          Nastavi kraja
        </ion-button>
      }

      <div slot="footer">
        @if (attribution(); as source) {
          <!-- Googlovi pogoji uporabe zahtevajo navedbo vira za podatke o poti; besedilo pride
               iz odgovora strežnika, ker vir pozna ta, ne predloga. -->
          <app-attribution [text]="source.text" [url]="source.url"></app-attribution>
        }
      </div>
    </app-tile-card>

    <!-- Povečan prikaz: v ploščici je zemljevid pregled, tukaj je uporaben. Okvir je
         namenoma ozek (2 vh/vw), da je klik ob rob pot ven — enako kot pri vtičniku. -->
    <ion-modal class="commute-modal" [isOpen]="enlarged() !== null" (didDismiss)="enlarged.set(null)">
      <ng-template>
        @if (enlarged(); as leg) {
          <ion-header>
            <ion-toolbar>
              <ion-title>{{ leg.label }} — {{ leg.from }} → {{ leg.to }}</ion-title>
              <ion-buttons slot="end">
                @if (leg.mapEmbedUrl; as url) {
                  <ion-button [href]="url" target="_blank" rel="noopener noreferrer" title="Odpri v novem zavihku">
                    <ion-icon slot="icon-only" name="open-outline"></ion-icon>
                  </ion-button>
                }
                <ion-button (click)="enlarged.set(null)" aria-label="Zapri">
                  <ion-icon slot="icon-only" name="close-outline"></ion-icon>
                </ion-button>
              </ion-buttons>
            </ion-toolbar>
          </ion-header>
          <ion-content>
            @if (leg.mapEmbedUrl; as url) {
              <iframe
                class="modal-map"
                [src]="safe(url)"
                [title]="'Zemljevid — ' + leg.label"
                referrerpolicy="strict-origin-when-cross-origin"
                allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
                sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-presentation"
              ></iframe>
            }
          </ion-content>
        }
      </ng-template>
    </ion-modal>
  `,
  styles: `
    .hint {
      margin: 0 0 var(--cd-space-3);
      font-size: var(--cd-font-size-sm);
      line-height: 1.5;
    }
    /* Postavitev je uporabnikova izbira (nastavitve): drug pod drugim ali drug ob drugem.
       Pri vodoravni je ploščica dvakrat širša (commuteTileWidthPx), zato je vsak zemljevid
       še vedno približno enako velik kot pri navpični. */
    .legs {
      display: flex;
      flex-direction: column;
      gap: var(--cd-space-4);
    }
    .legs.horizontal {
      flex-direction: row;
      align-items: flex-start;
    }
    .legs.horizontal > .leg {
      flex: 1 1 0;
      min-width: 0;
    }
    .leg-head {
      display: flex;
      align-items: center;
      gap: var(--cd-space-2);
      flex-wrap: wrap;
    }
    .leg-head ion-icon {
      font-size: 1rem;
      color: var(--ion-color-primary);
    }
    .leg-label {
      font-size: var(--cd-font-size-sm);
      font-weight: 600;
    }
    .travel {
      display: flex;
      align-items: baseline;
      gap: var(--cd-space-2);
      flex-wrap: wrap;
      margin: var(--cd-space-1) 0 var(--cd-space-2);
    }
    .duration {
      font-size: var(--cd-font-size-lg);
      font-weight: 650;
      line-height: 1.2;
    }
    /* Zamuda je edini podatek na ploščici, ki zahteva odločitev ("grem zdaj ali pozneje?"),
       zato je barvana; brez zamude ostane mirna siva. */
    .delay {
      font-size: var(--cd-font-size-sm);
      font-weight: 600;
      color: var(--ion-color-warning);
    }
    .no-delay,
    .distance {
      font-size: var(--cd-font-size-sm);
      color: var(--cd-text-muted);
    }
    .travel-missing {
      margin: var(--cd-space-1) 0 var(--cd-space-2);
      font-size: var(--cd-font-size-sm);
      line-height: 1.5;
    }
    /* Oba zemljevida sta enako visoka: vrstni red in značka "Zdaj" povesta, kateri velja,
       različna višina pa bi ob poldnevu prestavila celo postavitev nadzorne plošče. Višino
       nastavi uporabnik (vezava style.height.px v predlogi, privzeto 170) — spodnja vrednost
       je samo zasilna, če vezave kdaj ne bi bilo. */
    .map-wrap {
      position: relative;
      width: 100%;
      height: 170px;
      border-radius: var(--cd-radius-sm);
      overflow: hidden;
      background: var(--cd-surface-sunken);
    }
    .map {
      display: block;
      width: 100%;
      height: 100%;
      border: 0;
    }
    /* Prosojna plast čez okvir: klik odpre povečan prikaz namesto da bi pristal v tujem
       zemljevidu, ki je v ploščici te velikosti neuporaben. */
    .map-catch {
      position: absolute;
      inset: 0;
      border: 0;
      padding: 0;
      cursor: zoom-in;
      background: transparent;
      display: flex;
      align-items: flex-end;
      justify-content: center;
    }
    .map-catch:hover,
    .map-catch:focus-visible {
      background: rgba(var(--ion-color-primary-rgb), 0.08);
    }
    .map-hint {
      opacity: 0;
      transform: translateY(6px);
      transition: opacity 120ms ease, transform 120ms ease;
      margin-bottom: var(--cd-space-2);
      padding: 4px 10px;
      border-radius: 999px;
      font-size: var(--cd-font-size-xs);
      color: var(--ion-color-primary-contrast);
      background: var(--ion-color-primary);
    }
    .map-catch:hover .map-hint,
    .map-catch:focus-visible .map-hint {
      opacity: 1;
      transform: none;
    }

    .commute-modal {
      --width: 96vw;
      --height: 96vh;
      --max-width: 1600px;
      --border-radius: var(--cd-radius-lg);
    }
    .modal-map {
      display: block;
      width: 100%;
      height: 100%;
      border: 0;
    }
  `,
})
export class CommuteTileComponent implements OnInit, OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly refresh = inject(ForegroundRefreshService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly settings = inject(SettingsStore);

  protected readonly switchHour = COMMUTE_SWITCH_HOUR;

  /** Odgovor strežnika in čas, ob katerem je bil vrstni red izbran. Ločena signala: vrstni
   * red se sme spremeniti ob poldnevu tudi brez novega odgovora. */
  private readonly response = signal<CommuteResponse | null>(null);
  private readonly now = signal(new Date());

  /** Vrtavka teče do PRVEGA poskusa, ne do uspeha — sicer bi ob nedosegljivem strežniku
   * vrtela v neskončnost namesto pokazala, kaj je narobe (člen VII). */
  private readonly attempted = signal(false);

  readonly loading = computed(() => !this.attempted());
  readonly configured = computed(() => this.response()?.configured ?? true);

  /** Videz ploščice je uporabnikova nastavitev (Nastavitve → Nadzorna plošča → Pot). Širino
   * ploščice iz iste izbire izpelje register (commuteTileWidthPx), višino pa ta vezava. */
  readonly mapHeight = computed(() => clampMapHeightPx(this.settings.commute().mapHeightPx));
  readonly layout = computed<CommuteLayout>(() => this.settings.commute().layout);
  readonly legs = computed(() => orderedCommuteLegs(this.response()?.legs ?? [], this.now()));
  readonly enlarged = signal<CommuteLeg | null>(null);

  readonly attribution = computed(() => {
    // Navedba se pokaže samo, kadar je bil vir zares uporabljen — brez podatka o poti ni
    // ničesar, kar bi bilo treba pripisati.
    const res = this.response();
    return res?.legs.some((leg) => leg.travel !== null) ? res.source.attribution : null;
  });

  readonly subtitle = computed(() =>
    commuteDirection(this.now()) === 'to-work' ? 'Dopoldne — najprej v službo' : 'Popoldne — najprej domov',
  );

  private unregister?: () => void;

  /** Naslov je sestavil strežnik (samo oblika, ki jo ponudnik v okvirju dovoli), okvir pa je
   * poleg tega v peskovniku. */
  safe(url: string): SafeResourceUrl {
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }

  icon(leg: CommuteLeg): string {
    return directionIcon(leg.direction);
  }

  duration(seconds: number): string {
    return formatDuration(seconds);
  }

  delay(seconds: number): string | null {
    return formatDelay(seconds);
  }

  distance(meters: number): string {
    return formatDistance(meters);
  }

  message(reason: NonNullable<CommuteLeg['travelUnavailable']>): string {
    return travelUnavailableMessage(reason);
  }

  ngOnInit(): void {
    this.unregister = this.refresh.register(() => this.load());
  }

  ngOnDestroy(): void {
    this.unregister?.();
  }

  /** Naslednja osvežitev je prej od menjave smeri in izteka strežniškega predpomnilnika. */
  async load(): Promise<{ intervalMs: number }> {
    const now = new Date();
    try {
      const data = await firstValueFrom(
        this.http.get<CommuteResponse>(apiUrl('/dashboard/commute'), { withCredentials: true }),
      );
      this.response.set(data);
      this.now.set(now);
      return { intervalMs: nextRefreshMs(data.source.nextPollSeconds, now) };
    } catch {
      // Prejšnji prikaz ostane nedotaknjen (FR-026) — poskusi znova čez minuto.
      this.now.set(now);
      return { intervalMs: 60_000 };
    } finally {
      this.attempted.set(true);
    }
  }
}

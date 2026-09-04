import { Component, OnDestroy, OnInit, computed, inject, input, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DomSanitizer, type SafeResourceUrl } from '@angular/platform-browser';
import { firstValueFrom } from 'rxjs';
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
import { ForegroundRefreshService } from '../../../core/refresh/foreground-refresh.service.js';
import { PluginStore } from '../../../core/plugins/plugin.store.js';
import { canOpenEnlarged, fetchesThroughServer } from '../../../core/plugins/plugin.model.js';
import { StalenessBadgeComponent } from '../../../shared/staleness/staleness-badge.component.js';
import { NoDataComponent } from '../../../shared/staleness/no-data.component.js';
import { TileCardComponent } from '../../../shared/layout/tile-card.component.js';

interface PluginDataResponse {
  fields: Array<{ label: string; value: string | null }>;
  source: { fetchedAt: string; ageSeconds: number; stale: boolean; nextPollSeconds: number };
}

// 005: ena komponenta za vse štiri vrste vtičnika. Ločene komponente na vrsto bi pomenile
// štiri vnose v TILE_REGISTRY in štiri poti skozi dashboard.page — vrsta je podatek
// definicije, ne nova vrsta ploščice.
//
// `link` in `iframe` naslov odpre BRSKALNIK (uporabnik gre na tujo stran oziroma jo vidi
// vdelano), zato zanju ni prenosa prek strežnika. `image` in `json` pa prenese strežnik,
// ker člen VIII prepoveduje, da bi odjemalec sam klical zunanji vir.
//
// Povečan prikaz: ploščica v mreži je PREGLED, modalno okno je mesto, kjer se z vsebino
// dela. Zato je pri vdelani strani čez okvir v pregledu prosojna plast, ki klik prestreže
// in odpre modal — brez nje bi klik pristal v tuji strani in ploščice ne bi bilo mogoče
// odpreti drugače kot z gumbom. V modalu te plasti ni in je stran polno uporabna.
@Component({
  selector: 'app-plugin-tile',
  standalone: true,
  imports: [
    TileCardComponent,
    StalenessBadgeComponent,
    NoDataComponent,
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
    @if (plugin(); as p) {
      <app-tile-card [title]="p.name" [icon]="p.icon" [subtitle]="host()" [loading]="loading()">
        @if (expandable()) {
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
        }

        @switch (p.kind) {
          @case ('link') {
            @if (p.description) {
              <p class="cd-muted description">{{ p.description }}</p>
            }
            <ion-button
              expand="block"
              fill="outline"
              [href]="p.url"
              [target]="p.openInNewTab ? '_blank' : '_self'"
              rel="noopener noreferrer"
            >
              <ion-icon slot="end" name="open-outline" aria-hidden="true"></ion-icon>
              Odpri
            </ion-button>
          }

          @case ('iframe') {
            <div class="embed-wrap" [style.height.px]="p.heightPx">
              <iframe
                class="embed"
                [src]="safeUrl()"
                [title]="p.name"
                loading="lazy"
                referrerpolicy="strict-origin-when-cross-origin"
                allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
                sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-presentation"
              ></iframe>
              <button class="embed-catch" type="button" (click)="open()" aria-label="Odpri povečano">
                <span class="embed-hint">Klikni za povečan prikaz</span>
              </button>
            </div>
          }

          @case ('image') {
            @if (imageUrl(); as url) {
              <button class="image-button" type="button" (click)="open()" aria-label="Odpri povečano">
                <img class="image" [src]="url" [alt]="p.alt ?? p.name" />
              </button>
            } @else if (failed()) {
              <app-no-data (retry)="load()"></app-no-data>
            } @else {
              <div class="image-skeleton cd-skeleton" aria-hidden="true"></div>
            }
          }

          @case ('json') {
            @if (data(); as d) {
              <dl class="fields">
                @for (field of d.fields; track field.label) {
                  <div class="field">
                    <dt>{{ field.label }}</dt>
                    <dd [class.missing]="field.value === null">
                      {{ field.value ?? 'polja ni v odgovoru' }}
                    </dd>
                  </div>
                }
              </dl>
            } @else if (failed()) {
              <app-no-data (retry)="load()"></app-no-data>
            } @else {
              <div class="fields-skeleton cd-skeleton" aria-hidden="true"></div>
            }
          }
        }

        <div slot="footer">
          @if (stale()) {
            <app-staleness-badge [ageSeconds]="ageSeconds()"></app-staleness-badge>
          }
          <span class="cd-muted source">{{ host() }}</span>
        </div>
      </app-tile-card>

      <!-- Skoraj celozaslonsko. Okvir je namenoma ozek (2 vh/vw), da je vidno, da gre za
           okno nad nadzorno ploščo, in da je klik ob rob še vedno pot ven. -->
      <ion-modal
        class="plugin-modal"
        [isOpen]="modalOpen()"
        (didDismiss)="modalOpen.set(false)"
      >
        <ng-template>
          <ion-header>
            <ion-toolbar>
              <ion-title>
                <span class="modal-title">{{ p.name }}</span>
                @if (host(); as h) {
                  <span class="modal-subtitle">{{ h }}</span>
                }
              </ion-title>
              <ion-buttons slot="end">
                <ion-button [href]="p.url" target="_blank" rel="noopener noreferrer" title="Odpri v novem zavihku">
                  <ion-icon slot="icon-only" name="open-outline"></ion-icon>
                </ion-button>
                <ion-button (click)="modalOpen.set(false)" aria-label="Zapri">
                  <ion-icon slot="icon-only" name="close-outline"></ion-icon>
                </ion-button>
              </ion-buttons>
            </ion-toolbar>
          </ion-header>
          <ion-content>
            @switch (p.kind) {
              @case ('iframe') {
                <iframe
                  class="modal-embed"
                  [src]="safeUrl()"
                  [title]="p.name"
                  referrerpolicy="strict-origin-when-cross-origin"
                  allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
                  sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-presentation"
                ></iframe>
              }
              @case ('image') {
                @if (imageUrl(); as url) {
                  <div class="modal-image-wrap">
                    <img class="modal-image" [src]="url" [alt]="p.alt ?? p.name" />
                  </div>
                }
              }
              @case ('json') {
                <div class="modal-fields-wrap">
                  @if (data(); as d) {
                    <dl class="fields modal-fields">
                      @for (field of d.fields; track field.label) {
                        <div class="field">
                          <dt>{{ field.label }}</dt>
                          <dd [class.missing]="field.value === null">
                            {{ field.value ?? 'polja ni v odgovoru' }}
                          </dd>
                        </div>
                      }
                    </dl>
                  }
                </div>
              }
            }
          </ion-content>
        </ng-template>
      </ion-modal>
    }
  `,
  styles: `
    .description {
      margin: 0 0 var(--cd-space-3);
      font-size: var(--cd-font-size-sm);
      line-height: 1.5;
    }

    .embed-wrap {
      position: relative;
      width: 100%;
      border-radius: var(--cd-radius-sm);
      overflow: hidden;
      background: var(--cd-surface-sunken);
    }
    .embed {
      display: block;
      width: 100%;
      height: 100%;
      border: 0;
    }
    /* Prosojna plast čez okvir: v pregledu prestreže klik, da ta odpre modal namesto da
       bi pristal v tuji strani. */
    .embed-catch {
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
    .embed-catch:hover,
    .embed-catch:focus-visible {
      background: rgba(var(--ion-color-primary-rgb), 0.08);
    }
    .embed-hint {
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
    .embed-catch:hover .embed-hint,
    .embed-catch:focus-visible .embed-hint {
      opacity: 1;
      transform: none;
    }

    .image-button {
      display: block;
      width: 100%;
      padding: 0;
      border: 0;
      background: none;
      cursor: zoom-in;
    }
    .image {
      display: block;
      width: 100%;
      height: auto;
      border-radius: var(--cd-radius-sm);
      background: var(--cd-surface-sunken);
    }
    .image-skeleton {
      width: 100%;
      aspect-ratio: 4 / 3;
    }
    .fields-skeleton {
      width: 100%;
      height: 96px;
    }
    .fields {
      margin: 0;
      display: grid;
      gap: var(--cd-space-2);
    }
    .field {
      display: flex;
      justify-content: space-between;
      gap: var(--cd-space-3);
      font-size: var(--cd-font-size-sm);
    }
    .field dt {
      color: var(--cd-text-muted);
    }
    .field dd {
      margin: 0;
      font-weight: 600;
      text-align: right;
    }
    /* Manjkajoče polje ni ista stvar kot prazna vrednost — uporabnik mora videti, da je
       pot narobe vpisana, sicer išče napako pri viru. */
    .field dd.missing {
      font-weight: 400;
      font-style: italic;
      color: var(--ion-color-warning);
    }
    .source {
      font-size: var(--cd-font-size-xs);
    }

    /* ─── Povečan prikaz ─── */
    .plugin-modal {
      --width: 96vw;
      --height: 96vh;
      --max-width: 1600px;
      --border-radius: var(--cd-radius-lg);
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
    .modal-embed {
      display: block;
      width: 100%;
      height: 100%;
      border: 0;
    }
    .modal-image-wrap {
      display: grid;
      place-items: center;
      min-height: 100%;
      padding: var(--cd-space-4);
    }
    .modal-image {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
    }
    .modal-fields-wrap {
      padding: var(--cd-space-5);
      max-width: 720px;
      margin: 0 auto;
    }
    .modal-fields .field {
      font-size: var(--cd-font-size-md);
      padding: var(--cd-space-3) 0;
      border-bottom: 1px solid var(--cd-divider);
    }
  `,
})
export class PluginTileComponent implements OnInit, OnDestroy {
  // `referrerpolicy` in `allow` sta v predlogi zapisana STATIČNO in ne kot vezava: Angular
  // vezavo teh dveh atributov na <iframe> zavrne z NG0910, napaka pade v `app-tile-host` in
  // cela ploščica ostane prazna. Kanonični vrednosti in razlog zanju sta v
  // core/embeds/embed-address.ts, ujemanje čuva tests/unit/embed-iframe-attributes.spec.ts.

  private readonly http = inject(HttpClient);
  private readonly refresh = inject(ForegroundRefreshService);
  private readonly store = inject(PluginStore);
  private readonly sanitizer = inject(DomSanitizer);

  /** ID iz `Settings.tiles[].config.pluginId`; dashboard.page ga poda prek ngComponentOutletInputs. */
  readonly pluginId = input.required<string>();

  readonly plugin = computed(() => this.store.byId().get(this.pluginId()) ?? null);
  readonly data = signal<PluginDataResponse | null>(null);
  readonly imageUrl = signal<string | null>(null);
  readonly failed = signal(false);
  readonly loading = signal(false);
  readonly stale = signal(false);
  readonly ageSeconds = signal(0);
  readonly modalOpen = signal(false);

  /** Povezava se ne odpira povečano — klik nanjo odpre naslov sam. */
  readonly expandable = computed(() => {
    const p = this.plugin();
    return p ? canOpenEnlarged(p.kind) : false;
  });

  private unregister?: () => void;
  private previousObjectUrl: string | null = null;

  /** Gostitelj vira namesto celega naslova — v glavi ploščice je prostora za nekaj znakov. */
  readonly host = computed(() => {
    const url = this.plugin()?.url;
    if (!url) return null;
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return null;
    }
  });

  /** Angular zavrne tuj naslov v `[src]` iframe-a, dokler ga izrecno ne označimo kot
   * zaupanja vrednega. Naslov je preveril strežnik ob shranjevanju (samo https, brez
   * zasebnih omrežij), okvir pa je poleg tega v peskovniku (`sandbox`). */
  readonly safeUrl = computed<SafeResourceUrl | null>(() => {
    const p = this.plugin();
    if (!p || p.kind !== 'iframe') return null;
    return this.sanitizer.bypassSecurityTrustResourceUrl(p.url);
  });

  open(): void {
    if (this.expandable()) this.modalOpen.set(true);
  }

  async ngOnInit(): Promise<void> {
    await this.store.ensureLoaded();
    const p = this.plugin();
    if (p && fetchesThroughServer(p.kind)) {
      this.unregister = this.refresh.register(() => this.load());
    }
  }

  ngOnDestroy(): void {
    this.unregister?.();
    if (this.previousObjectUrl) URL.revokeObjectURL(this.previousObjectUrl);
  }

  async load(): Promise<{ intervalMs: number }> {
    const p = this.plugin();
    if (!p) return { intervalMs: 60_000 };

    this.loading.set(true);
    try {
      return p.kind === 'image' ? await this.loadImage(p.id) : await this.loadJson(p.id);
    } catch {
      // Prejšnji prikaz ostane nedotaknjen; "ni podatka" pokažemo samo, če ga še nikoli ni bilo.
      if (!this.data() && !this.imageUrl()) this.failed.set(true);
      return { intervalMs: 60_000 };
    } finally {
      this.loading.set(false);
    }
  }

  private async loadJson(id: string): Promise<{ intervalMs: number }> {
    const res = await firstValueFrom(
      this.http.get<PluginDataResponse>(this.store.dataUrl(id), { withCredentials: true }),
    );
    this.data.set(res);
    this.failed.set(false);
    this.stale.set(res.source.stale);
    this.ageSeconds.set(res.source.ageSeconds);
    return { intervalMs: res.source.nextPollSeconds * 1000 };
  }

  private async loadImage(id: string): Promise<{ intervalMs: number }> {
    // Enak prijem kot pri radarski ploščici: pot zahteva Authorization glavo, zato navaden
    // <img src> ne deluje — sliko prenesemo in prikažemo kot object URL.
    const res = await firstValueFrom(
      this.http.get(this.store.dataUrl(id), {
        withCredentials: true,
        responseType: 'blob',
        observe: 'response',
      }),
    );
    const nextPollSeconds = Number(res.headers.get('X-Source-Next-Poll-Seconds') ?? '300');
    this.stale.set(res.headers.get('X-Source-Stale') === 'true');
    const fetchedAt = res.headers.get('X-Source-Fetched-At');
    this.ageSeconds.set(fetchedAt ? Math.round((Date.now() - new Date(fetchedAt).getTime()) / 1000) : 0);

    if (this.previousObjectUrl) URL.revokeObjectURL(this.previousObjectUrl);
    const objectUrl = URL.createObjectURL(res.body!);
    this.previousObjectUrl = objectUrl;
    this.imageUrl.set(objectUrl);
    this.failed.set(false);
    return { intervalMs: nextPollSeconds * 1000 };
  }
}

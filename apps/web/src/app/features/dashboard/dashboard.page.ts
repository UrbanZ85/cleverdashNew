import { Component, OnInit, inject, signal, type Type } from '@angular/core';
import { NgComponentOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { IonContent, IonButton, IonIcon, IonRefresher, IonRefresherContent } from '@ionic/angular/standalone';
import { SettingsStore, type TileEntry } from '../../core/settings/settings.store.js';
import { PluginStore } from '../../core/plugins/plugin.store.js';
import { DEFAULT_TILE_WIDTH_PX } from '../../core/plugins/plugin.model.js';
import { PageHeaderComponent } from '../../shared/layout/page-header.component.js';
import { TileHostComponent } from './tile-host.component.js';
import {
  PLUGIN_TILE_TYPE,
  getTileComponent,
  getTileWidthPx,
  withMissingBuiltIns,
} from '../../shared/tiles/tile-registry.js';

interface RenderedTile {
  /** Edinstven znotraj mreže — za vtičnik je to `plugin:<id>`, sicer vrsta. Vrsta sama ne
   * zadošča, ker je vtičnikov lahko več in bi si `track` podvojil. */
  key: string;
  component: Type<unknown>;
  /** Vhodi za `ngComponentOutletInputs`; vgrajene ploščice jih nimajo. */
  inputs?: Record<string, unknown>;
  /** Želena širina ploščice v slikovnih točkah, ali `null` za vgrajene ploščice, ki širine
   * nimajo nastavljive in zapolnijo, kar v vrstici ostane. */
  widthPx: number | null;
}

// Z6 v spec.md (P6): dashboard je mreža ploščic, sestavljena iz `TILE_REGISTRY` (T110) in
// razporeditve, shranjene v Settings.tiles (FR-028). Ta stran NE pozna imen posameznih
// vrst ploščic — dodajanje nove je dodajanje enega vnosa v register, brez spremembe tukaj.
// Vsaka ploščica je ovita v `<app-tile-host>` (US4, T099), da izpad ene ne podre druge.
//
// Postavitev je ovita vrstica (`flex-wrap`), ne `ion-grid` s trdim `size-md="6"` in ne
// mreža s stolpci: širina vtičnika je uporabnikova nastavitev v SLIKOVNIH TOČKAH
// (`DashboardPlugin.widthPx`), stolpčna mreža pa bi jo lahko izrazila samo v mrežnih
// stolpcih. Ploščice se v vrstico zložijo, kolikor jih gre, in se prelomijo naprej;
// vgrajene ploščice (brez nastavljive širine) požrejo prostor, ki v vrstici ostane.
@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  imports: [
    IonContent,
    IonButton,
    IonIcon,
    IonRefresher,
    IonRefresherContent,
    RouterLink,
    PageHeaderComponent,
    TileHostComponent,
    NgComponentOutlet,
  ],
  template: `
    <app-page-header title="Nadzorna plošča">
      <ion-button slot="end" fill="clear" routerLink="/settings" aria-label="Nastavitve ploščic">
        <ion-icon slot="icon-only" name="apps-outline"></ion-icon>
      </ion-button>
    </app-page-header>

    <ion-content>
      <ion-refresher slot="fixed" (ionRefresh)="reload($event)">
        <ion-refresher-content></ion-refresher-content>
      </ion-refresher>

      <div class="dash">
        @if (loading()) {
          <!-- Skeleton ima obliko mreže, da postavitev po prihodu podatkov ne poskoči. -->
          <div class="grid" aria-hidden="true">
            @for (i of skeletonSlots; track i) {
              <div class="tile-skeleton cd-skeleton"></div>
            }
          </div>
        } @else if (tiles().length === 0) {
          <div class="empty">
            <ion-icon name="apps-outline" class="empty-icon" aria-hidden="true"></ion-icon>
            <h2>Nadzorna plošča je prazna</h2>
            <p class="cd-muted">
              Vse ploščice so skrite. V nastavitvah izberi, katere naj se prikažejo, ali dodaj
              svoj vtičnik.
            </p>
            <ion-button routerLink="/settings" fill="solid">Odpri nastavitve</ion-button>
          </div>
        } @else {
          <div class="grid">
            @for (tile of tiles(); track tile.key) {
              <app-tile-host [class.fixed-width]="tile.widthPx !== null" [style.width.px]="tile.widthPx">
                <ng-container
                  *ngComponentOutlet="tile.component; inputs: tile.inputs"
                ></ng-container>
              </app-tile-host>
            }
          </div>
        }
      </div>
    </ion-content>
  `,
  styles: `
    ion-content {
      --background: var(--ion-background-color);
    }
    .dash {
      padding: var(--cd-space-4);
      max-width: 1600px;
      margin: 0 auto;
    }
    .grid {
      display: flex;
      flex-wrap: wrap;
      gap: var(--cd-space-4);
      align-items: stretch;
    }
    /* Vgrajena ploščica nima nastavljive širine: začne pri --cd-tile-min-width in razpotegne
       prostor, ki v vrstici ostane — tako desni rob zaslona ne ostane prazen. */
    .grid > app-tile-host {
      flex: 1 1 var(--cd-tile-min-width);
      min-width: 0;
    }
    /* Vtičnik je natanko tako širok, kot je uporabnik napisal — širino v slikovnih točkah
       nastavi predloga (style.width.px). Ne raste; skrči se samo, kadar je okno ožje od te
       vrednosti, sicer bi štrlel čez rob. Zato je shranjena vrednost zgornja meja, ne
       zagotovilo. */
    .grid > app-tile-host.fixed-width {
      flex: 0 1 auto;
      max-width: 100%;
    }
    /* Okostje pred prihodom podatkov ima isto osnovno širino kot vgrajena ploščica, sicer
       bi se ob prihodu ploščic postavitev premaknila. */
    .tile-skeleton {
      flex: 1 1 var(--cd-tile-min-width);
      height: 220px;
      border-radius: var(--cd-radius-lg);
    }
    .empty {
      max-width: 420px;
      margin: 12vh auto 0;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--cd-space-3);
    }
    .empty-icon {
      font-size: 2.5rem;
      color: var(--cd-text-muted);
    }
    .empty h2 {
      margin: 0;
      font-size: var(--cd-font-size-lg);
      font-weight: 650;
    }
    .empty p {
      margin: 0;
      font-size: var(--cd-font-size-sm);
      line-height: 1.5;
    }
  `,
})
export class DashboardPage implements OnInit {
  private readonly settingsStore = inject(SettingsStore);
  private readonly pluginStore = inject(PluginStore);

  // Preden se nastavitve naložijo, prikaži privzeto razporeditev — ne prazen zaslon.
  readonly tiles = signal<RenderedTile[]>(this.resolveTiles(withMissingBuiltIns([])));
  readonly loading = signal(true);
  protected readonly skeletonSlots = [0, 1, 2];

  async ngOnInit(): Promise<void> {
    await this.loadLayout();
  }

  /** Potegni za osvežitev. Ploščice se osvežujejo same (ForegroundRefreshService); tukaj
   * se ponovno prebere samo RAZPOREDITEV, da se sprememba v nastavitvah pozna brez
   * ponovnega nalaganja strani. */
  async reload(event: CustomEvent): Promise<void> {
    await Promise.all([this.settingsStore.reload(), this.pluginStore.reload()]);
    await this.loadLayout();
    (event.target as HTMLIonRefresherElement | null)?.complete();
  }

  private async loadLayout(): Promise<void> {
    // Obe shrambi ob napaki obdržita privzetke in ne vržeta — dashboard ostane uporaben
    // tudi, če nastavitve ali vtičniki niso dosegljivi (FR-026 duh). Vzporedno, ker sta
    // neodvisni zahtevi.
    await Promise.all([this.settingsStore.ensureLoaded(), this.pluginStore.ensureLoaded()]);
    // `withMissingBuiltIns` doda vgrajene vrste, ki jih shranjena razporeditev še ne pozna
    // (FR-020) — brez tega bi se nova ploščica pojavila šele po shranitvi razporeditve v
    // nastavitvah, čeprav uporabnik tam ni imel česa spremeniti.
    this.tiles.set(this.resolveTiles(withMissingBuiltIns(this.settingsStore.tiles())));
    this.loading.set(false);
  }

  private resolveTiles(layout: TileEntry[]): RenderedTile[] {
    const known = this.pluginStore.byId();
    const resolved: RenderedTile[] = [];

    for (const entry of [...layout].filter((t) => t.visible).sort((a, b) => a.position - b.position)) {
      const component = getTileComponent(entry.type);
      if (!component) {
        console.warn(`Neznana vrsta ploščice v nastavitvah: "${entry.type}" — preskočena (FR-020).`);
        continue;
      }

      if (entry.type === PLUGIN_TILE_TYPE) {
        const pluginId = entry.config?.['pluginId'];
        // Vnos, ki kaže na izbrisan (ali tuj) vtičnik, se preskoči — enako kot neznana
        // vrsta. Brisanje vtičnika zato ne zahteva pospravljanja razporeditve, in prav
        // zato je `plugins.router.ts` ob DELETE ne popravlja.
        if (typeof pluginId !== 'string' || !known.has(pluginId)) continue;
        resolved.push({
          key: `plugin:${pluginId}`,
          component,
          inputs: { pluginId },
          widthPx: known.get(pluginId)?.widthPx ?? DEFAULT_TILE_WIDTH_PX,
        });
        continue;
      }

      // Vgrajena ploščica širine običajno NIMA (zapolni prostor v vrstici); tista, ki jo
      // razpotegnjena postavitev pokvari, jo napove v registru — po potrebi tudi glede na
      // uporabnikove nastavitve (TileTypeDefinition.widthFromSettings). Ta stran pri tem še
      // vedno ne pozna imen posameznih vrst ploščic.
      resolved.push({
        key: entry.type,
        component,
        widthPx: getTileWidthPx(entry.type, this.settingsStore.settings()),
      });
    }

    return resolved;
  }
}

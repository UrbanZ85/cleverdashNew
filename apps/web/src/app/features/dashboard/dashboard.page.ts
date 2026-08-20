import { Component, OnInit, inject, signal, type Type } from '@angular/core';
import { NgComponentOutlet } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { IonHeader, IonToolbar, IonTitle, IonContent, IonGrid, IonRow, IonCol } from '@ionic/angular/standalone';
import { apiUrl } from '../../core/api/api-base.js';
import { TileHostComponent } from './tile-host.component.js';
import { defaultTileLayout, getTileComponent } from '../../shared/tiles/tile-registry.js';

interface SettingsResponse {
  tiles: Array<{ type: string; position: number; visible: boolean }>;
}

interface RenderedTile {
  type: string;
  component: Type<unknown>;
}

// Z6 v spec.md (P6): dashboard je mreža ploščic, sestavljena iz `TILE_REGISTRY` (T110) in
// razporeditve, shranjene v Settings.tiles (FR-028). Ta stran NE pozna imen posameznih
// vrst ploščic — dodajanje nove je dodajanje enega vnosa v register, brez spremembe tukaj.
// Vsaka ploščica je ovita v `<app-tile-host>` (US4, T099), da izpad ene ne podre druge.
@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  imports: [IonHeader, IonToolbar, IonTitle, IonContent, IonGrid, IonRow, IonCol, TileHostComponent, NgComponentOutlet],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>CleverDash</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <ion-grid>
        <ion-row>
          @for (tile of tiles(); track tile.type) {
            <ion-col size="12" size-md="6">
              <app-tile-host>
                <ng-container *ngComponentOutlet="tile.component"></ng-container>
              </app-tile-host>
            </ion-col>
          }
        </ion-row>
      </ion-grid>
    </ion-content>
  `,
})
export class DashboardPage implements OnInit {
  private readonly http = inject(HttpClient);

  // Preden se nastavitve naložijo, prikaži privzeto razporeditev — ne prazen zaslon.
  readonly tiles = signal<RenderedTile[]>(this.resolveTiles(defaultTileLayout()));

  async ngOnInit(): Promise<void> {
    try {
      const settings = await firstValueFrom(
        this.http.get<SettingsResponse>(apiUrl('/settings'), { withCredentials: true }),
      );
      const layout = settings.tiles.length > 0 ? settings.tiles : defaultTileLayout();
      this.tiles.set(this.resolveTiles(layout));
    } catch {
      // Nastavitve niso na voljo (npr. prehodna napaka) — obdrži privzeto razporeditev,
      // ki je bila nastavljena ob inicializaciji signala. Dashboard ostane uporaben.
    }
  }

  private resolveTiles(layout: Array<{ type: string; position: number; visible: boolean }>): RenderedTile[] {
    const resolved: RenderedTile[] = [];
    for (const entry of [...layout].filter((t) => t.visible).sort((a, b) => a.position - b.position)) {
      const component = getTileComponent(entry.type);
      if (component) {
        resolved.push({ type: entry.type, component });
      } else {
        console.warn(`Neznana vrsta ploščice v nastavitvah: "${entry.type}" — preskočena (FR-020).`);
      }
    }
    return resolved;
  }
}

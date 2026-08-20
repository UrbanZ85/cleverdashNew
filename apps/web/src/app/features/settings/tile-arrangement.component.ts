import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { IonList, IonItem, IonLabel, IonToggle, IonButton } from '@ionic/angular/standalone';
import { apiUrl } from '../../core/api/api-base.js';
import { TILE_REGISTRY, defaultTileLayout } from '../../shared/tiles/tile-registry.js';

interface TileEntry {
  type: string;
  position: number;
  visible: boolean;
}

// FR-028: vrstni red in vidnost ploščic sta nastavljiva in se ohranita med sejami. Ta
// zaslon je edino mesto, ki piše v Settings.tiles — dashboard.page.ts ga samo bere.
@Component({
  selector: 'app-tile-arrangement',
  standalone: true,
  imports: [IonList, IonItem, IonLabel, IonToggle, IonButton],
  template: `
    <ion-list>
      @for (tile of tiles(); track tile.type; let i = $index) {
        <ion-item>
          <ion-label>{{ tile.type }}</ion-label>
          <ion-button fill="clear" size="small" [disabled]="i === 0" (click)="moveUp(i)">↑</ion-button>
          <ion-button fill="clear" size="small" [disabled]="i === tiles().length - 1" (click)="moveDown(i)">↓</ion-button>
          <ion-toggle [checked]="tile.visible" (ionChange)="toggleVisible(i, $event)"></ion-toggle>
        </ion-item>
      }
    </ion-list>
    <ion-button expand="block" [disabled]="saving()" (click)="save()">
      {{ saving() ? 'Shranjujem ...' : 'Shrani razporeditev' }}
    </ion-button>
  `,
})
export class TileArrangementComponent implements OnInit {
  private readonly http = inject(HttpClient);

  readonly tiles = signal<TileEntry[]>([]);
  readonly saving = signal(false);

  async ngOnInit(): Promise<void> {
    try {
      const settings = await firstValueFrom(
        this.http.get<{ tiles: TileEntry[] }>(apiUrl('/settings'), { withCredentials: true }),
      );
      const layout = settings.tiles.length > 0 ? settings.tiles : defaultTileLayout();
      // Vrste iz registra, ki še niso v shranjeni razporeditvi (nove, dodane po zadnji
      // shranitvi), se dodajo na konec — FR-020, nova vrsta se pojavi brez izgube stanja.
      const known = new Set(layout.map((t) => t.type));
      const missing = TILE_REGISTRY.filter((t) => !known.has(t.type)).map((t, i) => ({
        type: t.type,
        position: layout.length + i,
        visible: true,
      }));
      this.tiles.set([...layout, ...missing].sort((a, b) => a.position - b.position));
    } catch {
      this.tiles.set(defaultTileLayout());
    }
  }

  moveUp(index: number): void {
    this.swap(index, index - 1);
  }

  moveDown(index: number): void {
    this.swap(index, index + 1);
  }

  private swap(a: number, b: number): void {
    const list = [...this.tiles()];
    [list[a], list[b]] = [list[b]!, list[a]!];
    list.forEach((t, i) => (t.position = i));
    this.tiles.set(list);
  }

  toggleVisible(index: number, event: CustomEvent<{ checked: boolean }>): void {
    const list = [...this.tiles()];
    const entry = list[index];
    if (entry) entry.visible = event.detail.checked;
    this.tiles.set(list);
  }

  async save(): Promise<void> {
    this.saving.set(true);
    try {
      await firstValueFrom(
        this.http.put(apiUrl('/settings'), { tiles: this.tiles() }, { withCredentials: true }),
      );
    } finally {
      this.saving.set(false);
    }
  }
}

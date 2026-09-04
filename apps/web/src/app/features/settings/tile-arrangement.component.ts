import { Component, OnInit, inject, signal } from '@angular/core';
import { IonList, IonItem, IonLabel, IonToggle, IonButton, IonIcon, IonNote } from '@ionic/angular/standalone';
import { SettingsStore, type TileEntry } from '../../core/settings/settings.store.js';
import { PluginStore } from '../../core/plugins/plugin.store.js';
import { PLUGIN_TILE_TYPE, tileTypeTitle, withMissingBuiltIns } from '../../shared/tiles/tile-registry.js';

// FR-028: vrstni red in vidnost ploščic sta nastavljiva in se ohranita med sejami. Ta
// zaslon je edino mesto, ki piše v Settings.tiles — dashboard.page.ts ga samo bere.
@Component({
  selector: 'app-tile-arrangement',
  standalone: true,
  imports: [IonList, IonItem, IonLabel, IonToggle, IonButton, IonIcon, IonNote],
  template: `
    <ion-list class="tiles" lines="full">
      @for (tile of tiles(); track trackKey(tile); let i = $index) {
        <ion-item>
          <ion-label>
            <span class="tile-name">{{ title(tile) }}</span>
            <ion-note class="tile-state">{{ tile.visible ? 'Prikazana' : 'Skrita' }}</ion-note>
          </ion-label>
          <ion-button
            slot="end"
            fill="clear"
            size="small"
            [disabled]="i === 0"
            (click)="moveUp(i)"
            [attr.aria-label]="'Premakni ' + title(tile) + ' gor'"
          >
            <ion-icon slot="icon-only" name="arrow-up-outline"></ion-icon>
          </ion-button>
          <ion-button
            slot="end"
            fill="clear"
            size="small"
            [disabled]="i === tiles().length - 1"
            (click)="moveDown(i)"
            [attr.aria-label]="'Premakni ' + title(tile) + ' dol'"
          >
            <ion-icon slot="icon-only" name="arrow-down-outline"></ion-icon>
          </ion-button>
          <ion-toggle
            slot="end"
            [checked]="tile.visible"
            (ionChange)="toggleVisible(i, $event)"
            [attr.aria-label]="'Prikaži ' + title(tile)"
          ></ion-toggle>
        </ion-item>
      }
    </ion-list>
    <ion-button expand="block" [disabled]="saving()" (click)="save()">
      {{ saving() ? 'Shranjujem ...' : 'Shrani razporeditev' }}
    </ion-button>
  `,
  styles: `
    .tiles {
      border: 1px solid var(--cd-divider);
      border-radius: var(--cd-radius-md);
      overflow: hidden;
      margin-bottom: var(--cd-space-3);
    }
    .tile-name {
      font-weight: 600;
    }
    .tile-state {
      display: block;
      font-size: var(--cd-font-size-xs);
    }
  `,
})
export class TileArrangementComponent implements OnInit {
  private readonly settings = inject(SettingsStore);
  private readonly plugins = inject(PluginStore);

  readonly tiles = signal<TileEntry[]>([]);
  readonly saving = signal(false);

  /** Naslov vrstice. Za vgrajeno vrsto slovenski naslov iz registra (surov identifikator
   * "weather" v slovenskem vmesniku je kršitev člena X), za vtičnik pa njegovo IME — vse
   * uporabnikove ploščice bi se sicer imenovale "plugin". */
  title(tile: TileEntry): string {
    if (tile.type === PLUGIN_TILE_TYPE) {
      const id = tile.config?.['pluginId'];
      const plugin = typeof id === 'string' ? this.plugins.byId().get(id) : undefined;
      return plugin?.name ?? 'Neznan vtičnik';
    }
    return tileTypeTitle(tile.type);
  }

  /** Vrsta sama ni edinstvena: vtičnikov je lahko več in bi si `track` podvojil ključ. */
  trackKey(tile: TileEntry): string {
    return tile.type === PLUGIN_TILE_TYPE ? `plugin:${String(tile.config?.['pluginId'])}` : tile.type;
  }

  async ngOnInit(): Promise<void> {
    // Imena vtičnikov pridejo iz svoje shrambe — brez nje bi vse uporabnikove ploščice
    // pisale "plugin".
    await Promise.all([this.settings.ensureLoaded(), this.plugins.ensureLoaded()]);

    // Vgrajene vrste, ki jih shranjena razporeditev še ne pozna, se dodajo na konec
    // (FR-020) — isto funkcijo uporablja nadzorna plošča, da vidita oba zaslona enako.
    this.tiles.set(withMissingBuiltIns(this.settings.tiles()));
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
      await this.settings.patch({ tiles: this.tiles() });
    } finally {
      this.saving.set(false);
    }
  }
}

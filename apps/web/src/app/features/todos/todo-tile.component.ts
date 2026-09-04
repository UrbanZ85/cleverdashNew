import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  IonButton,
  IonCheckbox,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonSelect,
  IonSelectOption,
  IonText,
} from '@ionic/angular/standalone';
import { TileCardComponent } from '../../shared/layout/tile-card.component.js';
import { mergeMissingTypes, type TileLayoutEntry } from '../../shared/tiles/tile-layout.model.js';
import { BUILT_IN_TILE_TYPES } from '../../shared/tiles/tile-types.js';
import { SettingsStore } from '../../core/settings/settings.store.js';
import { ForegroundRefreshService } from '../../core/refresh/foreground-refresh.service.js';
import { TodosApi } from './todos.api.js';
import { dueColor, dueLabel, lastChangeLabel, progressBadge, type TodoList, type TodoTask } from './todos.model.js';

const TILE_TYPE = 'todos';
const MAX_SHOWN = 6;

// Ploščica "Opravila" na nadzorni plošči (US2).
//
// PRIPETOST BERE PLOŠČICA SAMA iz `Settings.tiles[].config.listId` in je NE dobi kot vhod:
// `dashboard.page.ts` vgrajenim ploščicam vhodov ne podaja in namenoma ne pozna imen
// posameznih vrst (FR-020). Ploščica svojo vrsto pozna, nadzorna plošča pa ne rabi vedeti, da
// ta ploščica sploh kaj hrani — zato ta smer in ne obratna.
//
// Strežnik o pripetosti ne izve ničesar razen kot parametra poizvedbe; ne hrani je in je ne
// preverja (isti dogovor kot `config.pluginId`, člen I).

@Component({
  selector: 'app-todo-tile',
  standalone: true,
  imports: [
    TileCardComponent,
    IonList,
    IonItem,
    IonLabel,
    IonCheckbox,
    IonButton,
    IonIcon,
    IonSelect,
    IonSelectOption,
    IonText,
  ],
  template: `
    <app-tile-card
      [title]="list()?.title ?? 'Opravila'"
      [subtitle]="subtitle()"
      icon="checkbox-outline"
      [loading]="loading()"
    >
      <div slot="actions" class="actions">
        @if (lists().length > 1) {
          <ion-select
            interface="popover"
            [value]="pinnedId() ?? ''"
            (ionChange)="pin($event)"
            aria-label="Pripni seznam"
            placeholder="Samodejno"
          >
            <ion-select-option value="">Nazadnje spremenjen</ion-select-option>
            @for (item of lists(); track item.id) {
              <ion-select-option [value]="item.id">{{ item.title }}</ion-select-option>
            }
          </ion-select>
        }
        <ion-button fill="clear" size="small" (click)="open()" aria-label="Odpri zavihek Opravila">
          <ion-icon slot="icon-only" name="chevron-forward-outline"></ion-icon>
        </ion-button>
      </div>

      @if (list(); as current) {
        @if (fallback()) {
          <ion-text color="medium">
            <p class="note">Pripeti seznam ni več dosegljiv — prikazan je nazadnje spremenjen.</p>
          </ion-text>
        }

        @if (error(); as message) {
          <ion-text color="danger"><p class="note">{{ message }}</p></ion-text>
        }

        @if (current.taskCount === 0) {
          <p class="note cd-muted">Ta seznam je prazen.</p>
        } @else if (openTasks(current).length === 0) {
          <p class="done-all">
            <ion-icon name="checkmark-done-outline" color="success"></ion-icon>
            <ion-text color="success"><strong>Vse opravljeno</strong></ion-text>
          </p>
        } @else {
          <ion-list lines="none">
            @for (task of openTasks(current); track task.id) {
              <ion-item
                class="row"
                [class.row-clickable]="current.capabilities.toggleTask"
                (click)="toggleFromRow(current, task)"
              >
                <ion-checkbox
                  slot="start"
                  [checked]="task.done"
                  [disabled]="!current.capabilities.toggleTask"
                  (ionChange)="toggle(current, task)"
                  (click)="stopRowClick($event)"
                  [attr.aria-label]="task.title"
                ></ion-checkbox>
                <ion-label>
                  <span>{{ task.title }}</span>
                  @if (due(task); as text) {
                    <ion-text [color]="tone(task)"><small class="due">{{ text }}</small></ion-text>
                  }
                </ion-label>
              </ion-item>
            }
          </ion-list>
          @if (hiddenCount(current) > 0) {
            <p class="note cd-muted">… in še {{ hiddenCount(current) }}</p>
          }
        }
      } @else if (!loading()) {
        <div class="empty">
          <p class="cd-muted">Še nimaš nobenega seznama opravil.</p>
          <ion-button size="small" (click)="open()">Naredi seznam</ion-button>
        </div>
      }

      <div slot="footer" class="foot">
        @if (list(); as current) {
          <span class="cd-muted">{{ changed(current) }}</span>
          <span class="cd-muted">{{ badge(current) }}</span>
        }
      </div>
    </app-tile-card>
  `,
  styles: `
    .actions {
      display: flex;
      align-items: center;
      gap: var(--cd-space-1);
    }
    /* Noga je ENA projicirana veja, zato razmika med njenima deloma ne naredi
       justify-content na ovoju ploščice — brez tega se je izpisalo "08:260/0". */
    .foot {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--cd-space-3);
      width: 100%;
    }
    .done-all {
      display: flex;
      align-items: center;
      gap: var(--cd-space-2);
      margin: 0 0 var(--cd-space-2);
      font-size: var(--cd-font-size-sm);
    }
    .actions ion-select {
      max-width: 11rem;
      font-size: var(--cd-font-size-sm);
    }
    .row {
      --min-height: 34px;
      --padding-start: 0;
    }
    .row-clickable {
      cursor: pointer;
    }
    .due {
      display: block;
      font-size: var(--cd-font-size-xs);
    }
    .note {
      margin: 0 0 var(--cd-space-2);
      font-size: var(--cd-font-size-sm);
    }
    .empty {
      text-align: center;
      padding: var(--cd-space-3) 0;
    }
  `,
})
export class TodoTileComponent implements OnInit, OnDestroy {
  private readonly api = inject(TodosApi);
  private readonly settings = inject(SettingsStore);
  private readonly refresh = inject(ForegroundRefreshService);
  private readonly router = inject(Router);

  readonly list = signal<TodoList | null>(null);
  readonly lists = signal<{ id: string; title: string }[]>([]);
  readonly fallback = signal(false);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  private unregister?: () => void;

  readonly pinnedId = computed(() => {
    const entry = this.settings.tiles().find((t) => t.type === TILE_TYPE);
    const value = entry?.config?.['listId'];
    return typeof value === 'string' && value.length > 0 ? value : null;
  });

  /** Napredek je v PODNASLOVU, ne le v nogi: "koliko je narejenega" je glavni podatek te
   * ploščice in mora biti viden brez iskanja. */
  readonly subtitle = computed(() => {
    const current = this.list();
    if (!current) return null;
    const done = current.taskCount - current.openCount;
    const napredek =
      current.taskCount === 0 ? 'prazen seznam' : `${done} od ${current.taskCount} opravljenih`;
    return current.locked ? `${napredek} · zaklenjen` : napredek;
  });

  ngOnInit(): void {
    // `refreshOnNavigation`: `ion-router-outlet` stran predpomni, zato klik na "Nadzorna
    // plošča" ne ustvari nove komponente in `ngOnInit` se ne izvede znova. Brez tega je
    // ploščica kazala stanje izpred prvega obiska, dokler uporabnik ni osvežil cele strani.
    this.unregister = this.refresh.register(() => this.load(), { refreshOnNavigation: true });
  }

  ngOnDestroy(): void {
    this.unregister?.();
  }

  /** Interval pove STREŽNIK v odgovoru; ploščica ga NIKOLI ne določa sama (FR-087, člen VIII). */
  async load(): Promise<{ intervalMs: number }> {
    try {
      await this.settings.ensureLoaded();
      const res = await this.api.current(this.pinnedId());
      this.list.set(res.list);
      this.fallback.set(res.fallback);
      this.error.set(null);

      // Izbirnik potrebuje imena vseh seznamov; brez opravil, da je poizvedba poceni.
      const all = await this.api.listAll();
      this.lists.set(all.lists.map((l) => ({ id: l.id, title: l.title })));

      return { intervalMs: res.nextPollSeconds * 1000 };
    } catch {
      // Zadnje znano stanje ostane na zaslonu — ploščica, ki ob prehodni napaki izgine, je
      // slabša od ploščice, ki kaže malo star podatek.
      if (!this.list()) this.error.set('Opravil ni bilo mogoče naložiti.');
      return { intervalMs: 60_000 };
    } finally {
      this.loading.set(false);
    }
  }

  openTasks(list: TodoList): TodoTask[] {
    return (list.tasks ?? []).filter((t) => !t.done).slice(0, MAX_SHOWN);
  }

  hiddenCount(list: TodoList): number {
    return Math.max(0, (list.tasks ?? []).filter((t) => !t.done).length - MAX_SHOWN);
  }

  badge(list: TodoList): string {
    return progressBadge(list);
  }

  changed(list: TodoList): string {
    return list.lastModifiedBy ? `spremenil ${lastChangeLabel(list)}` : '';
  }

  due(task: TodoTask): string | null {
    return dueLabel(task);
  }

  tone(task: TodoTask): 'danger' | 'warning' | undefined {
    return dueColor(task.dueState) ?? undefined;
  }

  /** Klik kamor koli po vrstici — enak dogovor kot na zavihku (todos.page.ts). */
  toggleFromRow(list: TodoList, task: TodoTask): void {
    if (!list.capabilities.toggleTask) return;
    void this.toggle(list, task);
  }

  /** Klik na kvadratek sproži že `ionChange` — brez tega bi se preklop izničil. */
  stopRowClick(event: Event): void {
    event.stopPropagation();
  }

  async toggle(list: TodoList, task: TodoTask): Promise<void> {
    // Optimistično, z enako povrnitvijo kot na zavihku — checkbox na ploščici mora biti
    // enakovreden checkboxu na zavihku (FR-083).
    const previous = list;
    this.list.set({
      ...list,
      tasks: (list.tasks ?? []).map((t) => (t.id === task.id ? { ...t, done: true } : t)),
      openCount: Math.max(0, list.openCount - 1),
    });
    try {
      this.list.set(await this.api.updateTask(list.id, task.id, { done: true }));
      this.error.set(null);
    } catch (err) {
      this.list.set(previous);
      const detail = (err as { error?: { detail?: string } } | null)?.error?.detail;
      this.error.set(typeof detail === 'string' ? detail : 'Spremembe ni bilo mogoče shraniti.');
    }
  }

  /** Pripenjanje zapiše `config.listId` v razporeditev ploščic. Prazna vrednost odpne. */
  async pin(event: Event): Promise<void> {
    const value = (event as CustomEvent<{ value: string }>).detail?.value ?? '';

    // Osnova je razporeditev, DOPOLNJENA z vgrajenimi vrstami: če uporabnik razporeditve še
    // nikoli ni shranil, vnosa za to ploščico v njej še ni in `map` spodaj ne bi imel česa
    // spremeniti (isti razlog kot v zaslonu za razporejanje).
    const layout: TileLayoutEntry[] = mergeMissingTypes(this.settings.tiles(), BUILT_IN_TILE_TYPES).map((entry) =>
      entry.type === TILE_TYPE
        ? { ...entry, config: { ...(entry.config ?? {}), listId: value } }
        : entry,
    );

    try {
      await this.settings.patch({ tiles: layout });
      await this.load();
    } catch (err) {
      // Splošno sporočilo je skrilo pravi razlog (strežnik je vračal 400 "Podvojen
      // position") in s tem podaljšalo iskanje napake — člen VI: tiha oziroma nepovedna
      // napaka je hrošč. Zdaj se pokaže `detail` iz odgovora, kot povsod drugod.
      const detail = (err as { error?: { detail?: string } } | null)?.error?.detail;
      this.error.set(
        typeof detail === 'string' && detail.length > 0
          ? `Pripenjanja ni bilo mogoče shraniti: ${detail}`
          : 'Pripenjanja ni bilo mogoče shraniti.',
      );
    }
  }

  open(): void {
    void this.router.navigate(['/todos']);
  }
}

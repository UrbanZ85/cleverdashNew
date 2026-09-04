import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  IonList,
  IonItem,
  IonLabel,
  IonInput,
  IonButton,
  IonIcon,
  IonNote,
  IonSelect,
  IonSelectOption,
  IonToggle,
  IonText,
  IonBadge,
} from '@ionic/angular/standalone';
import { PluginStore } from '../../core/plugins/plugin.store.js';
import {
  MAX_TILE_WIDTH_PX,
  MIN_TILE_WIDTH_PX,
  PLUGIN_KINDS,
  PLUGIN_KIND_HINTS,
  PLUGIN_KIND_ICONS,
  PLUGIN_KIND_TITLES,
  emptyDraft,
  fetchesThroughServer,
  validateDraft,
  type DashboardPlugin,
  type PluginDraft,
  type PluginKind,
} from '../../core/plugins/plugin.model.js';
import { normalizeEmbedAddress, type EmbedAddressNote } from '../../core/embeds/embed-address.js';
import { AVAILABLE_ICON_NAMES } from '../../core/icons/register-icons.js';
import { HelpButtonComponent } from '../../shared/help/help-button.component.js';
import { SettingsStore } from '../../core/settings/settings.store.js';

/** Besedilo za vsako popravljeno obliko prilepljenega naslova — enako kot v obrazcu za
 * kamero: samodejni popravek, ki ga uporabnik ne vidi, je le še ena nerazložena sprememba. */
const URL_NOTE_TEXT: Record<EmbedAddressNote, string> = {
  'extracted-from-iframe': 'Iz prilepljene oznake <iframe> je vzet samo naslov (src) — shrani se naslov, ne HTML.',
  'youtube-to-embed':
    'YouTube naslov za gledanje je pretvorjen v naslov za vdelavo (/embed/). Naslova za gledanje YouTube v okvirju ne dovoli in bi ploščica ostala prazna.',
};

// 005: uporabnik si tukaj sam definira ploščice na nadzorni plošči. Vzorec obrazca je
// posnet po features/cameras/manage/camera-form.component.ts — seznam + obrazec na istem
// zaslonu, brez ločene poti.
//
// Ob ustvarjanju se vtičnik TAKOJ doda v razporeditev (Settings.tiles), sicer bi ga
// uporabnik ustvaril in ga ne bi videl nikjer — dodajanje v dveh korakih je past.
@Component({
  selector: 'app-plugins-settings',
  standalone: true,
  imports: [
    FormsModule,
    HelpButtonComponent,
    IonList,
    IonItem,
    IonLabel,
    IonInput,
    IonButton,
    IonIcon,
    IonNote,
    IonSelect,
    IonSelectOption,
    IonToggle,
    IonText,
    IonBadge,
  ],
  template: `
    @if (!formOpen()) {
      @if (plugins().length === 0) {
        <p class="cd-section-hint">
          Vtičnik je tvoja lastna ploščica na nadzorni plošči: povezava, vdelana stran, zunanja
          slika ali podatek iz JSON vira. Dodaj jih lahko poljubno mnogo.
        </p>
      } @else {
        <ion-list class="plugins" lines="full">
          @for (plugin of plugins(); track plugin.id) {
            <ion-item>
              <ion-icon slot="start" [name]="plugin.icon" aria-hidden="true"></ion-icon>
              <ion-label>
                <span class="plugin-name">{{ plugin.name }}</span>
                <ion-note class="plugin-url">{{ plugin.url }}</ion-note>
              </ion-label>
              <ion-badge slot="end" color="light">{{ kindTitle(plugin.kind) }}</ion-badge>
              <ion-button slot="end" fill="clear" size="small" (click)="edit(plugin)" aria-label="Uredi">
                <ion-icon slot="icon-only" name="create-outline"></ion-icon>
              </ion-button>
              <ion-button
                slot="end"
                fill="clear"
                size="small"
                color="danger"
                (click)="remove(plugin)"
                aria-label="Odstrani"
              >
                <ion-icon slot="icon-only" name="trash-outline"></ion-icon>
              </ion-button>
            </ion-item>
          }
        </ion-list>
      }

      <ion-button expand="block" (click)="startNew()">
        <ion-icon slot="start" name="add-outline"></ion-icon>
        Dodaj vtičnik
      </ion-button>
    } @else {
      <ion-list lines="full">
        <ion-item>
          <ion-select
            label="Vrsta"
            labelPlacement="stacked"
            [ngModel]="draft.kind"
            (ngModelChange)="onKindChange($event)"
            interface="popover"
          >
            @for (kind of kinds; track kind) {
              <ion-select-option [value]="kind">{{ kindTitle(kind) }}</ion-select-option>
            }
          </ion-select>
          <app-help slot="end" topic="plugin.kind"></app-help>
        </ion-item>
        <ion-note class="cd-section-hint kind-hint">{{ kindHint() }}</ion-note>

        <ion-item>
          <ion-input label="Ime" labelPlacement="stacked" [(ngModel)]="draft.name" maxlength="60"></ion-input>
          <app-help slot="end" topic="plugin.name"></app-help>
        </ion-item>
        <ion-item>
          <ion-input
            label="Naslov (https)"
            labelPlacement="stacked"
            type="url"
            inputmode="url"
            placeholder="https://..."
            [(ngModel)]="draft.url"
            (ionBlur)="normalizeUrl()"
          ></ion-input>
          <app-help slot="end" topic="plugin.url"></app-help>
        </ion-item>
        @for (note of urlNotes(); track note) {
          <ion-note class="cd-section-hint">{{ note }}</ion-note>
        }
        <ion-item>
          <ion-select label="Ikona" labelPlacement="stacked" [(ngModel)]="draft.icon" interface="popover">
            @for (icon of icons; track icon) {
              <ion-select-option [value]="icon">{{ icon }}</ion-select-option>
            }
          </ion-select>
          <ion-icon slot="end" [name]="draft.icon" aria-hidden="true"></ion-icon>
          <app-help slot="end" topic="plugin.icon"></app-help>
        </ion-item>

        <ion-item>
          <ion-input
            label="Širina (px)"
            labelPlacement="stacked"
            type="number"
            inputmode="numeric"
            [min]="minWidthPx"
            [max]="maxWidthPx"
            [(ngModel)]="draft.widthPx"
          ></ion-input>
          <app-help slot="end" topic="plugin.widthPx"></app-help>
        </ion-item>

        @switch (draft.kind) {
          @case ('link') {
            <ion-item>
              <ion-input
                label="Opis (neobvezno)"
                labelPlacement="stacked"
                [(ngModel)]="draft.description"
                maxlength="200"
              ></ion-input>
              <app-help slot="end" topic="plugin.description"></app-help>
            </ion-item>
            <ion-item>
              <ion-toggle [(ngModel)]="draft.openInNewTab">Odpri v novem zavihku</ion-toggle>
              <app-help slot="end" topic="plugin.openInNewTab"></app-help>
            </ion-item>
          }
          @case ('iframe') {
            <ion-item>
              <ion-input
                label="Višina (px)"
                labelPlacement="stacked"
                type="number"
                [(ngModel)]="draft.heightPx"
              ></ion-input>
              <app-help slot="end" topic="plugin.heightPx"></app-help>
            </ion-item>
          }
          @case ('image') {
            <ion-item>
              <ion-input
                label="Nadomestno besedilo"
                labelPlacement="stacked"
                [(ngModel)]="draft.alt"
                maxlength="200"
              ></ion-input>
              <app-help slot="end" topic="plugin.alt"></app-help>
            </ion-item>
          }
        }

        @if (needsRefresh()) {
          <ion-item>
            <ion-input
              label="Osveži vsakih (sekund)"
              labelPlacement="stacked"
              type="number"
              [(ngModel)]="draft.refreshSeconds"
            ></ion-input>
            <app-help slot="end" topic="plugin.refreshSeconds"></app-help>
          </ion-item>
          <ion-note class="cd-section-hint">
            Vir prenaša strežnik in ga predpomni — najmanj 30 sekund, da tujega vira ne
            obremenjujemo po nepotrebnem.
          </ion-note>
        }

        @if (draft.kind === 'json') {
          <h4 class="fields-title">
            Polja za prikaz
            <app-help topic="plugin.fields"></app-help>
          </h4>
          <ion-note class="cd-section-hint">
            Pot vpiši s pikami, npr. <code>observation.t</code> ali <code>list.0.main.temp</code>.
            Z gumbom “Preizkusi” vidiš, kaj vir vrne.
          </ion-note>

          @for (field of draft.fields; track $index) {
            <div class="field-row">
              <ion-input
                label="Oznaka"
                labelPlacement="stacked"
                [(ngModel)]="field.label"
                [name]="'label' + $index"
              ></ion-input>
              <ion-input
                label="Pot"
                labelPlacement="stacked"
                [(ngModel)]="field.path"
                [name]="'path' + $index"
              ></ion-input>
              <ion-input
                label="Enota"
                labelPlacement="stacked"
                [(ngModel)]="field.unit"
                [name]="'unit' + $index"
              ></ion-input>
              <ion-button fill="clear" color="danger" size="small" (click)="removeField($index)" aria-label="Odstrani polje">
                <ion-icon slot="icon-only" name="close-outline"></ion-icon>
              </ion-button>
            </div>
          }
          <ion-button size="small" fill="outline" (click)="addField()">
            <ion-icon slot="start" name="add-outline"></ion-icon>
            Dodaj polje
          </ion-button>
        }
      </ion-list>

      @if (error(); as message) {
        <ion-text color="danger"><p class="message">{{ message }}</p></ion-text>
      }
      @if (probeResult(); as probe) {
        <div class="probe">
          <p class="probe-title">Odgovor vira:</p>
          <pre>{{ probe }}</pre>
        </div>
      }

      <div class="actions">
        <ion-button fill="outline" (click)="cancel()">Prekliči</ion-button>
        @if (editing() && needsRefresh()) {
          <ion-button fill="outline" [disabled]="probing()" (click)="probe()">
            {{ probing() ? 'Preizkušam ...' : 'Preizkusi' }}
          </ion-button>
        }
        <ion-button [disabled]="saving()" (click)="save()">
          {{ saving() ? 'Shranjujem ...' : 'Shrani' }}
        </ion-button>
      </div>
    }
  `,
  styles: `
    .plugins {
      border: 1px solid var(--cd-divider);
      border-radius: var(--cd-radius-md);
      overflow: hidden;
      margin-bottom: var(--cd-space-3);
    }
    .plugin-name {
      font-weight: 600;
    }
    .plugin-url {
      display: block;
      font-size: var(--cd-font-size-xs);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .kind-hint {
      display: block;
      padding: 0 var(--cd-space-3);
    }
    .fields-title {
      margin: var(--cd-space-4) var(--cd-space-3) var(--cd-space-1);
      font-size: var(--cd-font-size-md);
      font-weight: 650;
      display: flex;
      align-items: center;
      gap: var(--cd-space-1);
    }
    .field-row {
      display: grid;
      grid-template-columns: 1fr 1.4fr 0.6fr auto;
      align-items: end;
      gap: var(--cd-space-2);
      padding: var(--cd-space-2) var(--cd-space-3);
    }
    @media (max-width: 600px) {
      .field-row {
        grid-template-columns: 1fr 1fr;
      }
    }
    .actions {
      display: flex;
      gap: var(--cd-space-2);
      justify-content: flex-end;
      flex-wrap: wrap;
      margin-top: var(--cd-space-3);
    }
    .message {
      margin: var(--cd-space-2) 0;
      font-size: var(--cd-font-size-sm);
    }
    .probe {
      margin-top: var(--cd-space-3);
      padding: var(--cd-space-3);
      border-radius: var(--cd-radius-md);
      background: var(--cd-surface-sunken);
    }
    .probe-title {
      margin: 0 0 var(--cd-space-2);
      font-size: var(--cd-font-size-sm);
      font-weight: 600;
    }
    .probe pre {
      margin: 0;
      font-size: var(--cd-font-size-xs);
      max-height: 220px;
      overflow: auto;
      white-space: pre-wrap;
      word-break: break-word;
    }
  `,
})
export class PluginsSettingsComponent implements OnInit {
  private readonly store = inject(PluginStore);
  private readonly settings = inject(SettingsStore);
  private readonly http = inject(HttpClient);

  readonly plugins = this.store.plugins;
  readonly formOpen = signal(false);
  readonly editing = signal<DashboardPlugin | null>(null);
  readonly saving = signal(false);
  readonly probing = signal(false);
  readonly error = signal<string | null>(null);
  /** Kaj je popravek naslova spremenil — izpisano pod poljem, ne tiho. */
  readonly urlNotes = signal<string[]>([]);
  readonly probeResult = signal<string | null>(null);

  protected readonly kinds = PLUGIN_KINDS;
  protected readonly icons = AVAILABLE_ICON_NAMES;
  protected readonly minWidthPx = MIN_TILE_WIDTH_PX;
  protected readonly maxWidthPx = MAX_TILE_WIDTH_PX;
  draft: PluginDraft = emptyDraft();

  readonly kindHint = computed(() => PLUGIN_KIND_HINTS[this.draft.kind]);

  async ngOnInit(): Promise<void> {
    await Promise.all([this.store.ensureLoaded(), this.settings.ensureLoaded()]);
  }

  kindTitle(kind: PluginKind): string {
    return PLUGIN_KIND_TITLES[kind];
  }

  needsRefresh(): boolean {
    return fetchesThroughServer(this.draft.kind);
  }

  /** Ob menjavi vrste predlagaj njeno značilno ikono, a le, če uporabnik svoje še ni
   * izbral — sicer bi mu menjava vrste tiho povozila izbiro. */
  onKindChange(kind: PluginKind): void {
    const wasSuggested =
      this.draft.icon === 'apps-outline' || Object.values(PLUGIN_KIND_ICONS).includes(this.draft.icon);
    this.draft.kind = kind;
    if (wasSuggested) this.draft.icon = PLUGIN_KIND_ICONS[kind];
  }

  startNew(): void {
    this.draft = emptyDraft();
    this.editing.set(null);
    this.error.set(null);
    this.probeResult.set(null);
    this.urlNotes.set([]);
    this.formOpen.set(true);
  }

  edit(plugin: DashboardPlugin): void {
    const { id: _id, ...rest } = plugin;
    // Globoka kopija polj, sicer bi urejanje v obrazcu spreminjalo shranjeni objekt v
    // shrambi še pred klikom na "Shrani" (in "Prekliči" ne bi ničesar preklical).
    this.draft = { ...rest, fields: rest.fields.map((f) => ({ ...f })) };
    this.editing.set(plugin);
    this.error.set(null);
    this.probeResult.set(null);
    this.urlNotes.set([]);
    this.formOpen.set(true);
  }

  cancel(): void {
    this.formOpen.set(false);
    this.error.set(null);
    this.probeResult.set(null);
    this.urlNotes.set([]);
  }

  addField(): void {
    this.draft.fields = [...this.draft.fields, { label: '', path: '', unit: null }];
  }

  removeField(index: number): void {
    this.draft.fields = this.draft.fields.filter((_, i) => i !== index);
  }

  /**
   * Isti popravek prilepljenega naslova kot v obrazcu za kamero (core/embeds): YouTubov gumb
   * "Vdelaj" ponudi cel `<iframe …>`, gumb "Deli" pa naslov za gledanje. Prvo ni URL in ga
   * strežnik zavrne, drugo JE URL, a ga YouTube v okvirju ne pokaže. Teče ob izgubi fokusa
   * in še enkrat pred shranjevanjem — polje se lahko prilepi in gumb pritisne brez vmesnega
   * klika drugam (na dotik je to običajno zaporedje).
   */
  normalizeUrl(): void {
    const { url, notes } = normalizeEmbedAddress(this.draft.url ?? '');
    this.draft.url = url;
    this.urlNotes.set(notes.map((note) => URL_NOTE_TEXT[note]));
  }

  async save(): Promise<void> {
    this.normalizeUrl();
    // Številsko polje lahko vrne niz ali null (prazno polje); preverba spodaj računa na
    // število. Brez pretvorbe bi napako namesto nas javil strežnik, in to manj razumljivo.
    this.draft.widthPx = Number(this.draft.widthPx);
    const problem = validateDraft(this.draft);
    if (problem) {
      this.error.set(problem);
      return;
    }

    this.saving.set(true);
    this.error.set(null);
    try {
      const existing = this.editing();
      if (existing) {
        await this.store.update(existing.id, this.draft);
      } else {
        const created = await this.store.create(this.draft);
        await this.addToLayout(created.id);
      }
      this.formOpen.set(false);
    } catch (err) {
      this.error.set(readProblemDetail(err) ?? 'Vtičnika ni bilo mogoče shraniti.');
    } finally {
      this.saving.set(false);
    }
  }

  async remove(plugin: DashboardPlugin): Promise<void> {
    try {
      await this.store.remove(plugin.id);
      // Vnos v razporeditvi, ki kaže na izbrisan vtičnik, dashboard preskoči — počistimo ga
      // vseeno, da se seznam ploščic ne polni z mrtvimi vnosi.
      const remaining = this.settings
        .tiles()
        .filter((t) => !(t.type === 'plugin' && t.config?.['pluginId'] === plugin.id));
      if (remaining.length !== this.settings.tiles().length) {
        await this.settings.patch({ tiles: remaining.map((t, i) => ({ ...t, position: i })) });
      }
    } catch (err) {
      this.error.set(readProblemDetail(err) ?? 'Vtičnika ni bilo mogoče odstraniti.');
    }
  }

  /** Nov vtičnik gre takoj na konec razporeditve — sicer bi bil ustvarjen in neviden. */
  private async addToLayout(pluginId: string): Promise<void> {
    const current = this.settings.tiles();
    const next = [
      ...current,
      { type: 'plugin', position: current.length, visible: true, config: { pluginId } },
    ];
    await this.settings.patch({ tiles: next.map((t, i) => ({ ...t, position: i })) });
  }

  async probe(): Promise<void> {
    const existing = this.editing();
    if (!existing) return;
    this.probing.set(true);
    this.probeResult.set(null);
    try {
      const res = await firstValueFrom(
        this.http.get(this.store.dataUrl(existing.id), { withCredentials: true }),
      );
      this.probeResult.set(JSON.stringify(res, null, 2));
    } catch (err) {
      this.probeResult.set(readProblemDetail(err) ?? 'Vira ni bilo mogoče prebrati.');
    } finally {
      this.probing.set(false);
    }
  }
}

/** Strežnik vrača RFC 7807 (`application/problem+json`) — `detail` je slovensko sporočilo,
 * napisano za uporabnika, zato je boljše od splošnega "napaka pri shranjevanju". */
function readProblemDetail(err: unknown): string | null {
  const detail = (err as { error?: { detail?: unknown } } | null)?.error?.detail;
  return typeof detail === 'string' && detail.length > 0 ? detail : null;
}

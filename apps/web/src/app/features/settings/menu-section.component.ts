import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { IonList, IonItem, IonLabel, IonIcon, IonToggle, IonButton, IonNote, IonText } from '@ionic/angular/standalone';
import { apiUrl } from '../../core/api/api-base.js';
import { SettingsStore } from '../../core/settings/settings.store.js';
import { TabRegistryService } from '../../core/tabs/tab-registry.service.js';

interface ConfigurableTab {
  id: string;
  title: string;
  icon: string;
  route: string;
  order: number;
  enabled: boolean;
  /** Zavihek, ki bi uporabnika ob izklopu zaklenil iz aplikacije (strežnik ga zavrne). */
  undisableable: boolean;
}

// 005: "vsi meniji so konfigurabilni in jih uporabnik lahko uporablja ali pa ne".
//
// Zaledje je to podpiralo že od 001 (`Settings.tabs` + `resolveTabs`), a tega ni znal
// zapisati NOBEN zaslon — vklop/izklop je bil izključno API funkcija. Ta razdelek je edino
// mesto v vmesniku, ki piše `Settings.tabs`.
//
// Seznam pride z `GET /tabs/all` in ne `GET /tabs`: slednji izklopljene po definiciji
// izpusti, torej bi izklopljen zavihek izginil tudi od tod in ga ne bi bilo mogoče vklopiti
// nazaj.
@Component({
  selector: 'app-menu-settings',
  standalone: true,
  imports: [IonList, IonItem, IonLabel, IonIcon, IonToggle, IonButton, IonNote, IonText],
  template: `
    <p class="cd-section-hint">
      Izberi, kateri zavihki naj bodo v meniju, in v kakšnem vrstnem redu. Izklopljen zavihek
      izgine iz menija, njegova pot pa ni več dosegljiva.
    </p>

    @if (tabs().length === 0) {
      <ion-note class="cd-section-hint">Menija ni bilo mogoče naložiti.</ion-note>
    } @else {
      <ion-list class="tabs" lines="full">
        @for (tab of tabs(); track tab.id; let i = $index) {
          <ion-item>
            <ion-icon slot="start" [name]="tab.icon" aria-hidden="true"></ion-icon>
            <ion-label>
              <span class="tab-title">{{ tab.title }}</span>
              <ion-note class="tab-route">{{ tab.route }}</ion-note>
            </ion-label>

            <ion-button
              slot="end"
              fill="clear"
              size="small"
              [disabled]="i === 0"
              (click)="move(i, -1)"
              [attr.aria-label]="'Premakni ' + tab.title + ' gor'"
            >
              <ion-icon slot="icon-only" name="arrow-up-outline"></ion-icon>
            </ion-button>
            <ion-button
              slot="end"
              fill="clear"
              size="small"
              [disabled]="i === tabs().length - 1"
              (click)="move(i, 1)"
              [attr.aria-label]="'Premakni ' + tab.title + ' dol'"
            >
              <ion-icon slot="icon-only" name="arrow-down-outline"></ion-icon>
            </ion-button>
            <ion-toggle
              slot="end"
              [checked]="tab.enabled"
              [disabled]="tab.undisableable"
              (ionChange)="toggle(i, $event)"
              [attr.aria-label]="'Prikaži ' + tab.title"
            ></ion-toggle>
          </ion-item>
          @if (tab.undisableable) {
            <ion-note class="cd-section-hint row-hint">
              Tega zavihka ni mogoče izklopiti — brez njega ne bi bilo poti nazaj do nastavitev.
            </ion-note>
          }
        }
      </ion-list>
    }

    @if (saved()) {
      <ion-text color="success"><p class="message">Shranjeno.</p></ion-text>
    }
    @if (error(); as message) {
      <ion-text color="danger"><p class="message">{{ message }}</p></ion-text>
    }

    <ion-button expand="block" [disabled]="saving()" (click)="save()">
      {{ saving() ? 'Shranjujem ...' : 'Shrani meni' }}
    </ion-button>
  `,
  styles: `
    .tabs {
      border: 1px solid var(--cd-divider);
      border-radius: var(--cd-radius-md);
      overflow: hidden;
      margin-bottom: var(--cd-space-3);
    }
    .tab-title {
      font-weight: 600;
    }
    .tab-route {
      display: block;
      font-size: var(--cd-font-size-xs);
    }
    .row-hint {
      display: block;
      padding: 0 var(--cd-space-3) var(--cd-space-2);
    }
    .message {
      margin: var(--cd-space-2) 0;
      font-size: var(--cd-font-size-sm);
    }
  `,
})
export class MenuSettingsComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly settings = inject(SettingsStore);
  private readonly tabRegistry = inject(TabRegistryService);

  readonly tabs = signal<ConfigurableTab[]>([]);
  readonly saving = signal(false);
  readonly saved = signal(false);
  readonly error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    await this.settings.ensureLoaded();
    try {
      const all = await firstValueFrom(
        this.http.get<ConfigurableTab[]>(apiUrl('/tabs/all'), { withCredentials: true }),
      );
      this.tabs.set([...all].sort((a, b) => a.order - b.order));
    } catch {
      this.error.set('Seznama zavihkov ni bilo mogoče naložiti.');
    }
  }

  move(index: number, delta: number): void {
    const list = [...this.tabs()];
    const target = index + delta;
    if (target < 0 || target >= list.length) return;
    [list[index], list[target]] = [list[target]!, list[index]!];
    this.tabs.set(list.map((t, i) => ({ ...t, order: i })));
  }

  toggle(index: number, event: CustomEvent<{ checked: boolean }>): void {
    const list = [...this.tabs()];
    const entry = list[index];
    if (entry) list[index] = { ...entry, enabled: event.detail.checked };
    this.tabs.set(list);
  }

  async save(): Promise<void> {
    this.saving.set(true);
    this.saved.set(false);
    this.error.set(null);
    try {
      const overrides = Object.fromEntries(
        this.tabs().map((t) => [t.id, { enabled: t.enabled, order: t.order }]),
      );
      await this.settings.patch({ tabs: overrides });
      // Meni bere svoj register ločeno od nastavitev — brez tega bi sprememba postala vidna
      // šele ob naslednjem zagonu aplikacije.
      await this.tabRegistry.reload();
      this.saved.set(true);
    } catch (err) {
      const detail = (err as { error?: { detail?: unknown } } | null)?.error?.detail;
      this.error.set(typeof detail === 'string' ? detail : 'Menija ni bilo mogoče shraniti.');
    } finally {
      this.saving.set(false);
    }
  }
}

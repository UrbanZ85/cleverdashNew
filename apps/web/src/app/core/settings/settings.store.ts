import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { apiUrl } from '../api/api-base.js';
import {
  SETTINGS_DEFAULTS,
  applyPatch,
  mergeWithDefaults,
  type Settings,
  type SettingsPatch,
} from './settings.model.js';

export {
  DEFAULT_MAP_HEIGHT_PX,
  MAX_MAP_HEIGHT_PX,
  MIN_MAP_HEIGHT_PX,
  clampMapHeightPx,
} from './settings.model.js';

export type {
  CommuteLayout,
  CommutePlaceSettings,
  CommuteSettings,
  Settings,
  SettingsPatch,
  SourceOverrides,
  TabOverride,
  ThemePreference,
  TileEntry,
} from './settings.model.js';

// `apiUrl('/settings')` se je pojavil na ENAJSTIH mestih: dashboard.page, theme.service,
// location, tile-arrangement in cameras-section so vsak zase klicali GET /settings ob
// zagonu, torej pet zahtev za isti dokument. Ta shramba je edini odjemalec te poti.
//
// Vzorec je isti kot pri core/tabs/tab-registry.service.ts: signal + ensureLoaded(), ki si
// ga sočasni klicatelji delijo.
@Injectable({ providedIn: 'root' })
export class SettingsStore {
  private readonly http = inject(HttpClient);
  private readonly state = signal<Settings>(SETTINGS_DEFAULTS);
  private readonly loadedSignal = signal(false);
  private inFlight: Promise<void> | null = null;

  readonly settings = this.state.asReadonly();
  readonly loaded = this.loadedSignal.asReadonly();
  readonly tiles = computed(() => this.state().tiles);
  readonly theme = computed(() => this.state().theme);
  readonly weather = computed(() => this.state().weather);
  readonly tabs = computed(() => this.state().tabs);
  readonly sources = computed(() => this.state().sources);
  readonly commute = computed(() => this.state().commute);

  async ensureLoaded(): Promise<void> {
    if (this.loadedSignal()) return;
    this.inFlight ??= this.load().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  async reload(): Promise<void> {
    this.loadedSignal.set(false);
    await this.ensureLoaded();
  }

  private async load(): Promise<void> {
    try {
      const raw = await firstValueFrom(
        this.http.get<Partial<Settings>>(apiUrl('/settings'), { withCredentials: true }),
      );
      this.state.set(mergeWithDefaults(raw));
      this.loadedSignal.set(true);
    } catch {
      // Nastavitve niso dosegljive — privzetki so uporabno stanje, ne prazen zaslon
      // (FR-026 duh). `loaded` ostane false, da naslednji ensureLoaded() poskusi znova.
    }
  }

  /**
   * Optimistično posodobi lokalno stanje in shrani na strežnik. Ob napaki povrne prejšnje
   * stanje in napako vrže naprej, da jo zaslon lahko pokaže — tiho razhajanje med tem, kar
   * uporabnik vidi, in tem, kar je shranjeno, je hujše od sporočila o napaki.
   */
  async patch(patch: SettingsPatch): Promise<void> {
    const previous = this.state();
    this.state.set(applyPatch(previous, patch));
    try {
      const saved = await firstValueFrom(
        this.http.put<Partial<Settings>>(apiUrl('/settings'), patch, { withCredentials: true }),
      );
      // Strežnik je merodajen: zavrnjene ali očiščene vrednosti (npr. neznana vrsta
      // ploščice) se morajo poznati tudi v vmesniku.
      this.state.set(mergeWithDefaults(saved));
      this.loadedSignal.set(true);
    } catch (err) {
      this.state.set(previous);
      throw err;
    }
  }
}

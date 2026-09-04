import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { apiUrl } from '../api/api-base.js';
import type { DashboardPlugin, PluginDraft } from './plugin.model.js';

export type { DashboardPlugin, PluginDraft } from './plugin.model.js';

// Vtičnike potrebujeta dva zaslona hkrati: nadzorna plošča (za izris) in nastavitve (za
// urejanje). Skupna shramba po vzorcu core/settings/settings.store.ts — brez nje bi vsaka
// ploščica posebej klicala GET /dashboard/plugins, kar je za sedem vtičnikov sedem zahtev.
@Injectable({ providedIn: 'root' })
export class PluginStore {
  private readonly http = inject(HttpClient);
  private readonly state = signal<DashboardPlugin[]>([]);
  private readonly loadedSignal = signal(false);
  private inFlight: Promise<void> | null = null;

  readonly plugins = this.state.asReadonly();
  readonly loaded = this.loadedSignal.asReadonly();
  readonly byId = computed(() => new Map(this.state().map((p) => [p.id, p])));

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
      const res = await firstValueFrom(
        this.http.get<{ plugins: DashboardPlugin[] }>(apiUrl('/dashboard/plugins'), { withCredentials: true }),
      );
      this.state.set(res.plugins);
      this.loadedSignal.set(true);
    } catch {
      // Brez vtičnikov je nadzorna plošča še vedno uporabna (vgrajene ploščice delujejo) —
      // `loaded` ostane false, da naslednji ensureLoaded() poskusi znova.
    }
  }

  async create(draft: PluginDraft): Promise<DashboardPlugin> {
    const created = await firstValueFrom(
      this.http.post<DashboardPlugin>(apiUrl('/dashboard/plugins'), draft, { withCredentials: true }),
    );
    this.state.update((list) => [...list, created].sort(byName));
    return created;
  }

  async update(id: string, draft: PluginDraft): Promise<DashboardPlugin> {
    const saved = await firstValueFrom(
      this.http.put<DashboardPlugin>(apiUrl(`/dashboard/plugins/${id}`), draft, { withCredentials: true }),
    );
    this.state.update((list) => list.map((p) => (p.id === id ? saved : p)).sort(byName));
    return saved;
  }

  async remove(id: string): Promise<void> {
    await firstValueFrom(this.http.delete(apiUrl(`/dashboard/plugins/${id}`), { withCredentials: true }));
    this.state.update((list) => list.filter((p) => p.id !== id));
  }

  /** Naslov, s katerega ploščica prenese podatek — vedno prek našega strežnika (člen VIII). */
  dataUrl(id: string): string {
    return apiUrl(`/dashboard/plugins/${id}/data`);
  }
}

function byName(a: DashboardPlugin, b: DashboardPlugin): number {
  return a.name.localeCompare(b.name, 'sl');
}

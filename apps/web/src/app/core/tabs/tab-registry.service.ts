import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { apiUrl } from '../api/api-base.js';

/** Neobvezen dodatek, ki ga zavihku prispeva njegov MODUL, ne register — glej
 * `platform/tabs/extension.ts` na strani API-ja. Meni tako pokaže, kateri vir je pod
 * zavihkom dejansko v uporabi (npr. katera lokacija se beleži) in ali ta vir živi, ne da
 * bi `platform/tabs` karkoli vedel o modulu (člen I). */
export interface TabDetail {
  /** Ena vrstica pod naslovom zavihka — npr. ime lokacije in gostitelj portala. */
  subtitle?: string;
  /** Barva značke v meniju. `warning`/`danger` pomenita, da vir potrebuje pozornost. */
  status?: 'ok' | 'warning' | 'danger';
  /** Kratko besedilo značke, npr. "seji poteče". */
  statusLabel?: string;
}

export interface ResolvedTab {
  id: string;
  title: string;
  icon: string;
  route: string;
  order: number;
  requiredScopes?: string[];
  detail?: TabDetail;
}

// FR-002, FR-003: meni (in usmerjanje, prek tab-guard.ts) se sestavi iz razrešenega
// registra s strežnika, ne iz trdo napisanega seznama. Pot izklopljenega zavihka se sploh
// ne pojavi tukaj, zato je "ne registrirana" enostavno posledica tega, da je odsotna.
@Injectable({ providedIn: 'root' })
export class TabRegistryService {
  private readonly http = inject(HttpClient);
  private readonly tabsSignal = signal<ResolvedTab[]>([]);
  private loaded = false;

  readonly tabs = this.tabsSignal.asReadonly();

  /** Naloži register, če še ni bil naložen v tej seji. Ponovi se lahko kadar koli
   * (npr. po vrnitvi v ospredje), da se prekritja iz nastavitev odrazijo brez novega builda. */
  async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    await this.reload();
  }

  async reload(): Promise<void> {
    const tabs = await firstValueFrom(this.http.get<ResolvedTab[]>(apiUrl('/tabs'), { withCredentials: true }));
    this.tabsSignal.set(tabs);
    this.loaded = true;
  }

  isRouteEnabled(route: string): boolean {
    return this.tabsSignal().some((t) => t.route === route);
  }
}

import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { apiUrl } from '../api/api-base.js';

export type ThemePreference = 'system' | 'light' | 'dark';

// FR-006: svetla in temna tema, privzeto po nastavitvi sistema. Ionic 8 uporablja razred
// `ion-palette-dark` na korenskem elementu za temno paleto (dokumentirana konvencija, ne
// naša izmišljotina).
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly http = inject(HttpClient);
  private readonly preference = signal<ThemePreference>('system');
  private readonly mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

  readonly current = this.preference.asReadonly();

  constructor() {
    this.mediaQuery.addEventListener('change', () => this.applyTheme());
  }

  async load(): Promise<void> {
    try {
      const settings = await firstValueFrom(
        this.http.get<{ theme: ThemePreference }>(apiUrl('/settings'), { withCredentials: true }),
      );
      this.preference.set(settings.theme);
    } catch {
      // Nastavitve niso na voljo — ostane privzeti "system", ki ni napačna izbira.
    }
    this.applyTheme();
  }

  async setTheme(theme: ThemePreference): Promise<void> {
    this.preference.set(theme);
    this.applyTheme();
    try {
      await firstValueFrom(this.http.put(apiUrl('/settings'), { theme }, { withCredentials: true }));
    } catch {
      // Shranjevanje je spodletelo — tema ostane uveljavljena lokalno do naslednjega
      // uspešnega poskusa; ni razloga vrniti uporabnika v prejšnjo temo zaradi tega.
    }
  }

  private applyTheme(): void {
    const pref = this.preference();
    const isDark = pref === 'dark' || (pref === 'system' && this.mediaQuery.matches);
    document.documentElement.classList.toggle('ion-palette-dark', isDark);
  }
}

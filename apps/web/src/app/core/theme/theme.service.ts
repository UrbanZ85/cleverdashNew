import { Injectable, inject, signal } from '@angular/core';
import { SettingsStore, type ThemePreference } from '../settings/settings.store.js';

export type { ThemePreference };

// FR-006: svetla in temna tema, privzeto po nastavitvi sistema. Ionic 8 uporablja razred
// `ion-palette-dark` na korenskem elementu za temno paleto (dokumentirana konvencija, ne
// naša izmišljotina) — CSS zanj uvozi global.scss (@ionic/angular/css/palettes/dark.class.css).
// Ta uvoz je prej MANJKAL, zato preklop razreda ni imel nobenega učinka.
//
// Preferenca se ne bere več z lastnim GET /settings, ampak iz skupne shrambe
// (core/settings/settings.store.ts) — pet komponent je prej vsaka zase klicalo isto pot.
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly settings = inject(SettingsStore);
  private readonly preference = signal<ThemePreference>('system');
  private readonly mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

  readonly current = this.preference.asReadonly();

  constructor() {
    this.mediaQuery.addEventListener('change', () => this.applyTheme());
  }

  async load(): Promise<void> {
    await this.settings.ensureLoaded();
    this.preference.set(this.settings.theme());
    this.applyTheme();
  }

  async setTheme(theme: ThemePreference): Promise<void> {
    const previous = this.preference();
    this.preference.set(theme);
    this.applyTheme();
    try {
      await this.settings.patch({ theme });
    } catch {
      // Shranjevanje je spodletelo — tema ostane uveljavljena lokalno do naslednjega
      // uspešnega poskusa; ni razloga vrniti uporabnika v prejšnjo temo zaradi tega.
      void previous;
    }
  }

  private applyTheme(): void {
    const pref = this.preference();
    const isDark = pref === 'dark' || (pref === 'system' && this.mediaQuery.matches);
    document.documentElement.classList.toggle('ion-palette-dark', isDark);
  }
}

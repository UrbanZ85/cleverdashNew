import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';
import { apiUrl } from '../api/api-base.js';
import { AuthService } from '../auth/auth.service.js';
import { TabRegistryService } from '../tabs/tab-registry.service.js';
import { tabIdForUrl } from './tab-for-url.js';

// 014: sporočanje ogledov zavihkov.
//
// ZAKAJ TO SPLOH OBSTAJA NA ODJEMALCU: menjava zavihka v enostranski aplikaciji ne pomeni
// zahteve na strežnik. Brez tega poslušalca strežnik o ogledu ne izve nikoli.
//
// ZAKAJ V `core/` IN NE V MAPI MODULA: sledilnik v mapi zavihka Analitika bi deloval šele, ko je
// ta zavihek odprt — meril bi torej samo administratorja na zaslonu z meritvami. Vpet je tam, kjer
// sta `ThemeService` in `DeepLinkHandler`, iz istega razloga: gre za vedenje cele lupine.
//
// KAJ SE POŠLJE: izključno oznaka zavihka. Ne pot, ne poizvedba, ne čas zadrževanja — celo naslov
// se pred preslikavo odreže na poti (`tab-for-url.ts`), tako da `?q=tajno` do strežnika ne pride.

/** Koliko časa isti zavihek ne pošljemo znova. Strežnik ima svoje, merodajno okno
 * (`USAGE_VIEW_DEDUPE_SECONDS`); to je samo vljudnost do omrežja, da osvežitev strani ne pomeni
 * zahteve, za katero vnaprej vemo, da bo vrnila `counted: false`. */
const CLIENT_SUPPRESS_MS = 30_000;

@Injectable({ providedIn: 'root' })
export class UsageTrackerService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly tabs = inject(TabRegistryService);

  private lastTabId: string | null = null;
  private lastSentAt = 0;
  private started = false;

  /** Kliče se enkrat, iz `AppComponent`. Ponovni klic nima učinka. */
  start(): void {
    if (this.started) return;
    this.started = true;

    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => void this.record(event.urlAfterRedirects));
  }

  private async record(url: string): Promise<void> {
    try {
      // Na zaslonu za prijavo ni česa meriti in `GET /tabs` se brez seje ne kliče.
      if (!this.auth.isAuthenticated()) return;

      await this.tabs.ensureLoaded();
      const tabId = tabIdForUrl(url, this.tabs.tabs());
      // Javne strani in podstrani brez zavihka se ne pošiljajo. Strežnik bi jih tako ali tako
      // zavrnil s 400 (neznana oznaka) — pošiljati zahtevo, za katero vemo, da bo zavrnjena, pa
      // je samo hrup v dnevniku.
      if (!tabId) return;

      const now = Date.now();
      if (tabId === this.lastTabId && now - this.lastSentAt < CLIENT_SUPPRESS_MS) return;
      this.lastTabId = tabId;
      this.lastSentAt = now;

      await new Promise<void>((resolve) => {
        this.http
          .post(apiUrl('/usage/views'), { tabId }, { withCredentials: true })
          .subscribe({ next: () => resolve(), error: () => resolve() });
      });
    } catch {
      // POŠLJI IN POZABI (FR-029). Neuspelo štetje ne sme upočasniti ali preprečiti prikaza
      // zaslona in uporabniku ne sme biti vidno kot napaka — nima kaj ukreniti in za okvaro
      // telemetrije ni kriv.
    }
  }
}

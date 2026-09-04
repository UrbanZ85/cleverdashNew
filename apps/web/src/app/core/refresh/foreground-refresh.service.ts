import { Injectable, NgZone, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

// FR-022, research.md §8: osveževanje teče samo, ko je zaslon v ospredju. Naprava v žepu
// ne sme generirati zahtev (člen VIII). Ob vrnitvi v ospredju je prva osvežitev takojšnja,
// nato se nadaljuje v intervalu, ki ga vsakič pove strežnik (SourceMeta), ne fiksna
// konstanta na odjemalcu — TTL se lahko spremeni, ne da bi bilo treba objaviti nov build.
export type PollFn = () => Promise<{ intervalMs: number }>;

export interface RefreshOptions {
  /**
   * Osveži tudi ob navigaciji ZNOTRAJ aplikacije, ne le ob vrnitvi zavihka v ospredje.
   *
   * Zakaj to ni privzeto vklopljeno in zakaj sploh obstaja (najdeno v uporabi, 010):
   * `ion-router-outlet` strani PREDPOMNI. Klik na "Nadzorna plošča" zato ne ustvari nove
   * komponente, `ngOnInit` se ne izvede znova, `visibilitychange` pa se ob navigaciji znotraj
   * aplikacije sploh ne sproži — zavihek brskalnika ves čas ostane viden. Ploščica torej kaže
   * podatek izpred prvega obiska, dokler uporabnik ne osveži cele strani (F5).
   *
   * Za ploščice zunanjih virov (vreme, radar) to ni bilo opazno: njihov podatek se spreminja
   * počasi in ima na strežniku predpomnilnik. Za opravila je usodno — uporabnik odkljuka na
   * zavihku, se vrne na nadzorno ploščo in vidi staro stanje.
   *
   * Cena vklopa je ena dodatna zahteva na navigacijo (tudi ob odhodu s strani, ker predpomnjena
   * komponenta še živi). Zato je izbirno in ne privzeto — druge ploščice imajo isto omejitev,
   * a je pri njih strošek večji od koristi.
   */
  refreshOnNavigation?: boolean;
}

@Injectable({ providedIn: 'root' })
export class ForegroundRefreshService {
  private readonly zone = inject(NgZone);
  private readonly router = inject(Router);

  /** Registrira periodično osveževanje. Vrne funkcijo za odjavo (kliči jo v `ngOnDestroy`). */
  register(fn: PollFn, options: RefreshOptions = {}): () => void {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    let inForeground = this.isForeground();

    const clearPending = () => {
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
    };

    const scheduleNext = (intervalMs: number) => {
      if (stopped || !inForeground) return;
      timer = setTimeout(() => void tick(), intervalMs);
    };

    const tick = async () => {
      if (stopped || !inForeground) return;
      // Počakajoči časovnik se pobriše PRED osvežitvijo: brez tega bi vsaka osvežitev, ki je
      // ne sproži časovnik (vrnitev v ospredje, navigacija), pustila starega teči in bi se
      // število vzporednih zahtev z vsakim preklopom podvojilo.
      clearPending();
      try {
        const { intervalMs } = await fn();
        scheduleNext(intervalMs);
      } catch {
        // Napaka pri osveževanju ni razlog za tih obup — poskusi znova čez minuto.
        // Sama ploščica prikaže zadnji znani podatek (FR-026), ne ta storitev.
        scheduleNext(60_000);
      }
    };

    const onForeground = () => {
      if (inForeground) return;
      inForeground = true;
      void tick(); // takojšnja osvežitev ob vrnitvi (FR-022)
    };

    const onBackground = () => {
      inForeground = false;
      clearPending();
    };

    let cleanupPlatform: () => void;

    if (Capacitor.isNativePlatform()) {
      const listenerPromise = App.addListener('appStateChange', ({ isActive }) => {
        this.zone.run(() => (isActive ? onForeground() : onBackground()));
      });
      cleanupPlatform = () => void listenerPromise.then((l) => l.remove());
    } else {
      const handler = () => (document.visibilityState === 'visible' ? onForeground() : onBackground());
      document.addEventListener('visibilitychange', handler);
      cleanupPlatform = () => document.removeEventListener('visibilitychange', handler);
    }

    const navigation = options.refreshOnNavigation
      ? this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => void tick())
      : null;

    if (inForeground) void tick();

    return () => {
      stopped = true;
      clearPending();
      cleanupPlatform();
      navigation?.unsubscribe();
    };
  }

  private isForeground(): boolean {
    // Na nativni napravi privzeto štejemo za aktivno; appStateChange popravi takoj, če ni.
    if (Capacitor.isNativePlatform()) return true;
    return document.visibilityState === 'visible';
  }
}

import { Injectable, NgZone, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

// FR-022, research.md §8: osveževanje teče samo, ko je zaslon v ospredju. Naprava v žepu
// ne sme generirati zahtev (člen VIII). Ob vrnitvi v ospredje je prva osvežitev takojšnja,
// nato se nadaljuje v intervalu, ki ga vsakič pove strežnik (SourceMeta), ne fiksna
// konstanta na odjemalcu — TTL se lahko spremeni, ne da bi bilo treba objaviti nov build.
export type PollFn = () => Promise<{ intervalMs: number }>;

@Injectable({ providedIn: 'root' })
export class ForegroundRefreshService {
  private readonly zone = inject(NgZone);

  /** Registrira periodično osveževanje. Vrne funkcijo za odjavo (kliči jo v `ngOnDestroy`). */
  register(fn: PollFn): () => void {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    let inForeground = this.isForeground();

    const scheduleNext = (intervalMs: number) => {
      if (stopped || !inForeground) return;
      timer = setTimeout(() => void tick(), intervalMs);
    };

    const tick = async () => {
      if (stopped || !inForeground) return;
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
      if (timer) clearTimeout(timer);
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

    if (inForeground) void tick();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      cleanupPlatform();
    };
  }

  private isForeground(): boolean {
    // Na nativni napravi privzeto štejemo za aktivno; appStateChange popravi takoj, če ni.
    if (Capacitor.isNativePlatform()) return true;
    return document.visibilityState === 'visible';
  }
}

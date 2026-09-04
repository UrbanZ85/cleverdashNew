import { Injectable, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Network } from '@capacitor/network';

// research.md §9, Story 7: zaznava mobilnega omrežja. `@capacitor/network` na Androidu,
// `navigator.connection` (Network Information API) kot spletni približek — brskalniki brez
// podpore privzeto NISO obravnavani kot mobilni (da ne omejujejo po nepotrebnem namizne rabe).

export type NetworkKind = 'wifi' | 'cellular' | 'unknown';

export function isMobileNetwork(kind: NetworkKind): boolean {
  return kind === 'cellular';
}

/** Ali za to kombinacijo omrežja in nastavitve velja podatkovni prihranek (Story 7). */
export function shouldApplyDataSaver(kind: NetworkKind, dataSaverEnabled: boolean): boolean {
  return dataSaverEnabled && isMobileNetwork(kind);
}

// Dokumentiran privzetek na odjemalcu (ne strežniška konfiguracija — glej
// CAMERA_DEGRADED_REFRESH_MULTIPLIER za analogen, a ločen strežniški primer za
// nedosegljive kamere, research.md §13). Namenoma zmeren, ne agresiven: cilj je manj
// zahtev, ne neuporaben zavihek.
export const MOBILE_REFRESH_MULTIPLIER = 3;

/** SC-007: na mobilnem omrežju (s prihrankom) je interval osveževanja daljši. */
export function resolveRefreshIntervalMs(baseIntervalMs: number, kind: NetworkKind, dataSaverEnabled: boolean): number {
  return shouldApplyDataSaver(kind, dataSaverEnabled) ? baseIntervalMs * MOBILE_REFRESH_MULTIPLIER : baseIntervalMs;
}

/** Story 7, sprejemni scenarij 2: živi tok se na mobilnem omrežju ne zažene samodejno. */
export function shouldAutoplayLiveStream(kind: NetworkKind, dataSaverEnabled: boolean): boolean {
  return !shouldApplyDataSaver(kind, dataSaverEnabled);
}

function readWebConnectionKind(): NetworkKind {
  const connection = (navigator as unknown as { connection?: { type?: string } }).connection;
  const type = connection?.type;
  if (type === 'cellular') return 'cellular';
  if (type === 'wifi' || type === 'ethernet') return 'wifi';
  return 'unknown';
}

@Injectable({ providedIn: 'root' })
export class NetworkStatusService {
  private readonly kindSignal = signal<NetworkKind>('unknown');

  readonly kind = this.kindSignal.asReadonly();

  constructor() {
    void this.init();
  }

  private async init(): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      const status = await Network.getStatus();
      this.kindSignal.set(status.connectionType === 'cellular' ? 'cellular' : status.connectionType === 'wifi' ? 'wifi' : 'unknown');
      await Network.addListener('networkStatusChange', (s) => {
        this.kindSignal.set(s.connectionType === 'cellular' ? 'cellular' : s.connectionType === 'wifi' ? 'wifi' : 'unknown');
      });
      return;
    }
    this.kindSignal.set(readWebConnectionKind());
    const connection = (navigator as unknown as { connection?: EventTarget }).connection;
    connection?.addEventListener?.('change', () => this.kindSignal.set(readWebConnectionKind()));
  }
}

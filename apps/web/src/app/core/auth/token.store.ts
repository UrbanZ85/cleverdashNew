import { Injectable, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

// research.md §7: dostopni žeton živi samo v pomnilniku odjemalca (nikoli na disku). V
// brskalniku je obnovitveni žeton httpOnly piškotek — odjemalec ga sploh ne vidi, zato tu
// zanj ni kode. Na Androidu ni piškotkov, zato se hrani prek Capacitor Preferences.
//
// Opomba: Preferences ni namenski "secure storage" (Keystore-backed) vtičnik — za višjo
// stopnjo zaščite je to mesto, kjer bi se pozneje zamenjalo za @capacitor/secure-storage-plugin
// ali enakovreden. Za 001 zadošča, ker je obnovitveni žeton kratkoživ prek rotacije (FR-011)
// in preklican ob zaznani zlorabi (FR-012).
const REFRESH_KEY = 'cd_refresh_token';

@Injectable({ providedIn: 'root' })
export class TokenStore {
  private readonly accessTokenSignal = signal<string | null>(null);

  readonly accessToken = this.accessTokenSignal.asReadonly();

  setAccessToken(token: string | null): void {
    this.accessTokenSignal.set(token);
  }

  isAndroid(): boolean {
    return Capacitor.getPlatform() === 'android';
  }

  async getRefreshToken(): Promise<string | null> {
    if (!this.isAndroid()) return null; // v brskalniku je v httpOnly piškotku
    const { value } = await Preferences.get({ key: REFRESH_KEY });
    return value;
  }

  async setRefreshToken(token: string | null): Promise<void> {
    if (!this.isAndroid()) return;
    if (token) {
      await Preferences.set({ key: REFRESH_KEY, value: token });
    } else {
      await Preferences.remove({ key: REFRESH_KEY });
    }
  }

  clear(): void {
    this.accessTokenSignal.set(null);
    void this.setRefreshToken(null);
  }
}

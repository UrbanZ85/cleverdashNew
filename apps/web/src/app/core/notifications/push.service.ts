import { Injectable, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { apiUrl } from '../api/api-base.js';

// FR-030: registrira napravo za potisna obvestila in žeton pošlje strežniku.
//
// Web push (PWA) zahteva ločeno nastavitev (VAPID ključ, service worker za sprejem v
// ozadju) — to je zunaj obsega 001, ki dostavi pot za Android. Klic na webu je zato
// tiho no-op, ne napaka; FR-030 velja za platformo, kjer je dejansko izvedljiv.
@Injectable({ providedIn: 'root' })
export class PushService {
  private readonly http = inject(HttpClient);
  private listenersRegistered = false;

  /** Kliče se PO tem, ko uporabnik privoli v razlago (permission-rationale.component.ts)
   * — sistemski poziv za dovoljenje pride šele znotraj `PushNotifications.register()`. */
  async register(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;

    const permission = await PushNotifications.checkPermissions();
    if (permission.receive !== 'granted') {
      const requested = await PushNotifications.requestPermissions();
      if (requested.receive !== 'granted') return;
    }

    this.registerListeners();
    await PushNotifications.register();
  }

  private registerListeners(): void {
    if (this.listenersRegistered) return;
    this.listenersRegistered = true;

    PushNotifications.addListener('registration', (token) => {
      void this.sendTokenToServer(token.value);
    });

    PushNotifications.addListener('registrationError', (err) => {
      console.error('Registracija naprave za obvestila je spodletela:', err);
    });
  }

  private async sendTokenToServer(pushToken: string): Promise<void> {
    try {
      await firstValueFrom(
        this.http.post(apiUrl('/devices'), { pushToken, platform: 'android' }, { withCredentials: true }),
      );
    } catch {
      // Neuspeh registracije naprave ni usoden za uporabo aplikacije — poskusi znova ob
      // naslednjem zagonu (register() se pokliče spet, žeton je pri ponovni registraciji
      // FCM lahko enak ali nov; strežnik FR-030 obravnava oboje kot posodobitev).
    }
  }
}

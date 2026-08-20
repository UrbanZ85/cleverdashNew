import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { PushNotifications, type ActionPerformed } from '@capacitor/push-notifications';

// FR-033: tapkanje na obvestilo odpre zaslon, na katerega se obvestilo nanaša.
// `deepLink` je podatkovno polje obvestila, ki ga strežnik nastavi ob pošiljanju
// (glej apps/api/src/platform/notifications/router.ts, POST /notifications/test).
@Injectable({ providedIn: 'root' })
export class DeepLinkHandler {
  private readonly router = inject(Router);
  private initialized = false;

  init(): void {
    if (this.initialized || !Capacitor.isNativePlatform()) return;
    this.initialized = true;

    PushNotifications.addListener('pushNotificationActionPerformed', (action: ActionPerformed) => {
      const deepLink = action.notification.data?.['deepLink'];
      if (typeof deepLink === 'string' && deepLink.startsWith('/')) {
        void this.router.navigateByUrl(deepLink);
      }
    });
  }
}

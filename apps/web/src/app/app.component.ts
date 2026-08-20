import { Component, effect, inject } from '@angular/core';
import { IonApp, IonRouterOutlet, IonSplitPane } from '@ionic/angular/standalone';
import { SideMenuComponent } from './shared/navigation/side-menu.component.js';
import { BottomTabsComponent } from './shared/navigation/bottom-tabs.component.js';
import { AuthService } from './core/auth/auth.service.js';
import { ThemeService } from './core/theme/theme.service.js';
import { DeepLinkHandler } from './core/notifications/deep-link.handler.js';
import { PermissionRationaleComponent } from './core/notifications/permission-rationale.component.js';

// FR-002, FR-004: stranski meni na širših zaslonih (ion-split-pane skrije meni v hamburger
// pod pragom), spodnja vrstica zavihkov na ozkih. Oba berejo isti razrešen register — glej
// TabRegistryService. Prikažeta se šele po prijavi: na zaslonu za prijavo meni ne obstaja
// in `GET /tabs` se ne kliče brez razloga. Isto velja za temo (FR-006) in razlago za
// obvestila (FR-031) — obe pripravita, ko obstaja seja.
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [IonApp, IonRouterOutlet, IonSplitPane, SideMenuComponent, BottomTabsComponent, PermissionRationaleComponent],
  template: `
    <ion-app>
      @if (auth.isAuthenticated()) {
        <ion-split-pane contentId="main-content">
          <app-side-menu></app-side-menu>
          <div class="ion-page" id="main-content">
            <ion-router-outlet></ion-router-outlet>
            <app-bottom-tabs></app-bottom-tabs>
            <app-permission-rationale></app-permission-rationale>
          </div>
        </ion-split-pane>
      } @else {
        <ion-router-outlet></ion-router-outlet>
      }
    </ion-app>
  `,
})
export class AppComponent {
  protected readonly auth = inject(AuthService);
  private readonly theme = inject(ThemeService);
  private readonly deepLinks = inject(DeepLinkHandler);
  private wasAuthenticated = false;

  constructor() {
    this.deepLinks.init(); // globalni poslušalec; no-op na webu (Capacitor.isNativePlatform())

    effect(() => {
      const authenticated = this.auth.isAuthenticated();
      if (authenticated && !this.wasAuthenticated) {
        void this.theme.load();
      }
      this.wasAuthenticated = authenticated;
    });
  }
}

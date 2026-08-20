import { Component, inject } from '@angular/core';
import { IonApp, IonRouterOutlet, IonSplitPane } from '@ionic/angular/standalone';
import { SideMenuComponent } from './shared/navigation/side-menu.component.js';
import { BottomTabsComponent } from './shared/navigation/bottom-tabs.component.js';
import { AuthService } from './core/auth/auth.service.js';

// FR-002, FR-004: stranski meni na širših zaslonih (ion-split-pane skrije meni v hamburger
// pod pragom), spodnja vrstica zavihkov na ozkih. Oba berejo isti razrešen register — glej
// TabRegistryService. Prikažeta se šele po prijavi: na zaslonu za prijavo meni ne obstaja
// in `GET /tabs` se ne kliče brez razloga.
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [IonApp, IonRouterOutlet, IonSplitPane, SideMenuComponent, BottomTabsComponent],
  template: `
    <ion-app>
      @if (auth.isAuthenticated()) {
        <ion-split-pane contentId="main-content">
          <app-side-menu></app-side-menu>
          <div class="ion-page" id="main-content">
            <ion-router-outlet></ion-router-outlet>
            <app-bottom-tabs></app-bottom-tabs>
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
}

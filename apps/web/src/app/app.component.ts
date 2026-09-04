import { Component, effect, inject } from '@angular/core';
import { IonApp, IonRouterOutlet, IonSplitPane, IonMenu } from '@ionic/angular/standalone';
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
//
// `<ion-menu>` MORA biti neposreden otrok `<ion-split-pane>`. Prej je bil zavit v
// `<app-side-menu>`, in prav to je bil vzrok, da menija ni bilo videti: split-pane je
// razred `split-pane-side` (in s tem `height: 100%`) postavil na ovojno komponento, ne na
// `ion-menu`, ki je zato ostal visok 0 px. Levi stolpec je bil torej rezerviran in prazen —
// natanko to, kar je bilo na posnetku zaslona. Ovojnica je zdaj ZNOTRAJ menija in prispeva
// samo njegovo vsebino.
//
// `when="md"` ni okras. Spodnja vrstica zavihkov je skrita z `ion-hide-md-up` (768 px),
// privzeti prag `ion-split-pane` pa je `lg` (992 px) — med 768 in 992 px torej ni bilo
// NITI spodnje vrstice NITI razprtega menija, in ker takrat še ni bilo gumba za meni
// (glej shared/layout/page-header.component.ts), v tem razponu širin navigacije sploh ni
// bilo mogoče doseči. Oba praga sta zdaj isti.
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    IonApp,
    IonRouterOutlet,
    IonSplitPane,
    IonMenu,
    SideMenuComponent,
    BottomTabsComponent,
    PermissionRationaleComponent,
  ],
  template: `
    <ion-app>
      @if (auth.isAuthenticated()) {
        <ion-split-pane contentId="main-content" when="md">
          <ion-menu contentId="main-content" type="overlay">
            <app-side-menu></app-side-menu>
          </ion-menu>
          <div class="ion-page" id="main-content">
            <div class="outlet-host">
              <ion-router-outlet></ion-router-outlet>
            </div>
            <app-bottom-tabs></app-bottom-tabs>
            <app-permission-rationale></app-permission-rationale>
          </div>
        </ion-split-pane>
      } @else {
        <ion-router-outlet></ion-router-outlet>
      }
    </ion-app>
  `,
  styles: `
    ion-split-pane {
      --side-width: var(--cd-menu-width);
      --side-max-width: var(--cd-menu-width);
      --side-min-width: var(--cd-menu-width);
    }
    #main-content {
      background: var(--ion-background-color);
    }
    /* ion-router-outlet je znotraj .ion-page absolutno pozicioniran (Ionicov structure.css),
       zato NI v toku. Spodnja vrstica zavihkov je bila posledično prvi element v toku in se
       je izrisala na VRHU zaslona, čez glavo strani — na ozkem zaslonu je bila glava (in z
       njo gumb za meni) povsem prekrita. Isti prijem kot Ionicov lastni <ion-tabs>: outlet
       dobi svojega gostitelja s position: relative, ki poje preostalo višino, vrstica
       zavihkov pa ostane navaden element v toku pod njim. */
    .outlet-host {
      position: relative;
      flex: 1 1 0;
      min-height: 0;
      contain: layout size style;
    }
    app-bottom-tabs {
      flex: none;
    }
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

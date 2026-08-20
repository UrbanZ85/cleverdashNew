import { Component, OnInit, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { IonTabBar, IonTabButton, IonIcon, IonLabel } from '@ionic/angular/standalone';
import { TabRegistryService } from '../../core/tabs/tab-registry.service.js';

// FR-004: na ozkem zaslonu je premikanje med zavihki mogoče brez odpiranja menija. Skrita
// je na širših zaslonih prek Ionic razredne mreže (`ion-hide-md-up`) — stranski meni
// (side-menu.component.ts) prevzame njeno vlogo tam.
@Component({
  selector: 'app-bottom-tabs',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, IonTabBar, IonTabButton, IonIcon, IonLabel],
  template: `
    <ion-tab-bar class="ion-hide-md-up">
      @for (tab of tabs(); track tab.id) {
        <ion-tab-button [routerLink]="tab.route" routerLinkActive="tab-selected">
          <ion-icon [name]="tab.icon"></ion-icon>
          <ion-label>{{ tab.title }}</ion-label>
        </ion-tab-button>
      }
    </ion-tab-bar>
  `,
})
export class BottomTabsComponent implements OnInit {
  private readonly tabRegistry = inject(TabRegistryService);
  readonly tabs = this.tabRegistry.tabs;

  ngOnInit(): void {
    void this.tabRegistry.ensureLoaded();
  }
}

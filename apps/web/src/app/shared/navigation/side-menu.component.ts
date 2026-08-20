import { Component, OnInit, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { IonMenu, IonHeader, IonToolbar, IonTitle, IonContent, IonList, IonItem, IonIcon, IonLabel } from '@ionic/angular/standalone';
import { TabRegistryService } from '../../core/tabs/tab-registry.service.js';

// FR-002: meni se sestavi iz razrešenega registra, ne iz trdo napisanega HTML-ja. Stari
// sistem je ta meni prekopiral v tri strani (`belezenje.page.html`, `urnik.component.html`,
// `history.page.html`) — sprememba je zahtevala tri popravke (research.md §6).
@Component({
  selector: 'app-side-menu',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, IonMenu, IonHeader, IonToolbar, IonTitle, IonContent, IonList, IonItem, IonIcon, IonLabel],
  template: `
    <ion-menu contentId="main-content">
      <ion-header>
        <ion-toolbar>
          <ion-title>CleverDash</ion-title>
        </ion-toolbar>
      </ion-header>
      <ion-content>
        <ion-list>
          @for (tab of tabs(); track tab.id) {
            <ion-item [routerLink]="tab.route" routerLinkActive="active-tab" button lines="none">
              <ion-icon [name]="tab.icon" slot="start"></ion-icon>
              <ion-label>{{ tab.title }}</ion-label>
            </ion-item>
          }
        </ion-list>
      </ion-content>
    </ion-menu>
  `,
  styles: `
    .active-tab {
      --background: var(--ion-color-light);
      font-weight: 600;
    }
  `,
})
export class SideMenuComponent implements OnInit {
  private readonly tabRegistry = inject(TabRegistryService);
  readonly tabs = this.tabRegistry.tabs;

  ngOnInit(): void {
    void this.tabRegistry.ensureLoaded();
  }
}

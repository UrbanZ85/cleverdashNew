import { Component, OnInit, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { IonTabBar, IonTabButton, IonIcon, IonLabel } from '@ionic/angular/standalone';
import { TabRegistryService } from '../../core/tabs/tab-registry.service.js';

// FR-004: na ozkem zaslonu je premikanje med zavihki mogoče brez odpiranja menija. Skrita
// je na širših zaslonih prek Ionic razredne mreže (ion-hide-md-up) — stranski meni
// (side-menu.component.ts) prevzame njeno vlogo tam.
@Component({
  selector: 'app-bottom-tabs',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, IonTabBar, IonTabButton, IonIcon, IonLabel],
  template: `
    <ion-tab-bar class="ion-hide-md-up bottom-tabs">
      @for (tab of tabs(); track tab.id) {
        <ion-tab-button [routerLink]="tab.route" routerLinkActive="tab-selected">
          <ion-icon [name]="tab.icon" aria-hidden="true"></ion-icon>
          <ion-label>{{ tab.title }}</ion-label>
        </ion-tab-button>
      }
    </ion-tab-bar>
  `,
  styles: `
    .bottom-tabs {
      --background: var(--cd-surface);
      --border: 1px solid var(--cd-divider);
      --color: var(--cd-text-muted);
      --color-selected: var(--ion-color-primary);
      padding-bottom: env(safe-area-inset-bottom);
    }
    /* routerLinkActive na ion-tab-button ne nastavi Ionicovega notranjega stanja, zato
       izbrano postavko obarvamo sami. */
    .tab-selected {
      color: var(--ion-color-primary);
      font-weight: 650;
    }
    ion-label {
      font-size: var(--cd-font-size-xs);
    }
  `,
})
export class BottomTabsComponent implements OnInit {
  private readonly tabRegistry = inject(TabRegistryService);
  readonly tabs = this.tabRegistry.tabs;

  ngOnInit(): void {
    void this.tabRegistry.ensureLoaded();
  }
}

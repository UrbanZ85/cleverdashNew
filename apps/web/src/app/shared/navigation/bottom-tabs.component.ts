import { Component, OnInit, computed, inject } from '@angular/core';
import { Router, NavigationEnd, RouterLink, RouterLinkActive } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs/operators';
import { IonTabBar, IonTabButton, IonIcon, IonLabel, MenuController } from '@ionic/angular/standalone';
import { TabRegistryService } from '../../core/tabs/tab-registry.service.js';
import { tabSlots } from './tab-slots.js';

// FR-004: na ozkem zaslonu je premikanje med zavihki mogoče brez odpiranja menija. Skrita
// je na širših zaslonih prek Ionic razredne mreže (ion-hide-md-up) — stranski meni
// (side-menu.component.ts) prevzame njeno vlogo tam.
//
// Register ima privzeto sedem vklopljenih zavihkov, uporabnik pa jih lahko vklopi še več
// (settings/menu-section.component.ts). Vsi naenkrat v vrstico ne gredo: `ion-tab-bar` jih
// razdeli na enake dele in pri sedmih ostane vsakemu ~51 px, kar iz "Evidenca delovnega
// časa" naredi tri pike. Zato jih vrstica pokaže samo toliko, kolikor jih je berljivih,
// ostale pa prevzame meni pod zadnjim gumbom ("Več").
//
// Zavihek, na katerem uporabnik JE, je vedno med vidnimi — tudi če je po vrstnem redu
// zadaj. Brez tega bi bila vrstica ob odprti Evidenci videti, kot da ni izbrano nič.
@Component({
  selector: 'app-bottom-tabs',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, IonTabBar, IonTabButton, IonIcon, IonLabel],
  template: `
    <ion-tab-bar class="ion-hide-md-up bottom-tabs">
      @for (tab of visibleTabs(); track tab.id) {
        <ion-tab-button [routerLink]="tab.route" routerLinkActive="tab-selected">
          <ion-icon [name]="tab.icon" aria-hidden="true"></ion-icon>
          <ion-label>{{ tab.title }}</ion-label>
        </ion-tab-button>
      }
      @if (hasOverflow()) {
        <ion-tab-button (click)="openMenu()" aria-label="Več zavihkov">
          <ion-icon name="ellipsis-horizontal-outline" aria-hidden="true"></ion-icon>
          <ion-label>Več</ion-label>
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
    /* Naslov ostane v ENI vrstici: prelom v dve (npr. "Beleženje / časa") zraste čez višino
       vrstice in potisne ikono izven gumba. Predolg naslov se obreže s tremi pikami.
       min-width: 0 na gumbu ni okras — flex postavka se privzeto ne skrči pod širino svoje
       vsebine, in ker je vsebina naslov v eni vrstici, je "Evidenca delovnega časa" gumb
       razpotegnila na 168 px in vrstico potisnila čez rob zaslona (zadnji gumb je ostal
       zunaj). Z ničelno mejo se gumbi razdelijo enako, naslov pa se obreže. */
    ion-tab-button {
      min-width: 0;
    }
    ion-label {
      max-width: 100%;
      font-size: var(--cd-font-size-xs);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `,
})
export class BottomTabsComponent implements OnInit {
  private readonly tabRegistry = inject(TabRegistryService);
  private readonly menu = inject(MenuController);
  private readonly router = inject(Router);

  readonly tabs = this.tabRegistry.tabs;

  /** Trenutna pot. Signal in ne `router.url`, ker mora razporeditev slediti navigaciji:
   * zavihek, na katerem smo, mora ostati med vidnimi (glej tab-slots.ts). */
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  private readonly slots = computed(() => tabSlots(this.tabs(), this.url()));

  readonly visibleTabs = computed(() => this.slots().visible);
  readonly hasOverflow = computed(() => this.slots().overflow);

  ngOnInit(): void {
    void this.tabRegistry.ensureLoaded();
  }

  async openMenu(): Promise<void> {
    await this.menu.open();
  }
}

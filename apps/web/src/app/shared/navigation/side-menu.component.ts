import { Component, OnInit, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import {
  IonContent,
  IonList,
  IonItem,
  IonIcon,
  IonLabel,
  IonNote,
  IonBadge,
  IonButton,
  IonMenuToggle,
} from '@ionic/angular/standalone';
import { TabRegistryService } from '../../core/tabs/tab-registry.service.js';
import { CurrentUserService } from '../../core/user/current-user.service.js';
import { AuthService } from '../../core/auth/auth.service.js';

// FR-002: meni se sestavi iz razrešenega registra, ne iz trdo napisanega HTML-ja. Stari
// sistem je ta meni prekopiral v tri strani (belezenje.page.html, urnik.component.html,
// history.page.html) — sprememba je zahtevala tri popravke (research.md §6).
//
// Ta komponenta NE vsebuje <ion-menu> — ta je v app.component.ts, ker mora biti neposreden
// otrok <ion-split-pane> (sicer ostane visok 0 px in menija ni videti). Tukaj je samo
// njegova vsebina; gostiteljski element se raztegne prek celotne višine menija.
//
// Vsaka postavka je ovita v ion-menu-toggle: na ozkem zaslonu, kjer je meni prekrivalo, se
// mora po kliku sam zapreti. Brez tega ostane odprt nad novo stranjo.
//
// Postavka lahko pod naslovom pokaže tab.detail — kateri vir modul uporablja in ali ta vir
// živi. To je zahteva "v meniju mora biti vidno, kateri podatki se uporabljajo za beleženje
// časa", rešena tako, da meni ostane popolnoma splošen: podatek prispeva modul sam
// (platform/tabs/extension.ts na strani API-ja), meni ga le izriše.
@Component({
  selector: 'app-side-menu',
  standalone: true,
  imports: [
    RouterLink,
    RouterLinkActive,
    IonContent,
    IonList,
    IonItem,
    IonIcon,
    IonLabel,
    IonNote,
    IonBadge,
    IonButton,
    IonMenuToggle,
  ],
  template: `
    <ion-content>
        <div class="brand">
          <img class="brand-mark" src="assets/icon/favicon.png" alt="" aria-hidden="true" />
          <div class="brand-text">
            <span class="brand-name">CleverDash</span>
            <span class="brand-sub">Nadzorna plošča</span>
          </div>
        </div>

        <ion-list class="nav" lines="none">
          @for (tab of tabs(); track tab.id) {
            <ion-menu-toggle [autoHide]="false">
              <ion-item
                class="nav-item"
                [routerLink]="tab.route"
                routerLinkActive="nav-item--active"
                button
                detail="false"
              >
                <ion-icon [name]="tab.icon" slot="start" aria-hidden="true"></ion-icon>
                <ion-label>
                  <span class="nav-title">{{ tab.title }}</span>
                  @if (tab.detail?.subtitle; as sub) {
                    <span class="nav-sub">{{ sub }}</span>
                  }
                </ion-label>
                @if (tab.detail?.statusLabel; as label) {
                  <ion-badge slot="end" [color]="badgeColor(tab.detail?.status)">{{ label }}</ion-badge>
                }
              </ion-item>
            </ion-menu-toggle>
          } @empty {
            <ion-note class="nav-empty">Meni se nalaga …</ion-note>
          }
        </ion-list>
    </ion-content>

    <div class="account">
        <div class="avatar" aria-hidden="true">{{ currentUser.initials() }}</div>
        <div class="account-text">
          <span class="account-name">{{ currentUser.user()?.displayName ?? 'Prijavljen uporabnik' }}</span>
          @if (currentUser.user()?.email; as email) {
            <span class="account-mail">{{ email }}</span>
          }
        </div>
      <ion-button fill="clear" size="small" (click)="logout()" aria-label="Odjava" title="Odjava">
        <ion-icon slot="icon-only" name="log-out-outline"></ion-icon>
      </ion-button>
    </div>
  `,
  styles: `
    /* Gostitelj je vsebina menija: zavzame vso njegovo višino in razdeli prostor med
       seznam (raztegljiv) in blok z uporabnikom (fiksne višine na dnu). min-height: 0 je
       nujen, sicer raztegljivi ion-content preraste starša in blok z uporabnikom odrine
       izven zaslona. */
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
      background: var(--cd-surface);
    }
    ion-content {
      flex: 1 1 auto;
      min-height: 0;
      --background: var(--cd-surface);
    }

    .brand {
      display: flex;
      align-items: center;
      gap: var(--cd-space-3);
      padding: var(--cd-space-5) var(--cd-space-4) var(--cd-space-4);
    }
    .brand-mark {
      width: 34px;
      height: 34px;
      border-radius: var(--cd-radius-sm);
      flex: none;
    }
    .brand-text {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .brand-name {
      font-size: var(--cd-font-size-lg);
      font-weight: 700;
      letter-spacing: -0.02em;
      color: var(--ion-text-color);
    }
    .brand-sub {
      font-size: var(--cd-font-size-xs);
      color: var(--cd-text-muted);
    }

    .nav {
      background: transparent;
      padding: 0 var(--cd-space-2);
    }
    .nav-item {
      --background: transparent;
      --background-hover: var(--cd-surface-sunken);
      --border-radius: var(--cd-radius-md);
      --padding-start: var(--cd-space-3);
      --inner-padding-end: var(--cd-space-2);
      --min-height: 46px;
      margin-bottom: 2px;
      font-size: var(--cd-font-size-md);
    }
    .nav-item ion-icon {
      font-size: 1.2rem;
      margin-inline-end: var(--cd-space-3);
      color: var(--cd-text-muted);
    }
    /* Aktivna postavka: polna barvna ploskev, ne le krepka pisava — na prejšnji različici
       ni bilo mogoče videti, na kateri strani si. */
    .nav-item--active {
      --background: rgba(var(--ion-color-primary-rgb), 0.12);
      --background-hover: rgba(var(--ion-color-primary-rgb), 0.16);
      --color: var(--ion-color-primary);
      font-weight: 650;
    }
    .nav-item--active ion-icon {
      color: var(--ion-color-primary);
    }
    .nav-title {
      display: block;
    }
    .nav-sub {
      display: block;
      font-size: var(--cd-font-size-xs);
      font-weight: 400;
      color: var(--cd-text-muted);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .nav-empty {
      display: block;
      padding: var(--cd-space-3);
      font-size: var(--cd-font-size-sm);
    }

    /* Uporabnik in odjava sta na dnu menija. Gumba za odjavo do zdaj v aplikaciji sploh ni
       bilo — AuthService.logout() je klical le prestreznik ob spodleteli obnovi seje. */
    .account {
      display: flex;
      align-items: center;
      gap: var(--cd-space-3);
      padding: var(--cd-space-3) var(--cd-space-3) var(--cd-space-4);
      border-top: 1px solid var(--cd-divider);
      background: var(--cd-surface);
    }
    .avatar {
      flex: none;
      width: 34px;
      height: 34px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      font-size: var(--cd-font-size-xs);
      font-weight: 700;
      color: var(--ion-color-primary-contrast);
      background: var(--ion-color-primary);
    }
    .account-text {
      display: flex;
      flex-direction: column;
      min-width: 0;
      flex: 1;
    }
    .account-name {
      font-size: var(--cd-font-size-sm);
      font-weight: 600;
      color: var(--ion-text-color);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .account-mail {
      font-size: var(--cd-font-size-xs);
      color: var(--cd-text-muted);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `,
})
export class SideMenuComponent implements OnInit {
  private readonly tabRegistry = inject(TabRegistryService);
  private readonly auth = inject(AuthService);
  protected readonly currentUser = inject(CurrentUserService);
  readonly tabs = this.tabRegistry.tabs;

  ngOnInit(): void {
    void this.tabRegistry.ensureLoaded();
    void this.currentUser.ensureLoaded();
  }

  badgeColor(status: 'ok' | 'warning' | 'danger' | undefined): string {
    return status === 'danger' ? 'danger' : status === 'warning' ? 'warning' : 'success';
  }

  async logout(): Promise<void> {
    this.currentUser.clear();
    await this.auth.logout();
  }
}

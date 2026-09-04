import { Component, OnInit, inject, signal } from '@angular/core';
import { IonContent, IonSegment, IonSegmentButton, IonLabel, IonIcon } from '@ionic/angular/standalone';
import { PageHeaderComponent } from '../../shared/layout/page-header.component.js';
import { HelpButtonComponent } from '../../shared/help/help-button.component.js';
import { ThemeService } from '../../core/theme/theme.service.js';
import { CurrentUserService } from '../../core/user/current-user.service.js';
import { LocationComponent } from './location.component.js';
import { TileArrangementComponent } from './tile-arrangement.component.js';
import { PluginsSettingsComponent } from './plugins-section.component.js';
import { SourcesSettingsComponent } from './sources-section.component.js';
import { CommuteSettingsComponent } from './commute-section.component.js';
import { MenuSettingsComponent } from './menu-section.component.js';
import { TimeTrackingStatusComponent } from './time-tracking-status.component.js';
import { TimeTrackingSettingsComponent } from './time-tracking-section.component.js';
import { TimeTrackingLocationsComponent } from './time-tracking-locations.component.js';
import { WebhooksSettingsComponent } from './webhooks-section.component.js';
import { CamerasSettingsComponent } from './cameras-section.component.js';
import { NotesSettingsComponent } from './notes-section.component.js';

interface SettingsGroup {
  id: string;
  title: string;
  icon: string;
}

// Osebni profil. Registriran kot zavihek "settings" v platform/tabs/registry.ts.
//
// Do zdaj je bila to ena dolga stran s šestimi naslovi <h2> drug pod drugim — z 005 je
// razdelkov devet, kar je za en tok predolgo. Razdeljeni so zato v štiri sklope.
//
// Vsak razdelek ostane samostojna komponenta: moduli prispevajo svoj kos nastavitev, ta
// stran je samo gostitelj (isti dogovor kot doslej — glej time-tracking-section.component.ts).
const GROUPS: SettingsGroup[] = [
  { id: 'dashboard', title: 'Nadzorna plošča', icon: 'apps-outline' },
  { id: 'sources', title: 'Viri podatkov', icon: 'server-outline' },
  { id: 'menu', title: 'Meni', icon: 'list-outline' },
  { id: 'modules', title: 'Moduli', icon: 'settings-outline' },
];

// Sklop "Moduli" je razdeljen po MODULIH, po en zavihek na modul (člen I: zavihek je modul).
// Prej so bili razdelki vseh modulov našteti drug pod drugim in ločeni samo s predpono v
// naslovu ("Beleženje časa — lokacije"); ko je en modul prispeval tri razdelke, je bil ta
// sklop daljši od vseh ostalih skupaj, iskanje kamer pa je pomenilo drsenje čez tuje
// nastavitve. Z zavihkom predpona ni več potrebna — pove jo zavihek.
//
// Seznam je tu, ne iz registra zavihkov: register pove, kateri MODULI obstajajo, ne kateri
// od njih prispevajo nastavitve (modul brez nastavitev bi dobil prazen zavihek). Ko modul
// doda svoj razdelek, doda tudi vnos sem — enako kot doslej doda `<section>`.
const MODULE_TABS: SettingsGroup[] = [
  { id: 'time-tracking', title: 'Beleženje časa', icon: 'time-outline' },
  { id: 'cameras', title: 'Kamere', icon: 'videocam-outline' },
  { id: 'notes', title: 'Beležke', icon: 'reader-outline' },
];

@Component({
  selector: 'app-settings-page',
  standalone: true,
  imports: [
    PageHeaderComponent,
    HelpButtonComponent,
    IonContent,
    IonSegment,
    IonSegmentButton,
    IonLabel,
    IonIcon,
    LocationComponent,
    TileArrangementComponent,
    PluginsSettingsComponent,
    SourcesSettingsComponent,
    CommuteSettingsComponent,
    MenuSettingsComponent,
    TimeTrackingStatusComponent,
    TimeTrackingSettingsComponent,
    TimeTrackingLocationsComponent,
    WebhooksSettingsComponent,
    CamerasSettingsComponent,
    NotesSettingsComponent,
  ],
  template: `
    <app-page-header title="Nastavitve" [subtitle]="currentUser.user()?.displayName ?? null"></app-page-header>

    <ion-content>
      <div class="settings">
        <ion-segment class="groups" [value]="group()" (ionChange)="onGroupChange($event)" scrollable>
          @for (g of groups; track g.id) {
            <ion-segment-button [value]="g.id">
              <ion-icon [name]="g.icon" aria-hidden="true"></ion-icon>
              <ion-label>{{ g.title }}</ion-label>
            </ion-segment-button>
          }
        </ion-segment>

        @switch (group()) {
          @case ('dashboard') {
            <section>
              <h2 class="cd-section-title">
                Moji vtičniki
                <app-help topic="plugin.kind"></app-help>
              </h2>
              <app-plugins-settings></app-plugins-settings>
            </section>
            <section>
              <h2 class="cd-section-title">
                Pot v službo in domov
                <app-help topic="dashboard.commute"></app-help>
              </h2>
              <app-commute-settings></app-commute-settings>
            </section>
            <section>
              <h2 class="cd-section-title">
                Razporeditev ploščic
                <app-help topic="dashboard.arrangement"></app-help>
              </h2>
              <app-tile-arrangement></app-tile-arrangement>
            </section>
            <section>
              <h2 class="cd-section-title">
                Videz
                <app-help topic="dashboard.theme"></app-help>
              </h2>
              <p class="cd-section-hint">Temna tema sledi sistemu, če izbereš “Sistem”.</p>
              <ion-segment [value]="theme.current()" (ionChange)="onThemeChange($event)">
                <ion-segment-button value="system"><ion-label>Sistem</ion-label></ion-segment-button>
                <ion-segment-button value="light"><ion-label>Svetla</ion-label></ion-segment-button>
                <ion-segment-button value="dark"><ion-label>Temna</ion-label></ion-segment-button>
              </ion-segment>
            </section>
          }

          @case ('sources') {
            <section>
              <h2 class="cd-section-title">
                Lokacija za vreme
                <app-help topic="sources.location"></app-help>
              </h2>
              <app-location></app-location>
            </section>
            <section>
              <h2 class="cd-section-title">
                Naslovi virov
                <app-help topic="sources.urls"></app-help>
              </h2>
              <app-sources-settings></app-sources-settings>
            </section>
          }

          @case ('menu') {
            <section>
              <h2 class="cd-section-title">
                Zavihki v meniju
                <app-help topic="menu.tabs"></app-help>
              </h2>
              <app-menu-settings></app-menu-settings>
            </section>
          }

          @case ('modules') {
            <ion-segment
              class="modules"
              [value]="moduleTab()"
              (ionChange)="onModuleTabChange($event)"
              scrollable
            >
              @for (m of moduleTabs; track m.id) {
                <ion-segment-button [value]="m.id">
                  <ion-icon [name]="m.icon" aria-hidden="true"></ion-icon>
                  <ion-label>{{ m.title }}</ion-label>
                </ion-segment-button>
              }
            </ion-segment>

            @switch (moduleTab()) {
              @case ('time-tracking') {
                <!-- Kontrolni seznam pred obrazci: beleženje potrebuje sejo IN lokacijo, kar
                     iz treh ločenih razdelkov ni bilo razvidno. Glej time-tracking-setup.service.ts. -->
                <section>
                  <app-time-tracking-status></app-time-tracking-status>
                </section>
                <section>
                  <h2 class="cd-section-title">
                    Sejni piškotek
                    <app-help topic="timeTracking.session"></app-help>
                  </h2>
                  <app-time-tracking-settings></app-time-tracking-settings>
                </section>
                <section>
                  <h2 class="cd-section-title">
                    Lokacije
                    <app-help topic="timeTracking.locations"></app-help>
                  </h2>
                  <app-time-tracking-locations></app-time-tracking-locations>
                </section>
                <section>
                  <h2 class="cd-section-title">
                    Izhodni webhooki
                    <app-help topic="timeTracking.webhooks"></app-help>
                  </h2>
                  <app-webhooks-settings></app-webhooks-settings>
                </section>
              }

              @case ('cameras') {
                <section>
                  <h2 class="cd-section-title">
                    Poraba podatkov
                    <app-help topic="cameras.dataSaver"></app-help>
                  </h2>
                  <app-cameras-settings></app-cameras-settings>
                </section>
              }

              @case ('notes') {
                <section>
                  <h2 class="cd-section-title">
                    Prepis govora
                    <app-help topic="notes.serverTranscription"></app-help>
                  </h2>
                  <app-notes-settings></app-notes-settings>
                </section>
              }
            }
          }
        }
      </div>
    </ion-content>
  `,
  styles: `
    ion-content {
      --background: var(--ion-background-color);
    }
    .settings {
      padding: var(--cd-space-4);
      max-width: 780px;
      margin: 0 auto;
    }
    .groups {
      margin-bottom: var(--cd-space-4);
    }
    /* Druga raven je vidno podrejena prvi: manjša pisava, brez polne teže. */
    .modules {
      margin-bottom: var(--cd-space-4);
      font-size: 0.9rem;
    }
    .groups ion-icon {
      font-size: 1.1rem;
    }
    section {
      margin-bottom: var(--cd-space-5);
      padding: var(--cd-space-4);
      border: 1px solid var(--cd-divider);
      border-radius: var(--cd-radius-lg);
      background: var(--cd-surface);
    }
    section .cd-section-title:first-child {
      margin-top: 0;
    }
    /* Naslov razdelka in znak "?" v isti vrstici, brez skoka v višini vrstice. */
    .cd-section-title {
      display: flex;
      align-items: center;
      gap: var(--cd-space-1);
    }
  `,
})
export class SettingsPage implements OnInit {
  protected readonly theme = inject(ThemeService);
  protected readonly currentUser = inject(CurrentUserService);

  protected readonly groups = GROUPS;
  readonly group = signal<string>(GROUPS[0]!.id);

  protected readonly moduleTabs = MODULE_TABS;
  readonly moduleTab = signal<string>(MODULE_TABS[0]!.id);

  ngOnInit(): void {
    void this.currentUser.ensureLoaded();
  }

  onGroupChange(event: CustomEvent<{ value?: unknown }>): void {
    const value = event.detail.value;
    if (typeof value === 'string' && GROUPS.some((g) => g.id === value)) {
      this.group.set(value);
    }
  }

  onModuleTabChange(event: CustomEvent<{ value?: unknown }>): void {
    const value = event.detail.value;
    if (typeof value === 'string' && MODULE_TABS.some((m) => m.id === value)) {
      this.moduleTab.set(value);
    }
  }

  onThemeChange(event: CustomEvent<{ value?: unknown }>): void {
    const value = event.detail.value;
    if (value === 'system' || value === 'light' || value === 'dark') {
      void this.theme.setTheme(value);
    }
  }
}

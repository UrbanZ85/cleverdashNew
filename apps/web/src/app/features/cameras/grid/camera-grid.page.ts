import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { RouterLink } from '@angular/router';
import {
  IonContent,
  IonGrid,
  IonRow,
  IonCol,
  IonButton,
  IonIcon,
} from '@ionic/angular/standalone';
import { PageHeaderComponent } from '../../../shared/layout/page-header.component.js';
import { apiUrl } from '../../../core/api/api-base.js';
import { SettingsStore } from '../../../core/settings/settings.store.js';
import { ForegroundRefreshService } from '../../../core/refresh/foreground-refresh.service.js';
import { CameraTileComponent, type CameraTileInput } from './camera-tile.component.js';

interface CameraListResponse {
  cameras: CameraTileInput[];
}

// US1 (P1) 🎯 MVP: mreža predogledov vseh nastavljenih kamer. Osveževanje SAMEGA seznama
// (nove/urejene/izbrisane kamere, FR-032/FR-033) je ločeno od osveževanja posameznega
// posnetka — vsaka ploščica (`camera-tile.component.ts`) upravlja svoj cikel glede na
// lastni `refreshIntervalSeconds` (FR-021: en poziv na ploščico, ne na celo mrežo).
@Component({
  selector: 'app-camera-grid-page',
  standalone: true,
  imports: [
    RouterLink,
    PageHeaderComponent,
    IonContent,
    IonGrid,
    IonRow,
    IonCol,
    IonButton,
    IonIcon,
    CameraTileComponent,
  ],
  template: `
    <app-page-header title="Kamere">
      <ion-button slot="end" fill="clear" [routerLink]="['/cameras/manage']">
        <ion-icon slot="start" name="create-outline" aria-hidden="true"></ion-icon>
        Uredi
      </ion-button>
    </app-page-header>
    <ion-content class="ion-padding">
      @if (cameras().length === 0) {
        <!-- Prazen zaslon je edino, kar uporabnik s še nenastavljenimi kamerami vidi, zato
             mora vsebovati pot naprej — ne le opisa, kje ta pot je. -->
        <div class="empty">
          <ion-icon name="videocam-outline" class="empty-icon" aria-hidden="true"></ion-icon>
          <h2>Ni nastavljenih kamer</h2>
          <p>
            Kamero dodaš na zaslonu za urejanje: nastaviš ji ime, vrsto vira (posnetek, vdelava
            tuje strani ali pretok) in naslov.
          </p>
          <ion-button [routerLink]="['/cameras/manage']">
            <ion-icon slot="start" name="add-outline" aria-hidden="true"></ion-icon>
            Dodaj kamero
          </ion-button>
        </div>
      } @else {
        <ion-grid>
          <ion-row>
            @for (camera of cameras(); track camera.id) {
              <ion-col size="12" size-sm="6" size-md="4">
                <app-camera-tile [camera]="camera" [dataSaverEnabled]="dataSaverEnabled()"></app-camera-tile>
              </ion-col>
            }
          </ion-row>
        </ion-grid>
      }
    </ion-content>
  `,
  styles: `
    .empty {
      max-width: 420px;
      margin: 12vh auto 0;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--cd-space-3);
    }
    .empty-icon {
      font-size: 2.5rem;
      color: var(--cd-text-muted);
    }
    .empty h2 {
      margin: 0;
      font-size: var(--cd-font-size-lg);
      font-weight: 650;
    }
    .empty p {
      margin: 0;
      font-size: var(--cd-font-size-sm);
      line-height: 1.5;
      color: var(--cd-text-muted);
    }
  `,
})
export class CameraGridPage implements OnInit, OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly refresh = inject(ForegroundRefreshService);

  readonly cameras = signal<CameraTileInput[]>([]);
  private readonly settingsStore = inject(SettingsStore);
  readonly dataSaverEnabled = signal(true);
  private unregister?: () => void;

  async ngOnInit(): Promise<void> {
    // Ob napaki shramba obdrži privzetek (vklopljeno) — Assumptions, spec.md.
    await this.settingsStore.ensureLoaded();
    this.dataSaverEnabled.set(this.settingsStore.settings().cameraDataSaverEnabled);
    this.unregister = this.refresh.register(() => this.loadList());
  }

  ngOnDestroy(): void {
    this.unregister?.();
  }

  private async loadList(): Promise<{ intervalMs: number }> {
    try {
      const data = await firstValueFrom(
        this.http.get<CameraListResponse>(apiUrl('/cameras?includeInactive=false'), { withCredentials: true }),
      );
      this.cameras.set(data.cameras);
    } catch {
      // Seznam ostane, kot je bil — posamezne ploščice imajo svoje varovalke za napake.
    }
    // Sam seznam (nove/urejene/izbrisane kamere) se osveži redkeje kot posnetki
    // posameznih kamer — 60 s je dovolj odzivno za FR-032/FR-033 brez odvečnih klicev.
    return { intervalMs: 60_000 };
  }
}

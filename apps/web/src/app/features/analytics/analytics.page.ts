import { Component, OnInit, inject, signal } from '@angular/core';
import {
  IonButton,
  IonContent,
  IonIcon,
  IonSegment,
  IonSegmentButton,
  IonLabel,
  IonText,
} from '@ionic/angular/standalone';
import { PageHeaderComponent } from '../../shared/layout/page-header.component.js';
import { AnalyticsApi } from './analytics.api.js';
import { AnalyticsStoragePanelComponent } from './storage-panel.component.js';
import { AnalyticsUsagePanelComponent } from './usage-panel.component.js';
import type { StorageSnapshot, UsageSnapshot } from './analytics.model.js';

// Zavihek "Analitika" (platform/tabs/registry.ts, id `analytics`) — EDINI zavihek, ki ga vidi samo
// administrator. Do te strani navaden uporabnik ne pride: zavihka ni v `GET /tabs`, zato ga
// `tabGuard` ne spusti skozi, in tudi če bi, bi strežnik vrnil 403.
//
// Dva segmenta, ker sta vprašanji dve in se ne mešata: "koliko prostora je porabljenega" in "kdo
// aplikacijo uporablja". Vsak se naloži šele, ko je odprt — pregled porabe je drago seštevanje in
// ga ni razloga računati, če bralca zanima uporaba.

@Component({
  selector: 'app-analytics-page',
  standalone: true,
  imports: [
    PageHeaderComponent,
    AnalyticsStoragePanelComponent,
    AnalyticsUsagePanelComponent,
    IonContent,
    IonSegment,
    IonSegmentButton,
    IonLabel,
    IonButton,
    IonIcon,
    IonText,
  ],
  template: `
    <app-page-header title="Analitika"></app-page-header>

    <ion-content class="ion-padding">
      <ion-segment [value]="tab()" (ionChange)="switchTab($any($event.detail.value))">
        <ion-segment-button value="storage"><ion-label>Prostor</ion-label></ion-segment-button>
        <ion-segment-button value="usage"><ion-label>Uporaba</ion-label></ion-segment-button>
      </ion-segment>

      @if (error(); as message) {
        <ion-text color="danger"><p>{{ message }}</p></ion-text>
      }

      @if (tab() === 'storage') {
        <div class="actions">
          <ion-button size="small" fill="outline" [disabled]="loading()" (click)="loadStorage(true)">
            <ion-icon slot="start" name="refresh-outline"></ion-icon>
            Preračunaj zdaj
          </ion-button>
        </div>
        @if (loading() && !storage()) {
          <div class="cd-skeleton row-skeleton"></div>
          <div class="cd-skeleton row-skeleton"></div>
        }
        <app-analytics-storage-panel [data]="storage()"></app-analytics-storage-panel>
      } @else {
        @if (loading() && !usage()) {
          <div class="cd-skeleton row-skeleton"></div>
          <div class="cd-skeleton row-skeleton"></div>
        }
        <app-analytics-usage-panel
          [data]="usage()"
          [days]="days()"
          (daysChange)="changeDays($event)"
        ></app-analytics-usage-panel>
      }
    </ion-content>
  `,
  styles: [
    `
      .actions { display: flex; justify-content: flex-end; margin: 12px 0 4px; }
      .row-skeleton { height: 48px; margin: 8px 0; border-radius: 8px; }
    `,
  ],
})
export class AnalyticsPage implements OnInit {
  private readonly api = inject(AnalyticsApi);

  protected readonly tab = signal<'storage' | 'usage'>('storage');
  protected readonly days = signal(30);
  protected readonly storage = signal<StorageSnapshot | null>(null);
  protected readonly usage = signal<UsageSnapshot | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  ngOnInit(): void {
    void this.loadStorage(false);
  }

  protected switchTab(value: 'storage' | 'usage'): void {
    this.tab.set(value);
    if (value === 'usage' && !this.usage()) void this.loadUsage();
    if (value === 'storage' && !this.storage()) void this.loadStorage(false);
  }

  protected changeDays(days: number): void {
    this.days.set(days);
    void this.loadUsage();
  }

  protected async loadStorage(fresh: boolean): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.storage.set(await this.api.storage(fresh));
    } catch {
      // Napaka se POKAŽE in ne samo zabeleži (člen VII). Zaslon brez podatkov in brez razlage je
      // neločljiv od namestitve, v kateri ni ničesar.
      this.error.set('Pregleda porabe ni bilo mogoče naložiti.');
    } finally {
      this.loading.set(false);
    }
  }

  protected async loadUsage(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.usage.set(await this.api.usage(this.days()));
    } catch {
      this.error.set('Statistike uporabe ni bilo mogoče naložiti.');
    } finally {
      this.loading.set(false);
    }
  }
}

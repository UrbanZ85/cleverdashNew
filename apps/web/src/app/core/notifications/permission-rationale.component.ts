import { Component, OnInit, inject, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { IonButton, IonText } from '@ionic/angular/standalone';
import { PushService } from './push.service.js';

const SHOWN_KEY = 'cd_notification_rationale_shown';

// FR-031: na Androidu 13+ se za dovoljenje za obvestila vpraša ob prvem zagonu, Z RAZLAGO
// PRED sistemskim pozivom. Zavrnitev na Androidu 13+ je praktično dokončna (uporabnik jo
// lahko prekliče le v sistemskih nastavitvah), zato razlaga pride prej, ne po dejstvu.
@Component({
  selector: 'app-permission-rationale',
  standalone: true,
  imports: [IonButton, IonText],
  template: `
    @if (visible()) {
      <div class="rationale">
        <ion-text>
          <p>
            CleverDash lahko pošilja obvestila o pomembnih dogodkih (npr. o stanju sistema).
            Dovoljenje lahko kadar koli spremeniš v nastavitvah naprave.
          </p>
        </ion-text>
        <ion-button (click)="proceed()">V redu, nadaljuj</ion-button>
        <ion-button fill="clear" (click)="dismiss()">Ne zdaj</ion-button>
      </div>
    }
  `,
})
export class PermissionRationaleComponent implements OnInit {
  private readonly push = inject(PushService);
  readonly visible = signal(false);

  async ngOnInit(): Promise<void> {
    if (Capacitor.getPlatform() !== 'android') return; // FR-031 velja izrecno za Android
    const { value } = await Preferences.get({ key: SHOWN_KEY });
    if (!value) {
      this.visible.set(true);
    }
  }

  async proceed(): Promise<void> {
    await this.markShown();
    this.visible.set(false);
    await this.push.register();
  }

  async dismiss(): Promise<void> {
    await this.markShown();
    this.visible.set(false);
  }

  private async markShown(): Promise<void> {
    await Preferences.set({ key: SHOWN_KEY, value: 'true' });
  }
}

import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { IonList, IonItem, IonLabel, IonInput, IonButton, IonCheckbox, IonNote } from '@ionic/angular/standalone';
import { apiUrl } from '../../core/api/api-base.js';

interface WebhookEndpointView {
  id: string;
  url: string;
  events: string[];
  active: boolean;
}

const ALL_EVENTS = ['action.succeeded', 'action.failed', 'action.missed', 'session.expiring'] as const;

// US11, FR-083: nastavljiv naslov in skrivnost za izhodne webhooke. Skrivnost se prikaže
// samo ob ustvarjanju (enak vzorec kot API ključi iz 001) — glej `app-time-tracking-settings`
// za sejni piškotek, ta komponenta je njegov sosed v istem razdelku Nastavitev.
@Component({
  selector: 'app-webhooks-settings',
  standalone: true,
  imports: [IonList, IonItem, IonLabel, IonInput, IonButton, IonCheckbox, IonNote, FormsModule],
  template: `
    <ion-list>
      @for (webhook of webhooks(); track webhook.id) {
        <ion-item>
          <ion-label>
            <h2>{{ webhook.url }}</h2>
            <p>{{ webhook.events.join(', ') }}</p>
          </ion-label>
          <ion-button color="danger" (click)="remove(webhook.id)">Odstrani</ion-button>
        </ion-item>
      }
    </ion-list>

    <ion-item>
      <ion-input label="Naslov webhooka" type="url" [(ngModel)]="newUrl" placeholder="https://..."></ion-input>
    </ion-item>
    @for (event of allEvents; track event) {
      <ion-item>
        <ion-checkbox [checked]="selectedEvents.has(event)" (ionChange)="toggleEvent(event)">{{ event }}</ion-checkbox>
      </ion-item>
    }
    <ion-button expand="block" (click)="create()">Dodaj webhook</ion-button>

    @if (createdSecret()) {
      <ion-note color="warning">
        Skrivnost (prikazana samo enkrat, shrani jo zdaj): {{ createdSecret() }}
      </ion-note>
    }
  `,
})
export class WebhooksSettingsComponent implements OnInit {
  private readonly http = inject(HttpClient);

  readonly allEvents = ALL_EVENTS;
  readonly webhooks = signal<WebhookEndpointView[]>([]);
  readonly createdSecret = signal<string | null>(null);
  readonly selectedEvents = new Set<string>();

  newUrl = '';

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  private async reload(): Promise<void> {
    try {
      const webhooks = await firstValueFrom(
        this.http.get<WebhookEndpointView[]>(apiUrl('/time-tracking/webhooks'), { withCredentials: true }),
      );
      this.webhooks.set(webhooks);
    } catch {
      // FR-026 duh — prazen seznam je varno privzeto stanje.
    }
  }

  toggleEvent(event: string): void {
    if (this.selectedEvents.has(event)) this.selectedEvents.delete(event);
    else this.selectedEvents.add(event);
  }

  async create(): Promise<void> {
    if (!this.newUrl || this.selectedEvents.size === 0) return;
    try {
      const res = await firstValueFrom(
        this.http.post<{ secret: string }>(
          apiUrl('/time-tracking/webhooks'),
          { url: this.newUrl, events: [...this.selectedEvents] },
          { withCredentials: true },
        ),
      );
      this.createdSecret.set(res.secret);
      this.newUrl = '';
      this.selectedEvents.clear();
      await this.reload();
    } catch {
      // Prehodna napaka — uporabnik lahko poskusi znova.
    }
  }

  async remove(id: string): Promise<void> {
    try {
      await firstValueFrom(this.http.delete(apiUrl(`/time-tracking/webhooks/${id}`), { withCredentials: true }));
      await this.reload();
    } catch {
      // Prehodna napaka — uporabnik lahko poskusi znova.
    }
  }
}

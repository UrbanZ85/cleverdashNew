import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { IonItem, IonInput, IonButton, IonText } from '@ionic/angular/standalone';
import { apiUrl } from '../../core/api/api-base.js';

// spec.md, Assumptions: privzeta lokacija za vreme je Ljubljana, z možnostjo izbire.
@Component({
  selector: 'app-location',
  standalone: true,
  imports: [FormsModule, IonItem, IonInput, IonButton, IonText],
  template: `
    <ion-item>
      <ion-input label="Lokacija" [(ngModel)]="locationName"></ion-input>
    </ion-item>
    <ion-item>
      <ion-input label="Zemljepisna širina" type="number" [(ngModel)]="latitude"></ion-input>
    </ion-item>
    <ion-item>
      <ion-input label="Zemljepisna dolžina" type="number" [(ngModel)]="longitude"></ion-input>
    </ion-item>
    @if (saved()) {
      <ion-text color="success"><p>Shranjeno.</p></ion-text>
    }
    <ion-button expand="block" [disabled]="saving()" (click)="save()">
      {{ saving() ? 'Shranjujem ...' : 'Shrani lokacijo' }}
    </ion-button>
  `,
})
export class LocationComponent implements OnInit {
  private readonly http = inject(HttpClient);

  locationName = 'Ljubljana';
  latitude = 46.0629;
  longitude = 14.5602;
  readonly saving = signal(false);
  readonly saved = signal(false);

  async ngOnInit(): Promise<void> {
    try {
      const settings = await firstValueFrom(
        this.http.get<{ weather: { locationName: string; latitude: number; longitude: number } }>(
          apiUrl('/settings'),
          { withCredentials: true },
        ),
      );
      this.locationName = settings.weather.locationName;
      this.latitude = settings.weather.latitude;
      this.longitude = settings.weather.longitude;
    } catch {
      // Ostanejo privzete vrednosti (Ljubljana).
    }
  }

  async save(): Promise<void> {
    this.saving.set(true);
    this.saved.set(false);
    try {
      await firstValueFrom(
        this.http.put(
          apiUrl('/settings'),
          { weather: { locationName: this.locationName, latitude: this.latitude, longitude: this.longitude } },
          { withCredentials: true },
        ),
      );
      this.saved.set(true);
    } finally {
      this.saving.set(false);
    }
  }
}

import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonContent,
  IonItem,
  IonInput,
  IonButton,
  IonText,
  IonHeader,
  IonToolbar,
  IonTitle,
} from '@ionic/angular/standalone';
import { AuthService } from '../../core/auth/auth.service.js';

// Z4 v spec.md (P1): prijava z e-pošto in geslom.
// Brez IonPage: v Ionic Angular (za razliko od Ionic React) prehode med stranmi ureja
// ion-router-outlet sam; komponenta ni ovita v posebno ovojnico.
@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [FormsModule, IonHeader, IonToolbar, IonTitle, IonContent, IonItem, IonInput, IonButton, IonText],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>CleverDash — prijava</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <ion-item>
        <ion-input label="E-pošta" type="email" [(ngModel)]="email" autocomplete="username"></ion-input>
      </ion-item>
      <ion-item>
        <ion-input
          label="Geslo"
          type="password"
          [(ngModel)]="password"
          autocomplete="current-password"
        ></ion-input>
      </ion-item>
      @if (error()) {
        <ion-text color="danger"><p>{{ error() }}</p></ion-text>
      }
      <ion-button expand="block" [disabled]="loading()" (click)="submit()">
        {{ loading() ? 'Prijavljam ...' : 'Prijava' }}
      </ion-button>
    </ion-content>
  `,
})
export class LoginPage {
  private readonly auth = inject(AuthService);

  email = '';
  password = '';
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  async submit(): Promise<void> {
    this.error.set(null);
    this.loading.set(true);
    try {
      await this.auth.login(this.email, this.password);
    } catch {
      this.error.set('Napačna e-pošta ali geslo.');
    } finally {
      this.loading.set(false);
    }
  }
}

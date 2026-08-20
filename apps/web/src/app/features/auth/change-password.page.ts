import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
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

// FR-014: sistem zahteva zamenjavo gesla pred prvo uporabo, ker je začetno geslo prišlo
// iz okolja (ADMIN_INITIAL_PASSWORD) in ga administrator torej pozna vnaprej.
@Component({
  selector: 'app-change-password-page',
  standalone: true,
  imports: [FormsModule, IonHeader, IonToolbar, IonTitle, IonContent, IonItem, IonInput, IonButton, IonText],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>Zamenjaj geslo</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <ion-text>
        <p>Pred nadaljevanjem je treba zamenjati začetno geslo.</p>
      </ion-text>
      <ion-item>
        <ion-input
          label="Trenutno geslo"
          type="password"
          [(ngModel)]="currentPassword"
          autocomplete="current-password"
        ></ion-input>
      </ion-item>
      <ion-item>
        <ion-input
          label="Novo geslo (vsaj 12 znakov)"
          type="password"
          [(ngModel)]="newPassword"
          autocomplete="new-password"
        ></ion-input>
      </ion-item>
      @if (error()) {
        <ion-text color="danger"><p>{{ error() }}</p></ion-text>
      }
      <ion-button expand="block" [disabled]="loading()" (click)="submit()">
        {{ loading() ? 'Shranjujem ...' : 'Shrani novo geslo' }}
      </ion-button>
    </ion-content>
  `,
})
export class ChangePasswordPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  currentPassword = '';
  newPassword = '';
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  async submit(): Promise<void> {
    this.error.set(null);
    if (this.newPassword.length < 12) {
      this.error.set('Novo geslo mora imeti vsaj 12 znakov.');
      return;
    }
    this.loading.set(true);
    try {
      await this.auth.changePassword(this.currentPassword, this.newPassword);
      await this.router.navigate(['/']);
    } catch {
      this.error.set('Trenutno geslo ni pravilno.');
    } finally {
      this.loading.set(false);
    }
  }
}

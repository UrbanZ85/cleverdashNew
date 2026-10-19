import { Component, inject, input, output, signal } from '@angular/core';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonModal,
  IonNote,
  IonSelect,
  IonSelectOption,
  IonText,
  IonTitle,
  IonToggle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { UsersApi, type DirectoryUser } from '../../core/users/users.api.js';
import { FlightDealsApi } from './flight-deals.api.js';
import { describeError, type FlightSearch } from './flight-deals.model.js';

// Prejemniki obvestil (US5, FR-040 do FR-044) — po vzoru `recipes/recipe-share-dialog.component.ts`.
// Vloga je ena sama ("prejema obvestila"), zato ni izbire stopnje; `notify` je stikalo, ki osebo
// začasno utiša, ne da bi ji vzelo vpogled v deljene ponudbe. Izbirnik ponudi samo tiste, ki še niso
// na seznamu, z zamaskirano e-pošto iz skupnega imenika.

@Component({
  selector: 'app-flight-recipients-dialog',
  standalone: true,
  imports: [IonModal, IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent, IonList, IonListHeader, IonItem, IonLabel, IonIcon, IonSelect, IonSelectOption, IonNote, IonText, IonToggle],
  template: `
    <ion-modal [isOpen]="isOpen()" (didDismiss)="close()">
      <ng-template>
        <ion-header>
          <ion-toolbar>
            <ion-title>Prejemniki obvestil</ion-title>
            <ion-buttons slot="end"><ion-button (click)="close()">Zapri</ion-button></ion-buttons>
          </ion-toolbar>
        </ion-header>
        <ion-content class="ion-padding">
          <h2 class="title">{{ search().name }}</h2>
          <ion-note class="cd-section-hint">
            Prejemniki dobijo iste dopise kot ti in vidijo ponudbe tega iskanja v razdelku "Deljene ponudbe". Kriterijev
            iskanja ne vidijo in ga ne morejo urejati. Ti dopise prejemaš vedno.
          </ion-note>

          @if (error(); as message) {
            <ion-text color="danger"><p class="msg">{{ message }}</p></ion-text>
          }

          <ion-list lines="full">
            <ion-list-header><ion-label>Osebe</ion-label></ion-list-header>
            @if (search().recipients.length === 0) {
              <ion-item lines="none"><ion-note>Obvestil ne prejema nihče drug.</ion-note></ion-item>
            }
            @for (r of search().recipients; track r.id) {
              <ion-item>
                <ion-label>
                  <h3>{{ r.displayName }}</h3>
                  <p>{{ r.notify ? 'prejema dopise' : 'utišan — vidi ponudbe, dopisov ne dobi' }}</p>
                </ion-label>
                <ion-toggle slot="end" [checked]="r.notify" [disabled]="busy()" (ionChange)="setNotify(r.id, $any($event).detail.checked)" aria-label="Pošiljaj dopise"></ion-toggle>
                <ion-button slot="end" fill="clear" color="danger" [disabled]="busy()" (click)="remove(r.id)">
                  <ion-icon slot="icon-only" name="close-outline" aria-label="Odstrani"></ion-icon>
                </ion-button>
              </ion-item>
            }
            @if (candidates().length > 0) {
              <ion-item>
                <ion-select label="Dodaj osebo" labelPlacement="stacked" interface="popover" placeholder="Izberi …" [disabled]="busy()" (ionChange)="add($any($event).detail.value)">
                  @for (user of candidates(); track user.id) {
                    <ion-select-option [value]="user.id">{{ user.displayName }} ({{ user.emailHint }})</ion-select-option>
                  }
                </ion-select>
              </ion-item>
            } @else {
              <ion-item lines="none"><ion-note>Ni več oseb, ki bi jih lahko dodal.</ion-note></ion-item>
            }
          </ion-list>
        </ion-content>
      </ng-template>
    </ion-modal>
  `,
  styles: [
    `
      .title {
        font-size: 1.05rem;
        margin: 0 0 8px;
      }
      .msg {
        margin: 4px 0;
      }
    `,
  ],
})
export class FlightRecipientsDialogComponent {
  private readonly api = inject(FlightDealsApi);
  private readonly usersApi = inject(UsersApi);

  readonly isOpen = input(false);
  readonly search = input.required<FlightSearch>();
  readonly closed = output<void>();
  readonly changed = output<FlightSearch>();

  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly users = signal<DirectoryUser[]>([]);

  constructor() {
    void this.loadUsers();
  }

  private async loadUsers(): Promise<void> {
    try {
      this.users.set(await this.usersApi.list());
    } catch {
      this.users.set([]);
    }
  }

  candidates(): DirectoryUser[] {
    const taken = new Set(this.search().recipients.map((r) => r.id));
    return this.users().filter((u) => !taken.has(u.id));
  }

  add(userId: string): Promise<void> {
    if (!userId) return Promise.resolve();
    return this.run(() => this.api.setRecipient(this.search().id, userId, true));
  }

  setNotify(userId: string, notify: boolean): Promise<void> {
    return this.run(() => this.api.setRecipient(this.search().id, userId, notify));
  }

  remove(userId: string): Promise<void> {
    return this.run(() => this.api.removeRecipient(this.search().id, userId));
  }

  private async run(action: () => Promise<FlightSearch>): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      this.changed.emit(await action());
    } catch (err) {
      this.error.set(describeError(err, 'Spremembe ni bilo mogoče shraniti.'));
    } finally {
      this.busy.set(false);
    }
  }

  close(): void {
    this.closed.emit();
  }
}

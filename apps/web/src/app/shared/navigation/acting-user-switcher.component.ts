import { Component, computed, inject, signal } from '@angular/core';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonModal,
  IonNote,
  IonSearchbar,
  IonText,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { ActingUserService } from '../../core/acting-user/acting-user.service.js';
import { CurrentUserService } from '../../core/user/current-user.service.js';
import { UsersApi, type DirectoryUser } from '../../core/users/users.api.js';

// 012 — izbirnik "delaj v imenu drugega uporabnika", na dnu menija pod imenom prijavljenega.
//
// Komponenta se NE izriše nikomur brez obsega `admin` (`canActAsOthers`). To ni edina obramba
// — strežnik glavo `X-Acting-User` brez tega obsega zavrne s 403 (platform/auth/acting-user.ts)
// — ampak je tista, ki navadnemu uporabniku ne pokaže gumba, ki bi mu vrnil samo napako.
//
// Živi v `shared/navigation/` in ne v kakem zavihku: prevzem imena velja za CELO aplikacijo,
// ne za en modul, in menija ne sme pripeljati v odvisnost od zavihka, ki ga je mogoče
// odstraniti (člen I).

@Component({
  selector: 'app-acting-user-switcher',
  standalone: true,
  imports: [
    IonModal,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonContent,
    IonSearchbar,
    IonList,
    IonItem,
    IonLabel,
    IonIcon,
    IonNote,
    IonText,
  ],
  template: `
    @if (currentUser.canActAsOthers()) {
      <button
        type="button"
        class="trigger"
        [class.trigger--active]="acting() !== null"
        (click)="open()"
        [attr.aria-label]="acting() ? 'Zamenjaj uporabnika' : 'Delaj v imenu drugega uporabnika'"
      >
        <ion-icon
          class="trigger-icon"
          [name]="acting() ? 'people' : 'people-outline'"
          aria-hidden="true"
        ></ion-icon>
        <span class="trigger-text">
          @if (acting(); as target) {
            <span class="trigger-label">Delaš kot</span>
            <span class="trigger-name">{{ target.displayName }}</span>
          } @else {
            <span class="trigger-name">Delaj kot drug uporabnik</span>
          }
        </span>
        <ion-icon class="trigger-chev" name="chevron-forward-outline" aria-hidden="true"></ion-icon>
      </button>
    }

    <ion-modal [isOpen]="isOpen()" (didDismiss)="close()">
      <ng-template>
        <ion-header>
          <ion-toolbar>
            <ion-title>Delaj kot</ion-title>
            <ion-buttons slot="end">
              <ion-button (click)="close()">Zapri</ion-button>
            </ion-buttons>
          </ion-toolbar>
        </ion-header>

        <ion-content>
          <ion-note class="intro">
            Izbrani uporabnik velja za CELO aplikacijo: nadzorno ploščo, nastavitve, zavihke in
            vse zapise. Vsaka sprememba se shrani njemu, ne tebi. Tvoje ostanejo samo seje,
            naprave za obvestila in API ključi.
          </ion-note>

          <ion-searchbar
            placeholder="Išči po imenu"
            [debounce]="200"
            (ionInput)="search($event)"
          ></ion-searchbar>

          @if (error(); as message) {
            <ion-text color="danger"><p class="msg">{{ message }}</p></ion-text>
          }

          <ion-list lines="full">
            <!-- Vrnitev nase je prva postavka in ne gumb kje drugje: ven iz prevzetega imena je
                 pomembnejša pot kot vstop vanj. -->
            <ion-item button detail="false" [disabled]="acting() === null" (click)="pick(null)">
              <ion-icon slot="start" name="person-circle-outline" aria-hidden="true"></ion-icon>
              <ion-label>
                <h3>{{ currentUser.user()?.displayName ?? 'Svoj račun' }}</h3>
                <p>Delaj v svojem imenu</p>
              </ion-label>
              @if (acting() === null) {
                <ion-icon slot="end" name="checkmark-outline" color="primary" aria-hidden="true"></ion-icon>
              }
            </ion-item>

            @if (loading()) {
              <ion-item><ion-label><div class="cd-skeleton row-skeleton"></div></ion-label></ion-item>
            } @else {
              @for (user of others(); track user.id) {
                <ion-item button detail="false" (click)="pick(user.id)">
                  <span slot="start" class="avatar">{{ user.initials }}</span>
                  <ion-label>
                    <h3>{{ user.displayName }}</h3>
                    <p>{{ user.emailHint }}</p>
                  </ion-label>
                  @if (acting()?.id === user.id) {
                    <ion-icon slot="end" name="checkmark-outline" color="primary" aria-hidden="true"></ion-icon>
                  }
                </ion-item>
              } @empty {
                <ion-item>
                  <ion-label class="cd-muted">
                    <p>Ni drugih uporabnikov, ki bi se že kdaj prijavili.</p>
                  </ion-label>
                </ion-item>
              }
            }
          </ion-list>
        </ion-content>
      </ng-template>
    </ion-modal>
  `,
  styles: `
    .trigger {
      display: flex;
      align-items: center;
      gap: var(--cd-space-3);
      width: 100%;
      margin: 0;
      padding: var(--cd-space-2) var(--cd-space-3);
      border: 0;
      background: transparent;
      color: var(--cd-text-muted);
      font: inherit;
      text-align: start;
      cursor: pointer;
    }
    .trigger:hover {
      background: var(--cd-surface-sunken);
    }
    /* Prevzeto ime je barvno označeno tudi tukaj, ne samo v pasu na vrhu: meni je odprt
       pogosteje kot je pas prebran. */
    .trigger--active {
      color: var(--ion-color-warning-shade);
    }
    .trigger-icon {
      flex: none;
      font-size: 1.15rem;
    }
    .trigger-text {
      display: flex;
      flex-direction: column;
      min-width: 0;
      flex: 1;
    }
    .trigger-label {
      font-size: var(--cd-font-size-xs);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      opacity: 0.8;
    }
    .trigger-name {
      font-size: var(--cd-font-size-sm);
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .trigger-chev {
      flex: none;
      font-size: 1rem;
      opacity: 0.6;
    }

    .intro {
      display: block;
      padding: var(--cd-space-3) var(--cd-space-4) 0;
      font-size: var(--cd-font-size-xs);
    }
    .msg {
      padding: 0 var(--cd-space-4);
      font-size: var(--cd-font-size-sm);
    }
    .avatar {
      width: 30px;
      height: 30px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      font-size: var(--cd-font-size-xs);
      font-weight: 700;
      color: var(--ion-color-primary-contrast);
      background: var(--ion-color-primary);
      margin-inline-end: var(--cd-space-3);
    }
    .row-skeleton {
      height: 1.1rem;
    }
  `,
})
export class ActingUserSwitcherComponent {
  protected readonly currentUser = inject(CurrentUserService);
  private readonly actingUser = inject(ActingUserService);
  private readonly users = inject(UsersApi);

  protected readonly isOpen = signal(false);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  private readonly all = signal<DirectoryUser[]>([]);
  private readonly needle = signal('');

  protected readonly acting = this.currentUser.actingAs;

  /** Vsi razen prijavljenega — ta je že prva postavka ("delaj v svojem imenu"). */
  protected readonly others = computed(() => {
    const selfId = this.currentUser.user()?.id;
    const needle = this.needle().trim().toLocaleLowerCase('sl');
    return this.all()
      .filter((u) => u.id !== selfId)
      .filter((u) => !needle || u.displayName.toLocaleLowerCase('sl').includes(needle));
  });

  async open(): Promise<void> {
    this.isOpen.set(true);
    if (this.all().length > 0) return;
    this.loading.set(true);
    this.error.set(null);
    try {
      // `excludeSelf: false`: strežnik privzeto izpusti tistega, V ČIGAVEM IMENU teče zahteva —
      // med prevzemom imena bi to bil izbrani uporabnik, ne admin, in prav ta bi v seznamu
      // manjkal. Kdo je "jaz", tu odloči odjemalec (`others`), ker ve za oboje.
      this.all.set(await this.users.list({ excludeSelf: false }));
    } catch {
      this.error.set('Seznama uporabnikov ni bilo mogoče naložiti. Poskusi znova.');
    } finally {
      this.loading.set(false);
    }
  }

  close(): void {
    this.isOpen.set(false);
  }

  search(event: Event): void {
    this.needle.set((event as CustomEvent<{ value?: string | null }>).detail.value ?? '');
  }

  /** Preklop stran ponovno naloži (glej ActingUserService.select) — okna zato ni treba zapreti. */
  pick(userId: string | null): void {
    this.actingUser.select(userId);
  }
}

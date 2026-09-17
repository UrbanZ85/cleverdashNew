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
  IonToolbar,
} from '@ionic/angular/standalone';
import { UsersApi, type DirectoryUser } from '../../core/users/users.api.js';
import { RecipesApi } from './recipes.api.js';
import { MEMBER_ROLES, ROLE_HINTS, ROLE_LABELS, type MemberRole, type Recipe } from './recipes.model.js';

// Modalno okno za deljenje (US4, US5).
//
// Okno se odpre samo lastniku (`capabilities.manageSharing`) — vmesnik kontrol, ki jih zmožnosti ne
// dovolijo, sploh ne izriše, namesto da bi jih izrisal in šele strežnik zavrnil (SC-007).
//
// Dva RAZLIČNA načina deljenja sta v istem oknu, a strogo ločena z razdelkoma in besedilom:
// soudeleženci imajo račun in jih je mogoče poimenovati, javna povezava je za nekoga brez računa in
// je ni mogoče poimenovati. Zamenjava teh dveh je natanko tista napaka, zaradi katere človek
// pomotoma razobesi recept na internet, ko ga je hotel poslati sodelavki.

@Component({
  selector: 'app-recipe-share-dialog',
  standalone: true,
  imports: [
    IonModal,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonContent,
    IonList,
    IonListHeader,
    IonItem,
    IonLabel,
    IonIcon,
    IonSelect,
    IonSelectOption,
    IonNote,
    IonText,
  ],
  template: `
    <ion-modal [isOpen]="isOpen()" (didDismiss)="close()">
      <ng-template>
        <ion-header>
          <ion-toolbar>
            <ion-title>Deljenje</ion-title>
            <ion-buttons slot="end">
              <ion-button (click)="close()">Zapri</ion-button>
            </ion-buttons>
          </ion-toolbar>
        </ion-header>

        <ion-content class="ion-padding">
          <h2 class="title">{{ recipe().title }}</h2>

          @if (error(); as message) {
            <ion-text color="danger"><p class="msg">{{ message }}</p></ion-text>
          }

          <!-- ── soudeleženci ─────────────────────────────────────────────────── -->
          <ion-list lines="full">
            <ion-list-header>
              <ion-label>Uporabniki CleverDasha</ion-label>
            </ion-list-header>

            @if (recipe().members.length === 0) {
              <ion-item lines="none">
                <ion-note>Recept ni deljen z nikomer.</ion-note>
              </ion-item>
            }

            @for (member of recipe().members; track member.id) {
              <ion-item>
                <ion-label>
                  <h3>{{ member.displayName }}</h3>
                  <!-- Dokler soudeleženec recepta ni odprl, je to VIDNO lastniku: brez tega ne bi
                       vedel, ali je človek recept sploh dobil (FR-038). -->
                  <p>{{ member.seenAt ? ROLE_HINTS[member.role] : 'Recepta še ni odprl.' }}</p>
                </ion-label>
                <ion-select
                  slot="end"
                  interface="popover"
                  [value]="member.role"
                  [disabled]="busy()"
                  (ionChange)="setRole(member.id, $any($event).detail.value)"
                >
                  @for (role of roles; track role) {
                    <ion-select-option [value]="role">{{ ROLE_LABELS[role] }}</ion-select-option>
                  }
                </ion-select>
                <ion-button slot="end" fill="clear" color="danger" [disabled]="busy()" (click)="remove(member.id)">
                  <ion-icon slot="icon-only" name="close-outline" aria-label="Odstrani"></ion-icon>
                </ion-button>
              </ion-item>
            }

            <!-- Izbirnik ponudi SAMO tiste, ki še niso soudeleženci: človek, ki je že dodan, v
                 seznamu za dodajanje ni odgovor na nobeno vprašanje. -->
            @if (candidates().length > 0) {
              <ion-item>
                <ion-select
                  label="Dodaj osebo"
                  labelPlacement="stacked"
                  interface="popover"
                  placeholder="Izberi …"
                  [disabled]="busy()"
                  (ionChange)="add($any($event).detail.value)"
                >
                  @for (user of candidates(); track user.id) {
                    <ion-select-option [value]="user.id">
                      {{ user.displayName }} ({{ user.emailHint }})
                    </ion-select-option>
                  }
                </ion-select>
              </ion-item>
              <ion-note class="hint">
                Nov soudeleženec dobi pravico ogleda. Urejanje mu lahko daš zgoraj.
              </ion-note>
            } @else {
              <ion-item lines="none">
                <ion-note>Ni več uporabnikov, ki bi jim lahko delil ta recept.</ion-note>
              </ion-item>
            }
          </ion-list>

          <!-- ── javna povezava ───────────────────────────────────────────────── -->
          <ion-list lines="full">
            <ion-list-header>
              <ion-label>Povezava za koga brez računa</ion-label>
            </ion-list-header>

            @if (recipe().publicLink; as link) {
              <ion-item>
                <ion-icon slot="start" name="share-social-outline" aria-hidden="true"></ion-icon>
                <ion-label class="link">
                  <p>{{ link.url }}</p>
                </ion-label>
                <ion-button slot="end" fill="clear" [disabled]="busy()" (click)="copy(link.url)">
                  <ion-icon slot="icon-only" name="copy-outline" aria-label="Kopiraj povezavo"></ion-icon>
                </ion-button>
              </ion-item>
              <ion-note class="hint">
                Kdor koli s to povezavo vidi recept, sestavine, postopek in slike — brez prijave.
                Ne vidi tvojega imena, ocene ne drugih receptov.
              </ion-note>
              <ion-item lines="none">
                <ion-button fill="clear" color="danger" [disabled]="busy()" (click)="revoke()">
                  Prekliči povezavo
                </ion-button>
              </ion-item>
              <ion-note class="hint">
                Preklic je takojšen in nepovraten. Nova povezava bo imela drug naslov — stara ne bo
                oživela.
              </ion-note>
            } @else {
              <ion-item lines="none">
                <ion-button fill="outline" [disabled]="busy()" (click)="createLink()">
                  <ion-icon slot="start" name="share-social-outline" aria-hidden="true"></ion-icon>
                  Ustvari javno povezavo
                </ion-button>
              </ion-item>
              <ion-note class="hint">
                Povezava je samo za branje. Prejemniku ni treba imeti računa.
              </ion-note>
            }
          </ion-list>

          @if (copied()) {
            <ion-text color="success"><p class="msg">Povezava je kopirana.</p></ion-text>
          }
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
      .hint {
        display: block;
        padding: 4px 16px 12px;
        font-size: 0.78rem;
      }
      .link p {
        word-break: break-all;
        font-size: 0.8rem;
      }
    `,
  ],
})
export class RecipeShareDialogComponent {
  private readonly api = inject(RecipesApi);
  private readonly usersApi = inject(UsersApi);

  readonly isOpen = input(false);
  readonly recipe = input.required<Recipe>();

  readonly closed = output<void>();
  /** Vsaka sprememba vrne CEL nov recept; starš ga prevzame in ne nalaga znova. */
  readonly changed = output<Recipe>();

  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly copied = signal(false);
  readonly users = signal<DirectoryUser[]>([]);

  readonly roles = MEMBER_ROLES;
  readonly ROLE_LABELS = ROLE_LABELS;
  readonly ROLE_HINTS = ROLE_HINTS;

  constructor() {
    void this.loadUsers();
  }

  private async loadUsers(): Promise<void> {
    try {
      this.users.set(await this.usersApi.list());
    } catch {
      // Brez imenika deljenja ni mogoče ponuditi, javna povezava pa vseeno deluje — zato to ni
      // napaka celega okna.
      this.users.set([]);
    }
  }

  candidates(): DirectoryUser[] {
    const taken = new Set(this.recipe().members.map((member) => member.id));
    return this.users().filter((user) => !taken.has(user.id));
  }

  async add(userId: string): Promise<void> {
    if (!userId) return;
    // Nov soudeleženec dobi NAJNIŽJO pravico. Privzetek, ki v dvomu da manj, je edini pravilni
    // privzetek za deljenje.
    await this.run(() => this.api.setMember(this.recipe().id, userId, 'view'));
  }

  async setRole(userId: string, role: MemberRole): Promise<void> {
    await this.run(() => this.api.setMember(this.recipe().id, userId, role));
  }

  async remove(userId: string): Promise<void> {
    await this.run(() => this.api.removeMember(this.recipe().id, userId));
  }

  async createLink(): Promise<void> {
    await this.run(() => this.api.createPublicLink(this.recipe().id));
  }

  async revoke(): Promise<void> {
    await this.run(() => this.api.revokePublicLink(this.recipe().id));
  }

  async copy(url: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(url);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2500);
    } catch {
      // Odložišče je lahko zavrnjeno (ni varnega konteksta, ni dovoljenja). Povezava je vidna v
      // besedilu in jo je mogoče označiti ročno, zato to ni napaka, ki bi jo bilo treba javiti.
      this.error.set('Kopiranje ni uspelo — povezavo lahko označiš in kopiraš ročno.');
    }
  }

  private async run(action: () => Promise<Recipe>): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      this.changed.emit(await action());
    } catch (err) {
      const detail = (err as { error?: { detail?: string } })?.error?.detail;
      this.error.set(typeof detail === 'string' && detail.length > 0 ? detail : 'Spremembe ni bilo mogoče shraniti.');
    } finally {
      this.busy.set(false);
    }
  }

  close(): void {
    this.closed.emit();
  }
}

import { Component, computed, inject, input, output, signal } from '@angular/core';
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
  IonSelect,
  IonSelectOption,
  IonText,
  IonTitle,
  IonToggle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { HelpButtonComponent } from '../../shared/help/help-button.component.js';
import { UsersApi, type DirectoryUser } from '../../core/users/users.api.js';
import { TodosApi } from './todos.api.js';
import { ROLE_HINTS, ROLE_LABELS, type MemberRole, type TodoList } from './todos.model.js';

// Modalno okno za deljenje in zaklep (US3, US4).
//
// Zaklep je TU in v meniju seznama, ne v splošnih nastavitvah (FR-060): je lastnost SEZNAMA,
// ne osebe. Ena zastavica v nastavitvah bi zaklenila vse sezname hkrati, kar je natanko
// nasprotno od tega, kar zaklep pomeni.
//
// Okno se odpre samo lastniku (`capabilities.manageSharing`) — vmesnik kontrol, ki jih
// zmožnosti ne dovolijo, sploh ne izriše, namesto da bi jih izrisal in šele strežnik zavrnil.

@Component({
  selector: 'app-todo-share-dialog',
  standalone: true,
  imports: [
    HelpButtonComponent,
    IonModal,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonContent,
    IonList,
    IonItem,
    IonLabel,
    IonIcon,
    IonSelect,
    IonSelectOption,
    IonToggle,
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
          @if (list(); as current) {
            <h2 class="cd-section-title">{{ current.title }}</h2>

            @if (error(); as message) {
              <ion-text color="danger"><p class="msg">{{ message }}</p></ion-text>
            }

            <!-- Zaklep -->
            <ion-list lines="full">
              <ion-item>
                <ion-icon slot="start" name="lock-closed-outline"></ion-icon>
                <ion-toggle
                  [checked]="current.locked"
                  [disabled]="busy()"
                  (ionChange)="toggleLock(current)"
                >
                  Zakleni seznam
                </ion-toggle>
                <app-help slot="end" topic="todos.lock"></app-help>
              </ion-item>
              <ion-note class="hint">
                Ko je seznam zaklenjen, soudeleženci ne morejo spremeniti ničesar — niti
                odkljukati. Ti kot lastnik urejaš naprej.
              </ion-note>
            </ion-list>

            <!-- Trenutni soudeleženci -->
            <h3 class="cd-section-title">
              Soudeleženci <app-help topic="todos.roles"></app-help>
            </h3>
            @if (current.members.length === 0) {
              <p class="cd-muted hint">Seznam ni deljen z nikomer.</p>
            } @else {
              <ion-list lines="full">
                @for (member of current.members; track member.user.id) {
                  <ion-item>
                    <span slot="start" class="avatar">{{ member.user.initials }}</span>
                    <ion-label>
                      <h3>{{ member.user.displayName }}</h3>
                      <p>{{ hint(member.role) }}</p>
                    </ion-label>
                    <ion-select
                      slot="end"
                      interface="popover"
                      [value]="member.role"
                      [disabled]="busy()"
                      (ionChange)="changeRole(current, member.user.id, $event)"
                      aria-label="Stopnja"
                    >
                      @for (role of roles; track role) {
                        <ion-select-option [value]="role">{{ label(role) }}</ion-select-option>
                      }
                    </ion-select>
                    <ion-button
                      slot="end"
                      fill="clear"
                      color="danger"
                      [disabled]="busy()"
                      (click)="remove(current, member.user.id)"
                      aria-label="Odvzemi dostop"
                    >
                      <ion-icon slot="icon-only" name="trash-outline"></ion-icon>
                    </ion-button>
                  </ion-item>
                }
              </ion-list>
            }

            <!-- Dodajanje -->
            <h3 class="cd-section-title">Dodaj osebo</h3>
            @if (loadingUsers()) {
              <div class="cd-skeleton row-skeleton"></div>
            } @else if (addable().length === 0) {
              <p class="cd-muted hint">
                Ni nikogar več, ki bi mu lahko delil. V izbirniku so uporabniki, ki so se v
                CleverDash že vsaj enkrat prijavili.
              </p>
            } @else {
              <ion-list lines="full">
                @for (person of addable(); track person.id) {
                  <ion-item button [disabled]="busy()" (click)="add(current, person.id)">
                    <span slot="start" class="avatar">{{ person.initials }}</span>
                    <ion-label>
                      <h3>{{ person.displayName }}</h3>
                      <p>{{ person.emailHint }}</p>
                    </ion-label>
                    <ion-icon slot="end" name="add-outline"></ion-icon>
                  </ion-item>
                }
              </ion-list>
              <ion-note class="hint">
                Nova oseba dobi stopnjo "Ogled". Spremeniš jo v vrstici zgoraj.
              </ion-note>
            }
          }
        </ion-content>
      </ng-template>
    </ion-modal>
  `,
  styles: `
    .avatar {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      border-radius: 999px;
      background: var(--cd-surface-sunken);
      color: var(--cd-text-muted);
      font-size: var(--cd-font-size-xs);
      margin-inline-end: var(--cd-space-2);
    }
    .hint {
      display: block;
      padding: var(--cd-space-2) var(--cd-space-1) var(--cd-space-3);
      font-size: var(--cd-font-size-sm);
    }
    .msg {
      margin: 0 0 var(--cd-space-2);
      font-size: var(--cd-font-size-sm);
    }
    .row-skeleton {
      height: 48px;
      border-radius: var(--cd-radius-sm);
    }
  `,
})
export class TodoShareDialogComponent {
  private readonly api = inject(TodosApi);
  private readonly users = inject(UsersApi);

  readonly list = input<TodoList | null>(null);
  readonly isOpen = input(false);

  /** Zaprtje okna. */
  readonly dismissed = output<void>();
  /** Novo stanje seznama po vsaki spremembi — stran ga vzame kot avtoritativno. */
  readonly changed = output<TodoList>();

  readonly roles: MemberRole[] = ['view', 'check', 'edit'];
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly loadingUsers = signal(false);
  private readonly directory = signal<DirectoryUser[]>([]);

  /** Imenik brez tistih, ki dostop že imajo — dodajanje istega človeka drugič ni dejanje. */
  readonly addable = computed(() => {
    const current = this.list();
    if (!current) return [];
    const taken = new Set(current.members.map((m) => m.user.id));
    return this.directory().filter((u) => !taken.has(u.id) && u.id !== current.owner.id);
  });

  label(role: MemberRole): string {
    return ROLE_LABELS[role];
  }

  hint(role: MemberRole): string {
    return ROLE_HINTS[role];
  }

  /** Kliče stran, ko okno odpre — imenik se bere takrat in ne ob vsakem izrisu. */
  async loadDirectory(): Promise<void> {
    this.loadingUsers.set(true);
    this.error.set(null);
    try {
      this.directory.set(await this.users.list());
    } catch {
      this.error.set('Seznama uporabnikov ni bilo mogoče naložiti.');
    } finally {
      this.loadingUsers.set(false);
    }
  }

  close(): void {
    this.dismissed.emit();
  }

  private describe(err: unknown, fallback: string): string {
    const detail = (err as { error?: { detail?: string } } | null)?.error?.detail;
    return typeof detail === 'string' && detail.length > 0 ? detail : fallback;
  }

  private async run(action: () => Promise<TodoList | null>, fallback: string): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const updated = await action();
      if (updated) this.changed.emit(updated);
    } catch (err) {
      this.error.set(this.describe(err, fallback));
    } finally {
      this.busy.set(false);
    }
  }

  async toggleLock(list: TodoList): Promise<void> {
    await this.run(
      () => this.api.updateList(list.id, { locked: !list.locked }),
      'Zaklepa ni bilo mogoče spremeniti.',
    );
  }

  async add(list: TodoList, userId: string): Promise<void> {
    // Privzeta stopnja je najnižja: deljenje naj bo namerno dejanje, ne privzeto podeljena
    // pravica urejanja.
    await this.run(() => this.api.setMember(list.id, userId, 'view'), 'Osebe ni bilo mogoče dodati.');
  }

  async changeRole(list: TodoList, userId: string, event: Event): Promise<void> {
    const role = (event as CustomEvent<{ value: MemberRole }>).detail?.value;
    if (!role || role === list.members.find((m) => m.user.id === userId)?.role) return;
    await this.run(() => this.api.setMember(list.id, userId, role), 'Stopnje ni bilo mogoče shraniti.');
  }

  async remove(list: TodoList, userId: string): Promise<void> {
    await this.run(
      () => this.api.removeMember(list.id, userId).then((res) => res.list),
      'Dostopa ni bilo mogoče odvzeti.',
    );
  }
}

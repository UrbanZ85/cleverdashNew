import { Component, ElementRef, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  AlertController,
  IonBadge,
  IonButton,
  IonCheckbox,
  IonChip,
  IonContent,
  IonIcon,
  IonInput,
  IonItem,
  IonItemDivider,
  IonLabel,
  IonList,
  IonRefresher,
  IonRefresherContent,
  IonText,
} from '@ionic/angular/standalone';
import { PageHeaderComponent } from '../../shared/layout/page-header.component.js';
import { CurrentUserService } from '../../core/user/current-user.service.js';
import { TodosApi } from './todos.api.js';
import { TodoShareDialogComponent } from './share-dialog.component.js';
import {
  dueColor,
  dueLabel,
  lastChangeLabel,
  pluralTasks,
  progressBadge,
  progressLabel,
  type TodoList,
  type TodoTask,
} from './todos.model.js';

// Zavihek "Opravila" (platform/tabs/registry.ts, id `todos`).
//
// Postavitev: vodoravno drsna vrstica čipov s seznami na vrhu, opravila izbranega spodaj.
// Preklop med seznami je klik na čip in NE odhod na drug zaslon — pri odkljukavanju med
// nakupom je vračanje nazaj-naprej ravno tisto, kar naredi seznam neuporaben.
//
// Odkljukavanje je OPTIMISTIČNO s povrnitvijo ob neuspehu (vzorec `SettingsStore.patch()`):
// prečrtano mora biti vidno takoj, ne po odgovoru strežnika (SC-002). Ob neuspehu se stanje
// vrne IN pokaže sporočilo — tiha vrnitev je natanko tisto, kar člen VI prepoveduje.
//
// DVA RAZLIČNA ODZIVA NA DVE RAZLIČNI ZAVRNITVI (FR-063, T096):
//  - **pomanjkanje pravice (403)** je trajno stanje klicatelja → kontrole se sploh ne izrišejo,
//    ker jih `capabilities` ne dovoli;
//  - **zaklep (409)** je minljivo stanje zapisa, ki ga lastnik odklene z enim klikom →
//    kontrole OSTANEJO vidne, a onemogočene, in nad seznamom stoji razlaga s ključavnico.
// Zato `lockedForMe()` obstaja ločeno od `capabilities`: ta dva primera je treba ločiti, sicer
// bi bil zaklenjen seznam videti enako kot seznam brez pravic.

@Component({
  selector: 'app-todos-page',
  standalone: true,
  imports: [
    FormsModule,
    PageHeaderComponent,
    TodoShareDialogComponent,
    IonContent,
    IonRefresher,
    IonRefresherContent,
    IonList,
    IonItem,
    IonItemDivider,
    IonLabel,
    IonCheckbox,
    IonButton,
    IonIcon,
    IonChip,
    IonBadge,
    IonInput,
    IonText,
  ],
  template: `
    <app-page-header title="Opravila" [subtitle]="headerSubtitle()"></app-page-header>

    <ion-content>
      <ion-refresher slot="fixed" (ionRefresh)="refresh($event)">
        <ion-refresher-content></ion-refresher-content>
      </ion-refresher>

      @if (loading()) {
        <div class="chips"><span class="cd-skeleton chip-skeleton"></span></div>
        <div class="cd-skeleton row-skeleton"></div>
        <div class="cd-skeleton row-skeleton"></div>
      } @else if (lists().length === 0) {
        <div class="empty">
          <h2>Še nimaš nobenega seznama</h2>
          <p class="cd-muted">
            Seznam opravil je lahko nakupovalni listek, opravila za hišo ali karkoli drugega.
            Lahko ga deliš z drugimi — kar odkljukaš, vidijo tudi oni.
          </p>
          <ion-button (click)="promptNewList()">
            <ion-icon slot="start" name="add-outline"></ion-icon>
            Naredi prvi seznam
          </ion-button>
        </div>
      } @else {
        <!-- Vrstica seznamov. Vodoravno drsna, da tudi deset seznamov ne zlomi postavitve. -->
        <div class="chips">
          @for (item of lists(); track item.id) {
            <ion-chip
              [outline]="item.id !== selectedId()"
              [color]="item.id === selectedId() ? 'primary' : undefined"
              (click)="select(item.id)"
            >
              @if (item.locked) {
                <ion-icon name="lock-closed-outline" aria-label="zaklenjen"></ion-icon>
              }
              <ion-label>{{ item.title }}</ion-label>
              <ion-badge>{{ badge(item) }}</ion-badge>
              @if (item.isNew) {
                <span class="novo" aria-label="nov seznam">&bull;</span>
              }
            </ion-chip>
          }
          <ion-chip outline (click)="promptNewList()">
            <ion-icon name="add-outline"></ion-icon>
            <ion-label>Nov seznam</ion-label>
          </ion-chip>
        </div>

        @if (selected(); as list) {
          <div class="list-head">
            <div class="head-text">
              <h2>
                {{ list.title }}
                @if (list.locked) {
                  <ion-icon name="lock-closed-outline" color="medium" aria-label="zaklenjen"></ion-icon>
                }
              </h2>
              <p class="cd-muted">{{ subtitleFor(list) }}</p>
            </div>
            <div class="head-actions">
              @if (list.capabilities.manageSharing) {
                <ion-button fill="clear" size="small" (click)="openShare()" aria-label="Deljenje in zaklep">
                  <ion-icon slot="icon-only" name="people-outline"></ion-icon>
                </ion-button>
              }
              @if (list.capabilities.renameList) {
                <ion-button fill="clear" size="small" (click)="promptRename(list)" aria-label="Preimenuj">
                  <ion-icon slot="icon-only" name="create-outline"></ion-icon>
                </ion-button>
              }
              @if (list.capabilities.deleteList) {
                <ion-button fill="clear" size="small" (click)="confirmDelete(list)" aria-label="Izbriši seznam">
                  <ion-icon slot="icon-only" name="trash-outline"></ion-icon>
                </ion-button>
              }
              @if (list.capabilities.leaveList) {
                <ion-button fill="clear" size="small" (click)="confirmLeave(list)" aria-label="Zapusti seznam">
                  <ion-icon slot="icon-only" name="close-outline"></ion-icon>
                </ion-button>
              }
            </div>
          </div>

          <!-- Zaklep: kontrole ostanejo vidne, razlaga stoji nad njimi (FR-063). -->
          @if (lockedForMe(list)) {
            <div class="locked-note">
              <ion-icon name="lock-closed-outline" color="medium"></ion-icon>
              <span class="cd-muted">
                Lastnik je seznam zaklenil. Dokler je zaklenjen, sprememb ni mogoče shraniti.
              </span>
            </div>
          }

          @if (error(); as message) {
            <ion-text color="danger"><p class="msg">{{ message }}</p></ion-text>
          }

          @if (list.capabilities.writeTasks || lockedForMe(list)) {
            <div class="add" [class.disabled]="!list.capabilities.writeTasks">
              <ion-input
                #addInput
                placeholder="Dodaj opravilo…"
                [(ngModel)]="draft"
                (keyup.enter)="add(list)"
                [disabled]="!list.capabilities.writeTasks"
                aria-label="Novo opravilo"
              ></ion-input>
              <ion-button
                fill="clear"
                (click)="addFromButton(list)"
                [disabled]="!list.capabilities.writeTasks"
                aria-label="Dodaj"
              >
                <ion-icon slot="icon-only" name="add-outline"></ion-icon>
              </ion-button>
            </div>
          }

          @if ((list.tasks ?? []).length === 0) {
            <p class="empty-list cd-muted">Ta seznam je prazen.</p>
          }

          <ion-list lines="full">
            @for (task of list.tasks ?? []; track task.id) {
              @if (isFirstDone(list, task)) {
                <ion-item-divider class="done-head">
                  <ion-icon slot="start" name="checkmark-done-outline" color="success"></ion-icon>
                  <ion-label>Opravljeno ({{ doneCount(list) }})</ion-label>
                </ion-item-divider>
              }
              <ion-item
                [class.done]="task.done"
                [class.row-clickable]="list.capabilities.toggleTask"
                (click)="toggleFromRow(list, task)"
              >
                <ion-checkbox
                  slot="start"
                  [color]="task.done ? 'success' : undefined"
                  [checked]="task.done"
                  [disabled]="!list.capabilities.toggleTask"
                  (ionChange)="toggle(list, task)"
                  (click)="stopRowClick($event)"
                  [attr.aria-label]="task.title"
                ></ion-checkbox>
                <ion-label>
                  <span class="title">{{ task.title }}</span>
                  @if (dueText(task); as due) {
                    <ion-text [color]="dueTone(task)"><small class="due">{{ due }}</small></ion-text>
                  }
                </ion-label>
                @if (task.done && task.doneBy && list.members.length > 0) {
                  <span slot="end" class="who" [title]="task.doneBy.displayName">
                    {{ task.doneBy.initials }}
                  </span>
                }
                @if (!task.done && list.capabilities.writeTasks) {
                  <ion-button
                    slot="end"
                    fill="clear"
                    size="small"
                    [color]="task.dueState ? dueTone(task) : undefined"
                    (click)="promptDueDate(list, task, $event)"
                    aria-label="Rok"
                  >
                    <ion-icon slot="icon-only" name="calendar-outline"></ion-icon>
                  </ion-button>
                }
                @if (!task.done && list.capabilities.reorderTasks) {
                  <ion-button
                    slot="end"
                    fill="clear"
                    size="small"
                    [disabled]="!canMoveUp(list, task)"
                    (click)="move(list, task, 'up', $event)"
                    aria-label="Premakni gor"
                  >
                    <ion-icon slot="icon-only" name="arrow-up-outline"></ion-icon>
                  </ion-button>
                  <ion-button
                    slot="end"
                    fill="clear"
                    size="small"
                    [disabled]="!canMoveDown(list, task)"
                    (click)="move(list, task, 'down', $event)"
                    aria-label="Premakni dol"
                  >
                    <ion-icon slot="icon-only" name="arrow-down-outline"></ion-icon>
                  </ion-button>
                }
                @if (list.capabilities.writeTasks) {
                  <ion-button
                    slot="end"
                    fill="clear"
                    size="small"
                    (click)="removeTask(list, task, $event)"
                    aria-label="Izbriši opravilo"
                  >
                    <ion-icon slot="icon-only" name="trash-outline"></ion-icon>
                  </ion-button>
                }
              </ion-item>
            }
          </ion-list>

          @if (doneCount(list) > 0 && list.capabilities.clearCompleted) {
            <div class="clear">
              <ion-button fill="clear" size="small" (click)="confirmClear(list)">
                <ion-icon slot="start" name="checkmark-done-outline"></ion-icon>
                Počisti opravljene ({{ doneCount(list) }})
              </ion-button>
            </div>
          }
        }
      }

      <app-todo-share-dialog
        [list]="selected()"
        [isOpen]="shareOpen()"
        (dismissed)="shareOpen.set(false)"
        (changed)="onShared($event)"
      ></app-todo-share-dialog>
    </ion-content>
  `,
  styles: `
    .chips {
      display: flex;
      gap: var(--cd-space-1);
      overflow-x: auto;
      padding: var(--cd-space-3) var(--cd-space-3) var(--cd-space-2);
      /* Čipi se NE prelomijo v več vrstic: pri desetih seznamih bi vrstica zrasla čez pol
         zaslona in potisnila opravila pod rob. */
      flex-wrap: nowrap;
    }
    .chips ion-chip {
      flex: none;
    }
    .novo {
      color: var(--ion-color-danger);
      font-size: var(--cd-font-size-lg);
      line-height: 1;
      margin-left: var(--cd-space-1);
    }
    .list-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--cd-space-2);
      padding: 0 var(--cd-space-3) var(--cd-space-2);
    }
    .head-text {
      min-width: 0;
    }
    .list-head h2 {
      margin: 0;
      font-size: var(--cd-font-size-lg);
      display: flex;
      align-items: center;
      gap: var(--cd-space-1);
    }
    .list-head p {
      margin: 2px 0 0;
      font-size: var(--cd-font-size-sm);
    }
    .head-actions {
      flex: none;
      display: flex;
    }
    .locked-note {
      display: flex;
      align-items: center;
      gap: var(--cd-space-2);
      margin: 0 var(--cd-space-3) var(--cd-space-2);
      padding: var(--cd-space-2) var(--cd-space-3);
      background: var(--cd-surface-sunken);
      border-radius: var(--cd-radius-md);
      font-size: var(--cd-font-size-sm);
    }
    .add {
      display: flex;
      align-items: center;
      gap: var(--cd-space-1);
      margin: 0 var(--cd-space-3) var(--cd-space-2);
      padding-left: var(--cd-space-3);
      background: var(--cd-surface-sunken);
      border-radius: var(--cd-radius-md);
    }
    .add.disabled {
      opacity: 0.55;
    }
    /* Opravljeno mora biti vidno opravljeno: prečrtano IN zbledelo IN v mirnejši barvi.
       Sama prosojnost je bila premalo — vrstica je bila videti kot navadna, le svetlejša. */
    .done .title {
      text-decoration: line-through;
      text-decoration-thickness: 2px;
      color: var(--cd-text-muted);
      opacity: 0.7;
    }
    .done .due {
      display: none;
    }
    /* Cela vrstica je tarča, ne le kvadratek — kazalec to pove tudi na namizju. */
    .row-clickable {
      cursor: pointer;
    }
    /* Naslovljena ločnica namesto same črte: pove tudi, KOLIKO je narejenega. */
    .done-head {
      --background: var(--cd-surface-sunken);
      --color: var(--cd-text-muted);
      --padding-start: var(--cd-space-3);
      --inner-padding-end: var(--cd-space-3);
      min-height: 36px;
      font-size: var(--cd-font-size-sm);
      text-transform: none;
      letter-spacing: 0;
    }
    .due {
      display: block;
      font-size: var(--cd-font-size-xs);
    }
    .who {
      font-size: var(--cd-font-size-xs);
      color: var(--cd-text-muted);
      background: var(--cd-surface-sunken);
      border-radius: 999px;
      padding: 2px 6px;
    }
    .clear {
      display: flex;
      justify-content: center;
      padding: var(--cd-space-2) 0 var(--cd-space-5);
    }
    .empty,
    .empty-list {
      padding: var(--cd-space-5) var(--cd-space-4);
      text-align: center;
    }
    .empty h2 {
      margin: 0 0 var(--cd-space-2);
      font-size: var(--cd-font-size-lg);
    }
    .empty p {
      margin: 0 auto var(--cd-space-4);
      max-width: 34rem;
    }
    .msg {
      margin: 0 var(--cd-space-4) var(--cd-space-2);
      font-size: var(--cd-font-size-sm);
    }
    .chip-skeleton {
      height: 32px;
      width: 120px;
      border-radius: 999px;
    }
    .row-skeleton {
      height: 44px;
      margin: var(--cd-space-1) var(--cd-space-3);
      border-radius: var(--cd-radius-sm);
    }
  `,
})
export class TodosPage implements OnInit {
  private readonly api = inject(TodosApi);
  private readonly alerts = inject(AlertController);
  private readonly currentUser = inject(CurrentUserService);
  private readonly shareDialog = viewChild(TodoShareDialogComponent);

  /**
   * `{ read: ElementRef }` NI odveč: `ion-input` je Angularjeva komponenta, zato bi `viewChild`
   * brez tega vrnil njeno instanco in `nativeElement` bi bil `undefined` — klic `setFocus` bi
   * vrgel `TypeError` natanko na poti, ki jo zahteva SC-001 (fokus ostane po vnosu).
   */
  private readonly addInput = viewChild('addInput', { read: ElementRef<HTMLIonInputElement> });

  readonly lists = signal<TodoList[]>([]);
  readonly selectedId = signal<string | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly shareOpen = signal(false);

  draft = '';

  readonly selected = computed(() => this.lists().find((l) => l.id === this.selectedId()) ?? null);

  readonly headerSubtitle = computed(() => {
    const total = this.lists().reduce((sum, l) => sum + l.openCount, 0);
    if (this.lists().length === 0) return null;
    return total === 0 ? 'Vse opravljeno' : `${total} ${pluralTasks(total)} še odprtih`;
  });

  /** Ali je bila stran že enkrat naložena — glej ionViewWillEnter. */
  private initialised = false;

  async ngOnInit(): Promise<void> {
    await this.load();
    this.initialised = true;
  }

  /**
   * Ionic strani PREDPOMNI: ob vrnitvi na že obiskan zavihek se komponenta ne ustvari znova
   * in `ngOnInit` se ne izvede. Brez tega je stran po prvem obisku kazala staro stanje,
   * dokler uporabnik ni osvežil cele strani (F5) ali povlekel navzdol.
   *
   * Prvi vstop pusti pri miru: takrat je naložil že `ngOnInit` in dvojno branje ni potrebno.
   */
  async ionViewWillEnter(): Promise<void> {
    if (this.initialised) await this.load();
  }

  async refresh(event: CustomEvent): Promise<void> {
    await this.load();
    (event.target as { complete?: () => void } | null)?.complete?.();
  }

  private async load(): Promise<void> {
    try {
      // `includeTasks`: en klic da vse, kar zavihek potrebuje, in preklop med čipi je zato
      // takojšen — brez nove zahteve na vsak klik.
      const res = await this.api.listAll({ includeTasks: true });
      this.lists.set(res.lists);
      if (!res.lists.some((l) => l.id === this.selectedId())) {
        this.selectedId.set(res.lists[0]?.id ?? null);
      }
      this.error.set(null);
      await this.markSeenIfNeeded();
    } catch {
      this.error.set('Seznamov ni bilo mogoče naložiti. Poskusi znova.');
    } finally {
      this.loading.set(false);
    }
  }

  async select(listId: string): Promise<void> {
    this.selectedId.set(listId);
    this.error.set(null);
    await this.markSeenIfNeeded();
  }

  /** Oznaka "novo" izgine, ko uporabnik seznam prvič odpre (FR-007). */
  private async markSeenIfNeeded(): Promise<void> {
    const list = this.selected();
    if (!list?.isNew) return;
    try {
      this.replace(await this.api.markSeen(list.id));
    } catch {
      // Neuspeh tu ničesar ne pokvari: oznaka ostane in izgine ob naslednjem odprtju.
    }
  }

  // ---------------------------------------------------------------------------------------
  // Prikaz
  // ---------------------------------------------------------------------------------------

  /** Zaklep, ki velja ZAME — lastnika ne omejuje (FR-062). Ločeno od `capabilities`, ker je
   * odziv vmesnika na zaklep drugačen od odziva na pomanjkanje pravice (FR-063). */
  lockedForMe(list: TodoList): boolean {
    return list.locked && list.role !== 'owner';
  }

  badge(list: TodoList): string {
    return progressBadge(list);
  }

  subtitleFor(list: TodoList): string {
    const parts = [progressLabel(list)];
    if (list.lastModifiedBy) parts.push(`spremenil ${lastChangeLabel(list)}`);
    if (list.members.length > 0) {
      parts.push(`deljeno z ${list.members.length}`);
    } else if (list.role !== 'owner') {
      parts.push(`lastnik ${list.owner.displayName}`);
    }
    return parts.join(' · ');
  }

  dueText(task: TodoTask): string | null {
    return dueLabel(task);
  }

  dueTone(task: TodoTask): 'danger' | 'warning' | undefined {
    return dueColor(task.dueState) ?? undefined;
  }

  doneCount(list: TodoList): number {
    return (list.tasks ?? []).filter((t) => t.done).length;
  }

  /** Prvo odkljukano opravilo dobi zgornjo mejo — vizualno ločnico med skupinama. */
  isFirstDone(list: TodoList, task: TodoTask): boolean {
    const tasks = list.tasks ?? [];
    return task.done && tasks.findIndex((t) => t.done) === tasks.indexOf(task);
  }

  private openIds(list: TodoList): string[] {
    return (list.tasks ?? []).filter((t) => !t.done).map((t) => t.id);
  }

  canMoveUp(list: TodoList, task: TodoTask): boolean {
    return this.openIds(list).indexOf(task.id) > 0;
  }

  canMoveDown(list: TodoList, task: TodoTask): boolean {
    const ids = this.openIds(list);
    const i = ids.indexOf(task.id);
    return i >= 0 && i < ids.length - 1;
  }

  // ---------------------------------------------------------------------------------------
  // Dejanja
  // ---------------------------------------------------------------------------------------

  private replace(list: TodoList): void {
    this.lists.update((all) => all.map((l) => (l.id === list.id ? list : l)));
  }

  /** Sporočilo iz odgovora RFC 9457, sicer splošno. Strežnik pove, ali gre za pomanjkanje
   * pravice (403) ali za zaklenjen seznam (409) — vmesnik se na to odzove različno. */
  private describe(err: unknown, fallback: string): string {
    const detail = (err as { error?: { detail?: string } } | null)?.error?.detail;
    return typeof detail === 'string' && detail.length > 0 ? detail : fallback;
  }

  async openShare(): Promise<void> {
    this.shareOpen.set(true);
    await this.shareDialog()?.loadDirectory();
  }

  onShared(list: TodoList): void {
    this.replace(list);
  }

  /**
   * Doda opravilo. Polje se izprazni TAKOJ in ostane omogočeno.
   *
   * Prej je bilo med shranjevanjem onemogočeno (`[disabled]="adding()"`) — in prav to je
   * jemalo fokus: onemogočen element ga izgubi, ponovna omogočitev pa ga ne vrne, klic
   * `setFocus()` v `finally` pa je stekel, preden je Angular element sploh spet omogočil.
   * Zato zdaj polja ne onemogočamo in zastavice `adding` ni več.
   *
   * Zahteve se smejo prekrivati: vsak dodatek je na strežniku svoj `$push`, zato hitro
   * zaporedje Enterov ne izgubi ničesar in nobenega ni treba zavreči (SC-001).
   */
  async add(list: TodoList): Promise<void> {
    const raw = this.draft.trim();
    if (!raw) return;

    // Prilepljeno večvrstično besedilo da po eno opravilo na vrstico (FR-013).
    const titles = raw
      .split(/\r?\n/)
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    if (titles.length === 0) return;

    // Polje se izprazni TAKOJ — tipkanje se lahko nadaljuje, ne da bi kdo čakal na omrežje.
    this.draft = '';
    this.error.set(null);

    // Zahteve se ZAPOREDIJO, čeprav se vnosi ne.
    //
    // Brez tega bi hitro zaporedje Enterov poslalo prekrivajoče se zahteve, vsaka pa vrne
    // CELO stanje seznama. Če bi odgovor prve prispel za odgovorom druge, bi njegov zapis
    // prepisal novejše stanje in drugo opravilo bi za hip izginilo z zaslona — natanko takrat,
    // ko uporabnik tipka najhitreje in to najmanj pričakuje. Veriga zagotovi, da je zadnji
    // prejeti odgovor tudi zadnji poslani.
    const listId = list.id;
    this.addQueue = this.addQueue.then(() => this.sendAdd(listId, titles));
    await this.addQueue;
  }

  /** Veriga dodajanj. Napaka enega ne sme pretrgati verige za naslednje. */
  private addQueue: Promise<void> = Promise.resolve();

  private async sendAdd(listId: string, titles: string[]): Promise<void> {
    try {
      this.replace(await this.api.addTasks(listId, titles));
    } catch (err) {
      // Besedila NE vračamo v polje: uporabnik je medtem morda že tipkal naslednje. Zato
      // sporočilo pove, KATERO opravilo se ni shranilo.
      const kaj = titles.length === 1 ? `"${titles[0]}"` : `${titles.length} opravil`;
      this.error.set(this.describe(err, `Opravila ${kaj} ni bilo mogoče dodati.`));
    }
  }

  /** Klik na gumb premakne fokus nanj — po dodajanju ga vrnemo v polje, da se tipkanje
   * nadaljuje enako kot pri Enterju. */
  async addFromButton(list: TodoList): Promise<void> {
    await this.add(list);
    await this.addInput()?.nativeElement?.setFocus?.();
  }

  /**
   * Klik kamor koli po vrstici odkljuka opravilo.
   *
   * Kvadratek je majhna tarča, na telefonu pa najmanjša na zaslonu — cela vrstica je
   * tisto, kar uporabnik cilja. Vrstica NI `ion-item button`: ta izriše pravi gumb, v njem
   * pa že stojijo kvadratek in gumbi za rok, vrstni red in brisanje — gnezden gumb v gumbu
   * je neveljaven in bralnikom zaslona nerazumljiv. Zato navaden poslušalec klika, tipkovnica
   * pa ostane na kvadratku, ki je še vedno pravi element s pravo vlogo.
   */
  toggleFromRow(list: TodoList, task: TodoTask): void {
    if (!list.capabilities.toggleTask) return;
    void this.toggle(list, task);
  }

  /** Klik na kvadratek sproži že `ionChange`; brez tega bi se preklop zgodil dvakrat in se
   * s tem izničil. */
  stopRowClick(event: Event): void {
    event.stopPropagation();
  }

  async toggle(list: TodoList, task: TodoTask): Promise<void> {
    const previous = list;
    // Optimistično: prečrtano mora biti vidno takoj (SC-002). Vrstni red pusti pri miru —
    // avtoritativnega vrne strežnik.
    this.replace({
      ...list,
      tasks: (list.tasks ?? []).map((t) => (t.id === task.id ? { ...t, done: !t.done } : t)),
      openCount: list.openCount + (task.done ? 1 : -1),
    });
    this.error.set(null);

    try {
      this.replace(await this.api.updateTask(list.id, task.id, { done: !task.done }));
    } catch (err) {
      this.replace(previous);
      // NIKOLI tihe vrnitve: uporabnik mora izvedeti, zakaj se checkbox ni obdržal — pri
      // zaklenjenem seznamu je to sporočilo edini razloček od okvare (FR-063).
      this.error.set(this.describe(err, 'Spremembe ni bilo mogoče shraniti.'));
    }
  }

  async move(list: TodoList, task: TodoTask, direction: 'up' | 'down', event?: Event): Promise<void> {
    // Gumbi stojijo NA klikljivi vrstici — brez tega bi vsak premik hkrati odkljukal
    // opravilo (isti dogovor kot pri beležkah, notes.page.ts).
    event?.stopPropagation();
    const ids = this.openIds(list);
    const index = ids.indexOf(task.id);
    const target = direction === 'up' ? index - 1 : index + 1;
    if (index < 0 || target < 0 || target >= ids.length) return;

    const next = [...ids];
    next[index] = ids[target] as string;
    next[target] = ids[index] as string;

    try {
      // Pošlje CEL vrstni red, ne relativnega premika — ponovljen klic je no-op.
      this.replace(await this.api.reorder(list.id, next));
    } catch (err) {
      this.error.set(this.describe(err, 'Vrstnega reda ni bilo mogoče shraniti.'));
    }
  }

  async removeTask(list: TodoList, task: TodoTask, event?: Event): Promise<void> {
    event?.stopPropagation();
    try {
      const res = await this.api.deleteTask(list.id, task.id);
      this.replace(res.list);
    } catch (err) {
      this.error.set(this.describe(err, 'Opravila ni bilo mogoče izbrisati.'));
    }
  }

  /** Rok se nastavi NAKNADNO, s klikom na opravilo — hitri vnos ga ne zahteva in ne ponuja
   * (FR-011), ker ga večina opravil ne bo imela nikoli. */
  async promptDueDate(list: TodoList, task: TodoTask, event?: Event): Promise<void> {
    event?.stopPropagation();
    const current = task.dueDate
      ? new Date(task.dueDate).toLocaleDateString('sv-SE', { timeZone: 'Europe/Ljubljana' })
      : '';

    const buttons = [
      { text: 'Prekliči', role: 'cancel' },
      ...(task.dueDate
        ? [{ text: 'Odstrani rok', role: 'destructive', handler: () => void this.setDue(list, task, null) }]
        : []),
      {
        text: 'Shrani',
        handler: (data: { due?: string }) => {
          void this.setDue(list, task, data.due?.trim() || null);
        },
      },
    ];

    const alert = await this.alerts.create({
      header: 'Rok opravila',
      subHeader: task.title,
      // `type: 'date'` da domači izbirnik datuma; vrednost je `YYYY-MM-DD`, kar strežnik
      // pretvori v konec tega dne v ljubljanski coni (domain/due-date.ts).
      inputs: [{ name: 'due', type: 'date', value: current }],
      buttons,
    });
    await alert.present();
  }

  private async setDue(list: TodoList, task: TodoTask, dueDate: string | null): Promise<void> {
    try {
      this.replace(await this.api.updateTask(list.id, task.id, { dueDate }));
      this.error.set(null);
    } catch (err) {
      this.error.set(this.describe(err, 'Roka ni bilo mogoče shraniti.'));
    }
  }

  async promptNewList(): Promise<void> {
    const alert = await this.alerts.create({
      header: 'Nov seznam',
      inputs: [{ name: 'title', type: 'text', placeholder: 'Ime seznama' }],
      buttons: [
        { text: 'Prekliči', role: 'cancel' },
        {
          text: 'Naredi',
          handler: (data: { title?: string }) => {
            void this.createList(data.title ?? '');
          },
        },
      ],
    });
    await alert.present();
  }

  private async createList(title: string): Promise<void> {
    if (!title.trim()) return;
    try {
      const created = await this.api.createList(title.trim());
      this.lists.update((all) => [created, ...all]);
      this.selectedId.set(created.id);
      this.error.set(null);
    } catch (err) {
      this.error.set(this.describe(err, 'Seznama ni bilo mogoče ustvariti.'));
    }
  }

  async promptRename(list: TodoList): Promise<void> {
    const alert = await this.alerts.create({
      header: 'Preimenuj seznam',
      inputs: [{ name: 'title', type: 'text', value: list.title }],
      buttons: [
        { text: 'Prekliči', role: 'cancel' },
        {
          text: 'Shrani',
          handler: (data: { title?: string }) => {
            void this.rename(list, data.title ?? '');
          },
        },
      ],
    });
    await alert.present();
  }

  private async rename(list: TodoList, title: string): Promise<void> {
    if (!title.trim() || title.trim() === list.title) return;
    try {
      this.replace(await this.api.updateList(list.id, { title: title.trim() }));
    } catch (err) {
      this.error.set(this.describe(err, 'Imena ni bilo mogoče shraniti.'));
    }
  }

  async confirmDelete(list: TodoList): Promise<void> {
    const alert = await this.alerts.create({
      header: 'Izbrišem seznam?',
      message:
        list.members.length > 0
          ? `"${list.title}" bo izbrisan z vsemi opravili in izginil tudi ${list.members.length} soudeležencem. Tega ni mogoče razveljaviti.`
          : `"${list.title}" bo izbrisan skupaj z vsemi opravili. Tega ni mogoče razveljaviti.`,
      buttons: [
        { text: 'Prekliči', role: 'cancel' },
        {
          text: 'Izbriši',
          role: 'destructive',
          handler: () => {
            void this.deleteList(list);
          },
        },
      ],
    });
    await alert.present();
  }

  private async deleteList(list: TodoList): Promise<void> {
    try {
      await this.api.deleteList(list.id);
      this.forget(list.id);
    } catch (err) {
      this.error.set(this.describe(err, 'Seznama ni bilo mogoče izbrisati.'));
    }
  }

  async confirmLeave(list: TodoList): Promise<void> {
    const alert = await this.alerts.create({
      header: 'Zapustim seznam?',
      message: `"${list.title}" ne bo več med tvojimi. Lastnik ga lahko znova deli s tabo.`,
      buttons: [
        { text: 'Prekliči', role: 'cancel' },
        {
          text: 'Zapusti',
          role: 'destructive',
          handler: () => {
            void this.leave(list);
          },
        },
      ],
    });
    await alert.present();
  }

  private async leave(list: TodoList): Promise<void> {
    // Iskanje po VLOGI bi našlo kogar koli z isto stopnjo; odhod mora nasloviti mene.
    await this.currentUser.ensureLoaded();
    const myId = this.currentUser.user()?.id;
    if (!myId) {
      this.error.set('Tvoje identitete ni bilo mogoče ugotoviti. Osveži stran in poskusi znova.');
      return;
    }

    try {
      // Soudeleženec odstrani SEBE; strežnik pri odhodu vrne `list: null`, ker ga ne vidi več.
      await this.api.removeMember(list.id, myId);
      this.forget(list.id);
    } catch (err) {
      this.error.set(this.describe(err, 'Seznama ni bilo mogoče zapustiti.'));
    }
  }

  private forget(listId: string): void {
    this.lists.update((all) => all.filter((l) => l.id !== listId));
    this.selectedId.set(this.lists()[0]?.id ?? null);
    this.shareOpen.set(false);
  }

  async confirmClear(list: TodoList): Promise<void> {
    const count = this.doneCount(list);
    const alert = await this.alerts.create({
      header: 'Počistim opravljene?',
      message: `Odstranim ${count} ${pluralTasks(count)}. Neopravljenih se to ne dotakne.`,
      buttons: [
        { text: 'Prekliči', role: 'cancel' },
        {
          text: 'Počisti',
          role: 'destructive',
          handler: () => {
            void this.clear(list);
          },
        },
      ],
    });
    await alert.present();
  }

  private async clear(list: TodoList): Promise<void> {
    try {
      const res = await this.api.clearCompleted(list.id);
      this.replace(res.list);
    } catch (err) {
      this.error.set(this.describe(err, 'Opravljenih ni bilo mogoče počistiti.'));
    }
  }
}

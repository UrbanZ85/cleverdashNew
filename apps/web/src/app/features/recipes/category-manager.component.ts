import { Component, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  AlertController,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonModal,
  IonNote,
  IonText,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { RecipesApi } from './recipes.api.js';
import type { RecipeCategory } from './recipes.model.js';

// Urejanje BESEDNJAKA kategorij ("Juhe", "Kosila", "Zajtrki", "Večerje").
//
// Kaj je tu treba razumeti, preden se kdo loti sprememb: besednjak in recepti sta ločena vira
// resnice, povezana prek IMENA. Zato sta obe destruktivni potezi zapisani drugače, kot bi človek
// pričakoval, in vmesnik to POVE:
//
//  - preimenovanje popravi ime tudi v vseh LASTNIH receptih, v tujih deljenih pa ne;
//  - izbris kategorije ne izbriše nobenega recepta — samo odstrani kategorijo z njih.
//
// Obe števili pride s strežnika in se izpišeta po posegu. Brez tega bi bila potrditev brisanja
// brez vsebine ("Izbrišem kategorijo?" — koliko receptov to zadene?).

@Component({
  selector: 'app-recipe-category-manager',
  standalone: true,
  imports: [
    FormsModule,
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
    IonInput,
    IonIcon,
    IonNote,
    IonText,
  ],
  template: `
    <ion-modal [isOpen]="isOpen()" (didDismiss)="close()">
      <ng-template>
        <ion-header>
          <ion-toolbar>
            <ion-title>Kategorije</ion-title>
            <ion-buttons slot="end">
              <ion-button (click)="close()">Zapri</ion-button>
            </ion-buttons>
          </ion-toolbar>
        </ion-header>

        <ion-content class="ion-padding">
          @if (error(); as message) {
            <ion-text color="danger"><p class="msg">{{ message }}</p></ion-text>
          }
          @if (info(); as message) {
            <ion-text color="success"><p class="msg">{{ message }}</p></ion-text>
          }

          <ion-list lines="full">
            @if (categories().length === 0) {
              <ion-item lines="none">
                <ion-note>
                  Kategorij še ni. Dodaj "Juhe", "Kosila", "Zajtrki", "Večerje" — ali karkoli
                  drugega, po čemer razvrščaš.
                </ion-note>
              </ion-item>
            }

            @for (category of categories(); track category.id; let i = $index) {
              <ion-item>
                <ion-label>
                  <h3>{{ category.name }}</h3>
                  <p>
                    @if (category.recipeCount === 0) {
                      Brez receptov
                    } @else if (category.recipeCount === 1) {
                      1 recept
                    } @else {
                      {{ category.recipeCount }} receptov
                    }
                  </p>
                </ion-label>

                <!-- Vrstni red se premika po korakih in ne z vlečenjem: vlečenje v modalnem oknu
                     na dotik tekmuje z drsenjem vsebine, kar je na telefonu pogost vir napačnih
                     premikov. -->
                <ion-button
                  slot="end"
                  fill="clear"
                  [disabled]="busy() || i === 0"
                  (click)="move(i, -1)"
                  aria-label="Premakni navzgor"
                >
                  <ion-icon slot="icon-only" name="arrow-up-outline"></ion-icon>
                </ion-button>
                <ion-button
                  slot="end"
                  fill="clear"
                  [disabled]="busy() || i === categories().length - 1"
                  (click)="move(i, 1)"
                  aria-label="Premakni navzdol"
                >
                  <ion-icon slot="icon-only" name="arrow-down-outline"></ion-icon>
                </ion-button>
                <ion-button slot="end" fill="clear" [disabled]="busy()" (click)="rename(category)" aria-label="Preimenuj">
                  <ion-icon slot="icon-only" name="create-outline"></ion-icon>
                </ion-button>
                <ion-button
                  slot="end"
                  fill="clear"
                  color="danger"
                  [disabled]="busy()"
                  (click)="remove(category)"
                  aria-label="Izbriši"
                >
                  <ion-icon slot="icon-only" name="trash-outline"></ion-icon>
                </ion-button>
              </ion-item>
            }

            <ion-item>
              <ion-input
                label="Nova kategorija"
                labelPlacement="stacked"
                placeholder="Juhe"
                [(ngModel)]="draft"
                (keyup.enter)="add()"
              ></ion-input>
              <ion-button slot="end" [disabled]="busy() || draft.trim().length === 0" (click)="add()">
                <ion-icon slot="icon-only" name="add-outline"></ion-icon>
              </ion-button>
            </ion-item>
          </ion-list>

          <ion-note class="hint">
            Recept je lahko v več kategorijah hkrati — bučna juha je lahko Juhe in Kosila.
            Brisanje kategorije ne izbriše nobenega recepta, le odstrani jo z njih.
          </ion-note>
        </ion-content>
      </ng-template>
    </ion-modal>
  `,
  styles: [
    `
      .msg {
        margin: 4px 0;
      }
      .hint {
        display: block;
        padding: 12px 16px;
        font-size: 0.78rem;
      }
    `,
  ],
})
export class RecipeCategoryManagerComponent {
  private readonly api = inject(RecipesApi);
  private readonly alerts = inject(AlertController);

  readonly isOpen = input(false);

  readonly closed = output<void>();
  /** Starš seznam osveži, ker se je besednjak (in morda tudi razvrstitev receptov) spremenil. */
  readonly changed = output<void>();

  readonly categories = signal<RecipeCategory[]>([]);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly info = signal<string | null>(null);

  draft = '';

  constructor() {
    void this.reload();
  }

  async reload(): Promise<void> {
    try {
      this.categories.set(await this.api.listCategories());
    } catch {
      this.error.set('Kategorij ni bilo mogoče naložiti.');
    }
  }

  async add(): Promise<void> {
    const name = this.draft.trim();
    if (name.length === 0) return;
    await this.run(async () => {
      await this.api.createCategory(name);
      this.draft = '';
    });
  }

  async rename(category: RecipeCategory): Promise<void> {
    const alert = await this.alerts.create({
      header: 'Preimenuj kategorijo',
      inputs: [{ name: 'name', type: 'text', value: category.name, placeholder: 'Ime' }],
      buttons: [
        { text: 'Prekliči', role: 'cancel' },
        { text: 'Shrani', role: 'confirm' },
      ],
    });
    await alert.present();
    const { role, data } = await alert.onDidDismiss<{ values?: { name?: string } }>();
    const name = data?.values?.name?.trim();
    if (role !== 'confirm' || !name || name === category.name) return;

    await this.run(async () => {
      const result = await this.api.renameCategory(category.id, name);
      // Obseg posega je vidna posledica in ne podrobnost: preimenovanje se je dotaknilo receptov.
      this.info.set(
        result.updatedRecipes > 0
          ? `Preimenovano tudi v ${result.updatedRecipes} receptih.`
          : 'Preimenovano.',
      );
    });
  }

  async remove(category: RecipeCategory): Promise<void> {
    const alert = await this.alerts.create({
      header: 'Izbrišem kategorijo?',
      // Pove, KAJ se bo zgodilo z recepti — sicer bi človek upravičeno pričakoval najhujše.
      message:
        category.recipeCount > 0
          ? `Kategorijo bo izgubilo ${category.recipeCount} receptov. Sami recepti ostanejo.`
          : 'Kategorija ni na nobenem receptu.',
      buttons: [
        { text: 'Prekliči', role: 'cancel' },
        { text: 'Izbriši', role: 'destructive' },
      ],
    });
    await alert.present();
    const { role } = await alert.onDidDismiss();
    if (role !== 'destructive') return;

    await this.run(async () => {
      const result = await this.api.deleteCategory(category.id);
      this.info.set(
        result.updatedRecipes > 0
          ? `Odstranjeno z ${result.updatedRecipes} receptov. Recepti so ostali.`
          : 'Izbrisano.',
      );
    });
  }

  /** Premakne kategorijo za eno mesto in pošlje CEL nov vrstni red. */
  async move(index: number, delta: number): Promise<void> {
    const next = [...this.categories()];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    const moved = next[index];
    const other = next[target];
    if (!moved || !other) return;
    next[index] = other;
    next[target] = moved;
    // Seznam se prerazporedi TAKOJ, brez čakanja na strežnik: premik za eno mesto mora biti videti
    // takojšen, sicer ga človek klikne dvakrat. Ob napaki se stanje povrne iz `reload()`.
    this.categories.set(next);
    await this.run(() => this.api.reorderCategories(next.map((c) => c.id)));
  }

  private async run(action: () => Promise<unknown>): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    this.info.set(null);
    try {
      await action();
      await this.reload();
      this.changed.emit();
    } catch (err) {
      const detail = (err as { error?: { detail?: string } })?.error?.detail;
      this.error.set(typeof detail === 'string' && detail.length > 0 ? detail : 'Spremembe ni bilo mogoče shraniti.');
      await this.reload();
    } finally {
      this.busy.set(false);
    }
  }

  close(): void {
    this.info.set(null);
    this.error.set(null);
    this.closed.emit();
  }
}

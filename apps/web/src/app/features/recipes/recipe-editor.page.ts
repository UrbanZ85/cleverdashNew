import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  AlertController,
  IonButton,
  IonButtons,
  IonChip,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonList,
  IonNote,
  IonSpinner,
  IonText,
  IonTextarea,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { RecipeShareDialogComponent } from './recipe-share-dialog.component.js';
import { RecipesApi } from './recipes.api.js';
import { makeThumbnail, measureImage } from './image-resize.js';
import {
  describeSourceStatus,
  formatDuration,
  formatLastCooked,
  splitLines,
  type Recipe,
  type RecipeImage,
} from './recipes.model.js';

// Urejevalnik enega recepta — podstran zavihka `recipes`, dosegljiva samo prek seznama, ki je sam
// tab-gated (tabGuard preverja TOČNO ujemanje poti z registrom).
//
// `recipes/new` NIMA svoje poti, ampak se ujame kot `:recipeId = 'new'`. To ni varčevanje z
// vrsticami: ob prvem shranjevanju se naslov zamenja na `recipes/<id>`, in če bi bila to DRUGA
// definicija poti, bi Angular urejevalnik zavrgel in ustvaril novega — slika, ki bi se ravno
// nalagala, bi se pripela receptu, ki ga novi primerek še ne prikazuje. Ista odločitev in isti
// razlog kot pri `notes/:noteId`.
//
// Zaslon ima TRI stanja: ogled, urejanje in kuhanje. Kuhanje ni tretja stran, ampak prekrivalo nad
// istim zapisom — recept se med kuhanjem ne nalaga znova in izhod ne izgubi mesta v seznamu.

@Component({
  selector: 'app-recipe-editor-page',
  standalone: true,
  imports: [
    FormsModule,
    RecipeShareDialogComponent,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonContent,
    IonIcon,
    IonList,
    IonItem,
    IonInput,
    IonTextarea,
    IonNote,
    IonChip,
    IonText,
    IonSpinner,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button (click)="back()" aria-label="Nazaj">
            <ion-icon slot="icon-only" name="arrow-back-outline"></ion-icon>
          </ion-button>
        </ion-buttons>
        <ion-title>{{ isNew() ? 'Nov recept' : (recipe()?.title ?? 'Recept') }}</ion-title>
        <ion-buttons slot="end">
          @if (editing()) {
            <ion-button [disabled]="busy() || form.title.trim().length === 0" (click)="save()">
              Shrani
            </ion-button>
          } @else if (recipe(); as current) {
            @if (current.capabilities.editRecipe) {
              <ion-button (click)="startEdit()" aria-label="Uredi">
                <ion-icon slot="icon-only" name="create-outline"></ion-icon>
              </ion-button>
            }
            @if (current.capabilities.manageSharing) {
              <ion-button (click)="shareOpen.set(true)" aria-label="Deljenje">
                <ion-icon slot="icon-only" name="people-outline"></ion-icon>
              </ion-button>
            }
          }
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      @if (error(); as message) {
        <ion-text color="danger"><p class="msg">{{ message }}</p></ion-text>
      }

      @if (loading()) {
        <div class="center"><ion-spinner></ion-spinner></div>
      } @else if (editing()) {
        <!-- ─────────── urejanje ─────────── -->
        <ion-list>
          <ion-item>
            <ion-input
              label="Ime"
              labelPlacement="stacked"
              placeholder="Bučna juha"
              [(ngModel)]="form.title"
              required
            ></ion-input>
          </ion-item>

          <ion-item>
            <ion-input
              label="Povezava (neobvezno)"
              labelPlacement="stacked"
              placeholder="https://…"
              inputmode="url"
              [(ngModel)]="form.url"
            ></ion-input>
          </ion-item>
          <!-- Uvoz je IZRECNA poteza in ne stranski učinek vpisa naslova: odhodni klic brez
               povoda prepoveduje člen VIII, zato ga sproži gumb. -->
          @if (!isNew() && form.url.trim().length > 0) {
            <ion-item lines="none">
              <ion-button fill="clear" size="small" [disabled]="busy()" (click)="reimport()">
                <ion-icon slot="start" name="refresh-outline" aria-hidden="true"></ion-icon>
                Preberi s strani
              </ion-button>
              <ion-note slot="end" class="hint">Izpolni le prazna polja.</ion-note>
            </ion-item>
          }

          <ion-item>
            <ion-textarea
              label="Opis / opombe"
              labelPlacement="stacked"
              [autoGrow]="true"
              [rows]="2"
              [(ngModel)]="form.description"
            ></ion-textarea>
          </ion-item>

          <!-- Sestavine in koraki sta prosti besedili z eno vrstico na vnos. Prilepljen seznam
               tako obdrži obliko, ki jo je imel, in uporabniku ni treba vsake vrstice dodajati
               posebej (FR-005). -->
          <ion-item>
            <ion-textarea
              label="Sestavine (ena na vrstico)"
              labelPlacement="stacked"
              placeholder="400 g buče&#10;1 čebula&#10;ščepec soli"
              [autoGrow]="true"
              [rows]="4"
              [(ngModel)]="form.ingredients"
            ></ion-textarea>
          </ion-item>

          <ion-item>
            <ion-textarea
              label="Postopek (en korak na vrstico)"
              labelPlacement="stacked"
              [autoGrow]="true"
              [rows]="5"
              [(ngModel)]="form.steps"
            ></ion-textarea>
          </ion-item>

          <ion-item>
            <ion-input
              label="Čas priprave (min)"
              labelPlacement="stacked"
              type="number"
              inputmode="numeric"
              [(ngModel)]="form.prepMinutes"
            ></ion-input>
          </ion-item>

          <ion-item>
            <ion-input
              label="Porcije"
              labelPlacement="stacked"
              type="number"
              inputmode="numeric"
              [(ngModel)]="form.servings"
            ></ion-input>
          </ion-item>

          <ion-item>
            <ion-input
              label="Oznake (ločene z vejico)"
              labelPlacement="stacked"
              placeholder="juha, vegi, hitro"
              [(ngModel)]="form.tags"
            ></ion-input>
          </ion-item>
        </ion-list>

        <div class="actions">
          <ion-button fill="clear" color="medium" (click)="cancelEdit()">Prekliči</ion-button>
        </div>
      } @else if (recipe(); as current) {
        <!-- ─────────── ogled ─────────── -->
        <div class="view">
          @if (sourceNote(current); as note) {
            <ion-note class="source-note">{{ note }}</ion-note>
          }

          <!-- Slike -->
          <div class="gallery">
            @for (image of images(); track image.id) {
              <div class="shot" [class.cover]="image.isCover">
                @if (imageUrl(image); as src) {
                  <img [src]="src" [alt]="image.caption ?? current.title" />
                }
                @if (current.capabilities.manageImages) {
                  <div class="shot-actions">
                    @if (!image.isCover) {
                      <ion-button size="small" fill="clear" (click)="setCover(image)">Naslovna</ion-button>
                    }
                    <ion-button size="small" fill="clear" color="danger" (click)="removeImage(image)">
                      <ion-icon slot="icon-only" name="trash-outline"></ion-icon>
                    </ion-button>
                  </div>
                }
              </div>
            }
            @if (current.capabilities.manageImages) {
              <label class="add-shot">
                <ion-icon name="image-outline" aria-hidden="true"></ion-icon>
                <span>{{ uploading() ? 'Nalagam …' : 'Dodaj sliko' }}</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  [disabled]="uploading()"
                  (change)="onFiles($any($event).target)"
                />
              </label>
            }
          </div>

          <!-- Ocena, čas, porcije, kuhanje -->
          <div class="facts">
            @if (current.capabilities.rateRecipe || current.rating !== null) {
              <div class="rating">
                @for (star of stars; track star) {
                  <ion-icon
                    [name]="star <= (current.rating ?? 0) ? 'star' : 'star-outline'"
                    [attr.role]="current.capabilities.rateRecipe ? 'button' : null"
                    [attr.aria-label]="'Oceni z ' + star"
                    (click)="rate(star)"
                  ></ion-icon>
                }
                @if (current.rating !== null && current.capabilities.rateRecipe) {
                  <ion-button fill="clear" size="small" (click)="rate(null)">Počisti</ion-button>
                }
              </div>
            }

            <p class="meta">
              @if (duration(current); as time) {
                <span><ion-icon name="time-outline" aria-hidden="true"></ion-icon> {{ time }}</span>
              }
              @if (current.servings !== null) {
                <span><ion-icon name="people-outline" aria-hidden="true"></ion-icon> {{ current.servings }} porcij</span>
              }
              <span>
                <ion-icon name="flame-outline" aria-hidden="true"></ion-icon>
                {{ lastCooked(current) }}
                @if (current.cookCount > 0) {
                  · {{ current.cookCount }}×
                }
              </span>
            </p>

            @if (current.url; as url) {
              <a class="source-link" [href]="url" target="_blank" rel="noopener noreferrer">
                <ion-icon name="open-outline" aria-hidden="true"></ion-icon>
                {{ current.sourceHost ?? 'Izvorna stran' }}
              </a>
            }

            @if (current.tags.length > 0) {
              <div class="tags">
                @for (tag of current.tags; track tag) {
                  <ion-chip outline>{{ tag }}</ion-chip>
                }
              </div>
            }
          </div>

          @if (current.description; as description) {
            <p class="description">{{ description }}</p>
          }

          @if (current.ingredients.length > 0) {
            <h2>Sestavine</h2>
            <ul class="ingredients">
              @for (ingredient of current.ingredients; track $index) {
                <li>{{ ingredient }}</li>
              }
            </ul>
          }

          @if (current.steps.length > 0) {
            <h2>Postopek</h2>
            <ol class="steps">
              @for (step of current.steps; track $index) {
                <li>{{ step }}</li>
              }
            </ol>
          }

          <div class="actions">
            @if (current.steps.length > 0 || current.ingredients.length > 0) {
              <ion-button expand="block" (click)="startCooking()">
                <ion-icon slot="start" name="restaurant-outline" aria-hidden="true"></ion-icon>
                Kuhaj po tem receptu
              </ion-button>
            }
            @if (current.capabilities.markCooked) {
              <ion-button expand="block" fill="outline" [disabled]="busy()" (click)="markCooked()">
                <ion-icon slot="start" name="flame-outline" aria-hidden="true"></ion-icon>
                Danes sem to skuhal
              </ion-button>
            }
            @if (current.capabilities.deleteRecipe) {
              <ion-button expand="block" fill="clear" color="danger" (click)="confirmDelete()">
                Izbriši recept
              </ion-button>
            } @else if (current.capabilities.leaveRecipe) {
              <ion-button expand="block" fill="clear" color="medium" (click)="confirmLeave()">
                Zapusti recept
              </ion-button>
            }
          </div>

          @if (!current.isOwn && current.owner; as owner) {
            <ion-note class="owner">Recept je delil {{ owner.displayName }}.</ion-note>
          }
          @if (current.lastModifiedBy; as author) {
            <ion-note class="owner">Nazadnje spremenil: {{ author.displayName }}.</ion-note>
          }
        </div>
      }
    </ion-content>

    <!-- ─────────── način kuhanja ─────────── -->
    @if (cooking(); as current) {
      <div class="cook">
        <div class="cook-bar">
          <ion-button fill="clear" (click)="stopCooking()">
            <ion-icon slot="start" name="arrow-back-outline" aria-hidden="true"></ion-icon>
            Končaj
          </ion-button>
          <span class="cook-title">{{ current.title }}</span>
        </div>

        <div class="cook-body">
          @if (current.ingredients.length > 0) {
            <h2>Sestavine</h2>
            <ul>
              @for (ingredient of current.ingredients; track $index) {
                <li>{{ ingredient }}</li>
              }
            </ul>
          }

          @if (current.steps.length > 0) {
            <h2>Postopek</h2>
            <ol>
              @for (step of current.steps; track $index) {
                <!-- Odkljukan korak je stanje TEGA kuhanja in se NE shrani v recept (US7):
                     odkljukanost bi bila pri naslednjem kuhanju in pri vsakem soudeležencu
                     napačna. Zato živi samo v tem signalu in ob izhodu izgine. -->
                <li [class.done]="isStepDone($index)" (click)="toggleStep($index)">
                  <ion-icon
                    [name]="isStepDone($index) ? 'checkmark-circle-outline' : 'square-outline'"
                    aria-hidden="true"
                  ></ion-icon>
                  <span>{{ step }}</span>
                </li>
              }
            </ol>
          }
        </div>
      </div>
    }

    @if (recipe(); as current) {
      <app-recipe-share-dialog
        [isOpen]="shareOpen()"
        [recipe]="current"
        (closed)="shareOpen.set(false)"
        (changed)="onRecipeChanged($event)"
      ></app-recipe-share-dialog>
    }
  `,
  styles: [
    `
      .center,
      .msg {
        padding: 24px;
        text-align: center;
      }
      .view {
        padding: 12px 16px 32px;
      }
      .source-note {
        display: block;
        padding-bottom: 8px;
      }
      .gallery {
        display: flex;
        gap: 8px;
        overflow-x: auto;
        padding-bottom: 8px;
      }
      .shot {
        position: relative;
        flex: 0 0 auto;
        width: 160px;
        border-radius: 10px;
        overflow: hidden;
        background: var(--ion-color-step-100, #eee);
      }
      .shot.cover {
        outline: 2px solid var(--ion-color-primary);
      }
      .shot img {
        width: 160px;
        height: 120px;
        object-fit: cover;
        display: block;
      }
      .shot-actions {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .add-shot {
        flex: 0 0 auto;
        width: 160px;
        height: 120px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 4px;
        border: 1px dashed var(--ion-color-medium);
        border-radius: 10px;
        cursor: pointer;
        font-size: 0.8rem;
        color: var(--ion-color-medium-shade);
      }
      .add-shot input {
        display: none;
      }
      .rating ion-icon {
        font-size: 1.5rem;
        color: var(--ion-color-warning);
        cursor: pointer;
      }
      .meta {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        color: var(--ion-color-medium-shade);
        font-size: 0.85rem;
      }
      .meta span {
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }
      .source-link {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 0.85rem;
      }
      .description {
        white-space: pre-wrap;
      }
      .ingredients,
      .steps {
        padding-left: 20px;
      }
      .ingredients li,
      .steps li {
        margin-bottom: 4px;
      }
      .actions {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding-top: 12px;
      }
      .owner {
        display: block;
        padding-top: 8px;
        font-size: 0.8rem;
      }

      /* Način kuhanja: prekrivalo čez vse, brez menija in brez orodnih vrstic. Velika pisava in
         velike tarče za dotik — telefon je na pultu in roke niso čiste. */
      .cook {
        position: fixed;
        inset: 0;
        z-index: 20;
        background: var(--ion-background-color, #fff);
        overflow-y: auto;
        padding: env(safe-area-inset-top, 0) 0 32px;
      }
      .cook-bar {
        position: sticky;
        top: 0;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 4px 8px;
        background: var(--ion-background-color, #fff);
        border-bottom: 1px solid var(--ion-color-step-150, #ddd);
      }
      .cook-title {
        font-weight: 600;
      }
      .cook-body {
        padding: 12px 20px;
        font-size: 1.25rem;
        line-height: 1.6;
      }
      .cook-body li {
        margin-bottom: 12px;
      }
      .cook-body ol li {
        display: flex;
        gap: 10px;
        align-items: flex-start;
        cursor: pointer;
        list-style: none;
      }
      .cook-body ol {
        padding-left: 0;
      }
      .cook-body ol li.done span {
        text-decoration: line-through;
        opacity: 0.55;
      }
      .cook-body ion-icon {
        flex: 0 0 auto;
        margin-top: 4px;
        font-size: 1.4rem;
      }
    `,
  ],
})
export class RecipeEditorPage implements OnInit, OnDestroy {
  private readonly api = inject(RecipesApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly alerts = inject(AlertController);

  readonly recipe = signal<Recipe | null>(null);
  readonly images = signal<RecipeImage[]>([]);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly uploading = signal(false);
  readonly error = signal<string | null>(null);
  readonly editing = signal(false);
  readonly shareOpen = signal(false);
  readonly cooking = signal<Recipe | null>(null);
  readonly stars = [1, 2, 3, 4, 5];

  private readonly doneSteps = signal<Set<number>>(new Set());
  private readonly imageUrls = signal<Record<string, string>>({});

  /** `new` je vrednost parametra in ne svoja pot — glej opombo na vrhu razreda. */
  readonly isNew = computed(() => this.recipe() === null && !this.loading());

  /** Obrazec je navaden objekt in ne signal: `[(ngModel)]` piše vanj neposredno, vmesna plast
   * signalov pa bi pri vsakem pritisku tipke sprožila izris celega zaslona. */
  form = { title: '', url: '', description: '', ingredients: '', steps: '', prepMinutes: '', servings: '', tags: '' };

  /** Zadržek prebujenega zaslona med kuhanjem. `null`, dokler način ni vklopljen ali kadar ga
   * brskalnik ne podpira — odsotnost NI napaka in se uporabniku ne javi. */
  private wakeLock: { release: () => Promise<void> } | null = null;

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('recipeId');
    if (!id || id === 'new') {
      this.editing.set(true);
      return;
    }
    await this.load(id);
  }

  ngOnDestroy(): void {
    this.releaseImages();
    void this.releaseWakeLock();
  }

  private async load(recipeId: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const recipe = await this.api.get(recipeId);
      this.recipe.set(recipe);
      this.fillForm(recipe);
      await this.loadImages(recipeId);
    } catch {
      this.error.set('Recepta ni bilo mogoče naložiti.');
    } finally {
      this.loading.set(false);
    }
  }

  private fillForm(recipe: Recipe): void {
    this.form = {
      title: recipe.title,
      url: recipe.url ?? '',
      description: recipe.description ?? '',
      ingredients: recipe.ingredients.join('\n'),
      steps: recipe.steps.join('\n'),
      prepMinutes: recipe.prepMinutes === null ? '' : String(recipe.prepMinutes),
      servings: recipe.servings === null ? '' : String(recipe.servings),
      tags: recipe.tags.join(', '),
    };
  }

  /** Prazno polje pomeni `null` ("pobriši") in ne `undefined` ("ne spreminjaj"): uporabnik, ki je
   * čas izbrisal, ga je izbrisal z namenom. Ista past kot na strežniku. */
  private numberOrNull(value: string): number | null {
    const trimmed = value.trim();
    if (trimmed.length === 0) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
  }

  async save(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const draft = {
        title: this.form.title.trim(),
        url: this.form.url.trim().length > 0 ? this.form.url.trim() : null,
        description: this.form.description.trim().length > 0 ? this.form.description.trim() : null,
        ingredients: splitLines(this.form.ingredients),
        steps: splitLines(this.form.steps),
        prepMinutes: this.numberOrNull(this.form.prepMinutes),
        servings: this.numberOrNull(this.form.servings),
        tags: this.form.tags
          .split(',')
          .map((tag) => tag.trim())
          .filter((tag) => tag.length > 0),
      };

      const existing = this.recipe();
      if (existing) {
        const updated = await this.api.update(existing.id, draft);
        this.recipe.set(updated);
        this.fillForm(updated);
        this.editing.set(false);
      } else {
        // Uvoz s strani teče SAMO ob nastanku in samo, kadar je naslov podan — to je razlog,
        // zakaj je uporabnik naslov prilepil (FR-010).
        const created = await this.api.create({ ...draft, importFromUrl: draft.url !== null });
        this.recipe.set(created);
        this.fillForm(created);
        this.editing.set(false);
        // Naslov se zamenja BREZ ponovnega nalaganja komponente (`replaceUrl`), sicer bi Angular
        // urejevalnik zavrgel in ustvaril novega — glej opombo na vrhu razreda.
        void this.router.navigate(['/recipes', created.id], { replaceUrl: true });
      }
    } catch (err) {
      this.error.set(this.describe(err, 'Recepta ni bilo mogoče shraniti.'));
    } finally {
      this.busy.set(false);
    }
  }

  startEdit(): void {
    const current = this.recipe();
    if (current) this.fillForm(current);
    this.editing.set(true);
  }

  cancelEdit(): void {
    const current = this.recipe();
    if (!current) {
      this.back();
      return;
    }
    this.fillForm(current);
    this.editing.set(false);
  }

  async reimport(): Promise<void> {
    const current = this.recipe();
    if (!current) return;
    this.busy.set(true);
    try {
      // Naslov je lahko v obrazcu spremenjen, a še ne shranjen; uvoz bere naslov IZ ZAPISA, zato
      // se najprej shrani. Brez tega bi gumb tiho bral staro stran.
      const saved = await this.api.update(current.id, { url: this.form.url.trim() || null });
      const updated = await this.api.reimport(saved.id, false);
      this.recipe.set(updated);
      this.fillForm(updated);
      if (updated.sourceStatus !== 'ok') {
        this.error.set(describeSourceStatus(updated.sourceStatus));
      }
    } catch (err) {
      this.error.set(this.describe(err, 'Strani ni bilo mogoče prebrati.'));
    } finally {
      this.busy.set(false);
    }
  }

  // ── slike ────────────────────────────────────────────────────────────────────────────────

  private async loadImages(recipeId: string): Promise<void> {
    this.releaseImages();
    try {
      const images = await this.api.listImages(recipeId);
      this.images.set(images);
      const entries = await Promise.all(
        images.map(async (image) => {
          try {
            const blob = await this.api.imageBlob(recipeId, image.id, 'thumb');
            return [image.id, URL.createObjectURL(blob)] as const;
          } catch {
            return null;
          }
        }),
      );
      this.imageUrls.set(
        Object.fromEntries(entries.filter((entry): entry is [string, string] => entry !== null)),
      );
    } catch {
      // Slike so dodatek k receptu; njihov neuspeh ne sme skriti recepta samega.
      this.images.set([]);
    }
  }

  private releaseImages(): void {
    for (const url of Object.values(this.imageUrls())) URL.revokeObjectURL(url);
    this.imageUrls.set({});
  }

  imageUrl(image: RecipeImage): string | null {
    return this.imageUrls()[image.id] ?? null;
  }

  /**
   * Naloži izbrane slike, eno za drugo.
   *
   * Zaporedno in ne vzporedno: vsaka slika je lahko nekaj MB in hkratno nalaganje petih bi na
   * mobilni povezavi pomenilo pet počasnih prenosov namesto petih hitrih — in bi ob prekinitvi
   * pustilo neznano, katere so šle skozi.
   *
   * Pomanjšava se izračuna v brskalniku (research.md §5) in se pošlje v LOČENI zahtevi. Njen
   * neuspeh NI usoden: slika je takrat že naložena in seznam bo postregel izvirnik.
   */
  async onFiles(input: HTMLInputElement): Promise<void> {
    const recipeId = this.recipe()?.id;
    // `Array.from` in ne razširjanje: `FileList` je array-like, a v tej nastavitvi prevajalnika ni
    // iterabilen, zato bi `[...files]` odpovedal.
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (!recipeId || files.length === 0) return;

    this.uploading.set(true);
    this.error.set(null);
    try {
      for (const file of files) {
        const size = await measureImage(file);
        const image = await this.api.uploadImage(recipeId, file, {
          width: size?.width,
          height: size?.height,
        });
        try {
          const thumb = await makeThumbnail(file);
          if (thumb) await this.api.uploadThumb(recipeId, image.id, thumb);
        } catch {
          // Brez pomanjšave je seznam počasnejši, ne pokvarjen.
        }
      }
      await this.refresh();
    } catch (err) {
      this.error.set(this.describe(err, 'Slike ni bilo mogoče naložiti.'));
    } finally {
      this.uploading.set(false);
    }
  }

  async setCover(image: RecipeImage): Promise<void> {
    const recipeId = this.recipe()?.id;
    if (!recipeId) return;
    try {
      this.recipe.set(await this.api.setCover(recipeId, image.id));
      this.images.set(await this.api.listImages(recipeId));
    } catch (err) {
      this.error.set(this.describe(err, 'Naslovne slike ni bilo mogoče nastaviti.'));
    }
  }

  async removeImage(image: RecipeImage): Promise<void> {
    const recipeId = this.recipe()?.id;
    if (!recipeId) return;
    const alert = await this.alerts.create({
      header: 'Izbrišem sliko?',
      message: 'Slike po izbrisu ni mogoče povrniti.',
      buttons: [
        { text: 'Prekliči', role: 'cancel' },
        { text: 'Izbriši', role: 'destructive' },
      ],
    });
    await alert.present();
    const { role } = await alert.onDidDismiss();
    if (role !== 'destructive') return;

    try {
      await this.api.removeImage(recipeId, image.id);
      await this.refresh();
    } catch (err) {
      this.error.set(this.describe(err, 'Slike ni bilo mogoče izbrisati.'));
    }
  }

  // ── dejanja nad receptom ─────────────────────────────────────────────────────────────────

  async rate(value: number | null): Promise<void> {
    const current = this.recipe();
    if (!current?.capabilities.rateRecipe) return;
    // Klik na isto zvezdico oceno POČISTI: sicer bi bila enkrat postavljena ocena nespremenljiva
    // navzdol in bi jo bilo mogoče le višati.
    const next = value !== null && value === current.rating ? null : value;
    try {
      this.recipe.set(await this.api.update(current.id, { rating: next }));
    } catch (err) {
      this.error.set(this.describe(err, 'Ocene ni bilo mogoče shraniti.'));
    }
  }

  async markCooked(): Promise<void> {
    const current = this.recipe();
    if (!current) return;
    this.busy.set(true);
    try {
      this.recipe.set(await this.api.markCooked(current.id));
    } catch (err) {
      this.error.set(this.describe(err, 'Oznake ni bilo mogoče shraniti.'));
    } finally {
      this.busy.set(false);
    }
  }

  async confirmDelete(): Promise<void> {
    const current = this.recipe();
    if (!current) return;
    const shared = current.members.length > 0;
    const alert = await this.alerts.create({
      header: 'Izbrišem recept?',
      // Pri deljenem receptu je posledica ŠIRŠA od klicatelja in mora biti povedana: kopij ni,
      // izbris odnese recept vsem (US4, scenarij 5).
      message: shared
        ? `Recept je deljen z ${current.members.length} osebami in bo izginil tudi njim. Tega ni mogoče povrniti.`
        : 'Recepta in njegovih slik po izbrisu ni mogoče povrniti.',
      buttons: [
        { text: 'Prekliči', role: 'cancel' },
        { text: 'Izbriši', role: 'destructive' },
      ],
    });
    await alert.present();
    const { role } = await alert.onDidDismiss();
    if (role !== 'destructive') return;

    try {
      await this.api.remove(current.id);
      void this.router.navigate(['/recipes']);
    } catch (err) {
      this.error.set(this.describe(err, 'Recepta ni bilo mogoče izbrisati.'));
    }
  }

  async confirmLeave(): Promise<void> {
    const current = this.recipe();
    if (!current) return;
    const alert = await this.alerts.create({
      header: 'Zapustim recept?',
      message: 'Recept bo izginil s tvojega seznama. Lastniku ostane.',
      buttons: [
        { text: 'Prekliči', role: 'cancel' },
        { text: 'Zapusti', role: 'destructive' },
      ],
    });
    await alert.present();
    const { role } = await alert.onDidDismiss();
    if (role !== 'destructive') return;

    try {
      await this.api.leave(current.id);
      void this.router.navigate(['/recipes']);
    } catch (err) {
      this.error.set(this.describe(err, 'Recepta ni bilo mogoče zapustiti.'));
    }
  }

  onRecipeChanged(recipe: Recipe): void {
    this.recipe.set(recipe);
  }

  // ── način kuhanja ────────────────────────────────────────────────────────────────────────

  async startCooking(): Promise<void> {
    const current = this.recipe();
    if (!current) return;
    this.doneSteps.set(new Set());
    this.cooking.set(current);
    await this.requestWakeLock();
  }

  async stopCooking(): Promise<void> {
    this.cooking.set(null);
    this.doneSteps.set(new Set());
    await this.releaseWakeLock();
  }

  isStepDone(index: number): boolean {
    return this.doneSteps().has(index);
  }

  toggleStep(index: number): void {
    const next = new Set(this.doneSteps());
    if (next.has(index)) next.delete(index);
    else next.add(index);
    this.doneSteps.set(next);
  }

  /**
   * Prepreči, da bi zaslon ugasnil med kuhanjem (US7, scenarij 2).
   *
   * `navigator.wakeLock` ni povsod (Safari ga je dobil pozno, v nevarnem kontekstu ga ni) —
   * odsotnost NI napaka in se uporabniku NE javi: recept je uporaben tudi, če se zaslon ugaša,
   * sporočilo o manjkajočem vmesniku pa bi bilo hrup, na katerega ne more odgovoriti.
   */
  private async requestWakeLock(): Promise<void> {
    try {
      const anyNavigator = navigator as unknown as {
        wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> };
      };
      this.wakeLock = (await anyNavigator.wakeLock?.request('screen')) ?? null;
    } catch {
      this.wakeLock = null;
    }
  }

  private async releaseWakeLock(): Promise<void> {
    try {
      await this.wakeLock?.release();
    } catch {
      // Zadržek je lahko sprostil že brskalnik (preklop zavihka) — to ni napaka.
    }
    this.wakeLock = null;
  }

  // ── pomožno ──────────────────────────────────────────────────────────────────────────────

  private async refresh(): Promise<void> {
    const current = this.recipe();
    if (current) await this.load(current.id);
  }

  duration(recipe: Recipe): string {
    return formatDuration(recipe.prepMinutes);
  }

  lastCooked(recipe: Recipe): string {
    return formatLastCooked(recipe.lastCookedAt);
  }

  sourceNote(recipe: Recipe): string | null {
    return describeSourceStatus(recipe.sourceStatus);
  }

  back(): void {
    void this.router.navigate(['/recipes']);
  }

  /** Sporočilo strežnika (RFC 9457 `detail`) je namenjeno uporabniku in pove, KAJ narediti —
   * zato ima prednost pred našim nadomestkom (člen VI). */
  private describe(err: unknown, fallback: string): string {
    const detail = (err as { error?: { detail?: string } })?.error?.detail;
    return typeof detail === 'string' && detail.length > 0 ? detail : fallback;
  }
}

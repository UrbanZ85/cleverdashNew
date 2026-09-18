import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import {
  IonBadge,
  IonButton,
  IonChip,
  IonContent,
  IonIcon,
  IonLabel,
  IonSearchbar,
  IonSegment,
  IonSegmentButton,
  IonSelect,
  IonSelectOption,
  IonText,
} from '@ionic/angular/standalone';
import { PageHeaderComponent } from '../../shared/layout/page-header.component.js';
import { RecipeCategoryManagerComponent } from './category-manager.component.js';
import { chipWindow } from './chip-window.js';
import { RecipesApi } from './recipes.api.js';
import {
  formatDuration,
  formatLastCooked,
  SORT_LABELS,
  type Recipe,
  type RecipeCategory,
  type RecipeScope,
  type RecipeSort,
} from './recipes.model.js';

// Zavihek "Recepti" (platform/tabs/registry.ts, id `recipes`). Seznam je BRALNI zaslon: iskanje,
// filtriranje po oznakah, izbira med lastnimi in deljenimi ter razvrstitev. Pisanje je na svojem
// zaslonu (recipe-editor.page.ts), ker recept s sestavinami, koraki in slikami potrebuje ves
// prostor — enaka delitev kot pri beležkah.
//
// Seznam je MREŽA kartic in ne `ion-list`: pri receptu je slika glavni podatek, po katerem človek
// izbira, in vrstica s sličico 40 px bi bila seznam imen s spremljajočo pego.

@Component({
  selector: 'app-recipes-page',
  standalone: true,
  imports: [
    RouterLink,
    FormsModule,
    PageHeaderComponent,
    RecipeCategoryManagerComponent,
    IonContent,
    IonSearchbar,
    IonSegment,
    IonSegmentButton,
    IonSelect,
    IonSelectOption,
    IonChip,
    IonButton,
    IonIcon,
    IonLabel,
    IonBadge,
    IonText,
  ],
  template: `
    <app-page-header title="Recepti" [subtitle]="subtitle()">
      <!-- Uvoz iz ChatGPT je ob gumbu za nov recept, ker je to ISTO dejanje z drugim virom:
           človek, ki hrani recept iz klepeta, ga išče tu in ne v Nastavitvah. Stran /uvoz ni
           zavihek (ne pripada nobenemu modulu), zato do nje vodi povezava od tod. -->
      <ion-button slot="end" routerLink="/uvoz" aria-label="Uvoz iz ChatGPT">
        <ion-icon slot="icon-only" name="sparkles-outline"></ion-icon>
      </ion-button>
      <ion-button slot="end" (click)="openNew()" aria-label="Nov recept">
        <ion-icon slot="icon-only" name="add-outline"></ion-icon>
      </ion-button>
    </app-page-header>

    <ion-content>
      <div class="recipes">
        <ion-searchbar
          placeholder="Išči po imenu, opisu in sestavinah"
          [debounce]="250"
          [value]="query()"
          (ionInput)="onQuery($any($event).detail.value ?? '')"
        ></ion-searchbar>

        <!-- Izbira med lastnimi in deljenimi se pokaže SAMO, kadar je kaj deljenega: dokler
             uporabnik ni ničesar delil in mu ni nihče ničesar delil, je to preklopnik med dvema
             enakima seznamoma in tretjim praznim. -->
        @if (hasShared()) {
          <ion-segment [value]="scope()" (ionChange)="setScope($any($event).detail.value)">
            <ion-segment-button value="all"><ion-label>Vsi</ion-label></ion-segment-button>
            <ion-segment-button value="own"><ion-label>Moji</ion-label></ion-segment-button>
            <ion-segment-button value="shared"><ion-label>Deljeni z mano</ion-label></ion-segment-button>
          </ion-segment>
        }

        <div class="toolbar">
          <ion-select
            label="Razvrsti"
            labelPlacement="start"
            interface="popover"
            [value]="sort()"
            (ionChange)="setSort($any($event).detail.value)"
          >
            @for (option of sortOptions; track option) {
              <ion-select-option [value]="option">{{ sortLabels[option] }}</ion-select-option>
            }
          </ion-select>
        </div>

        <!-- KATEGORIJE so svoja vrstica, ločena od oznak: to sta dva NEODVISNA filtra in ju je
             mogoče uporabiti hkrati ("juhe, ki so vegi"). Ena skupna vrstica čipov bi dala vtis,
             da je izbira ena sama. -->
        <div class="filters">
          <ion-chip [outline]="activeCategory() !== null" (click)="setCategory(null)">Vse</ion-chip>
          @for (category of shownCategories(); track category.id) {
            <ion-chip
              [outline]="activeCategory() !== category.name"
              (click)="setCategory(category.name)"
            >
              {{ category.name }}
            </ion-chip>
          }
          @if (hiddenCategories() > 0) {
            <ion-chip outline class="more" (click)="categoriesExpanded.set(true)">
              +{{ hiddenCategories() }}
            </ion-chip>
          }
          <ion-chip outline class="manage" (click)="categoriesOpen.set(true)">
            <ion-icon name="create-outline" aria-hidden="true"></ion-icon>
            <ion-label>Uredi</ion-label>
          </ion-chip>
        </div>

        @if (tags().length > 0) {
          <div class="filters tags-row">
            <ion-chip [outline]="activeTag() !== null" (click)="setTag(null)">Vse oznake</ion-chip>
            @for (tag of shownTags(); track tag) {
              <ion-chip [outline]="activeTag() !== tag" (click)="setTag(tag)">{{ tag }}</ion-chip>
            }
            @if (hiddenTags() > 0) {
              <ion-chip outline class="more" (click)="tagsExpanded.set(true)">
                +{{ hiddenTags() }}
              </ion-chip>
            }
          </div>
        }

        @if (error(); as message) {
          <ion-text color="danger"><p class="msg">{{ message }}</p></ion-text>
        }

        @if (recipes().length === 0) {
          <!-- Prazen seznam pove, KAJ narediti, ne le da je prazen. Ločeni besedili za "nimaš
               receptov" in "iskanje ni našlo" — drugo ni napaka in gumb za nov recept tam ni
               odgovor. -->
          <div class="empty">
            @if (isFiltered()) {
              <p>Noben recept ne ustreza iskanju.</p>
              <ion-button fill="clear" size="small" (click)="clearFilters()">Počisti iskanje</ion-button>
            } @else if (!loading()) {
              <p>Receptov še ni. Prilepi povezavo do recepta — ostalo poskusimo prebrati s strani.</p>
              <ion-button fill="outline" size="small" (click)="openNew()">
                <ion-icon slot="start" name="add-outline" aria-hidden="true"></ion-icon>
                Nov recept
              </ion-button>
              <ion-button fill="clear" size="small" routerLink="/uvoz">
                <ion-icon slot="start" name="sparkles-outline" aria-hidden="true"></ion-icon>
                Uvozi iz ChatGPT
              </ion-button>
            }
          </div>
        } @else {
          <div class="grid">
            @for (recipe of recipes(); track recipe.id) {
              <button class="card" type="button" (click)="open(recipe)">
                <div class="thumb">
                  @if (coverUrl(recipe); as src) {
                    <img [src]="src" [alt]="recipe.title" loading="lazy" />
                  } @else {
                    <ion-icon name="restaurant-outline" aria-hidden="true"></ion-icon>
                  }
                  @if (recipe.isNew) {
                    <ion-badge class="flag" color="primary">Novo</ion-badge>
                  } @else if (!recipe.isOwn) {
                    <ion-badge class="flag" color="medium">Deljeno</ion-badge>
                  }
                </div>

                <div class="body">
                  <h2>{{ recipe.title }}</h2>

                  <p class="meta">
                    @if (recipe.rating !== null) {
                      <span class="rating" [attr.aria-label]="'Ocena ' + recipe.rating + ' od 5'">
                        @for (star of stars; track star) {
                          <ion-icon
                            [name]="star <= recipe.rating ? 'star' : 'star-outline'"
                            aria-hidden="true"
                          ></ion-icon>
                        }
                      </span>
                    }
                    @if (duration(recipe); as time) {
                      <span><ion-icon name="time-outline" aria-hidden="true"></ion-icon> {{ time }}</span>
                    }
                    @if (recipe.servings !== null) {
                      <span>
                        <ion-icon name="people-outline" aria-hidden="true"></ion-icon>
                        {{ recipe.servings }}
                      </span>
                    }
                  </p>

                  <p class="cooked">
                    <ion-icon name="flame-outline" aria-hidden="true"></ion-icon>
                    {{ lastCooked(recipe) }}
                    @if (recipe.cookCount > 0) {
                      <span class="count">· {{ recipe.cookCount }}×</span>
                    }
                  </p>

                  @if (recipe.sourceHost; as host) {
                    <p class="source"><ion-icon name="link-outline" aria-hidden="true"></ion-icon> {{ host }}</p>
                  }

                  @if (recipe.categories.length > 0) {
                    <p class="cats">{{ recipe.categories.join(' · ') }}</p>
                  }

                  @if (recipe.tags.length > 0) {
                    <p class="tags">
                      @for (tag of recipe.tags; track tag) {
                        <span class="tag">{{ tag }}</span>
                      }
                    </p>
                  }
                </div>
              </button>
            }
          </div>
        }
      </div>
    </ion-content>

    <app-recipe-category-manager
      [isOpen]="categoriesOpen()"
      (closed)="categoriesOpen.set(false)"
      (changed)="onCategoriesChanged()"
    ></app-recipe-category-manager>
  `,
  styles: [
    `
      .recipes {
        padding: 0 8px 24px;
      }
      .toolbar {
        display: flex;
        justify-content: flex-end;
        padding: 4px 8px;
      }
      .filters {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        padding: 4px 8px 8px;
      }
      /* Oznake so vizualno podrejene kategorijam: kategorija je razvrstitev, oznaka je opis. */
      .filters.tags-row {
        padding-top: 0;
        font-size: 0.85em;
      }
      /* Števec skritih čipov je namenoma poudarjen: če bi bil videti kot navaden čip, bi ga
         uporabnik bral kot še eno oznako in ne kot "tu jih je še pet". */
      .filters .more {
        font-weight: 600;
        --color: var(--ion-color-primary);
      }
      .filters .manage {
        margin-left: auto;
      }
      .cats {
        font-weight: 500;
      }
      .msg,
      .empty {
        padding: 8px 16px;
        text-align: center;
      }
      /* auto-fill in ne auto-fit: pri enem samem receptu naj kartica ostane svoje širine in se
         ne razlije čez cel zaslon. */
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
        gap: 12px;
        padding: 8px;
      }
      /* Površina kartice je --cd-surface-raised. Prej je bila Ionicova stopenjska spremenljivka
         z nadomestkom #f7f7f7 — te Ionic 8 ne definira nikjer, zato se je vedno uporabil svetel
         nadomestek, tudi v temni temi, kjer je besedilo belo. Naslov recepta je bil bel na skoraj
         belem in ga ni bilo mogoče prebrati. Lastne spremenljivke te aplikacije so definirane za
         OBE temi (theme/variables.scss) in nadomestka sploh ne potrebujejo; da se stara raba ne
         vrne, jo lovi tests/unit/theme-tokens.spec.ts.
         (Opuscajev v tem komentarju ne sme biti: styles je predloga v opuscajih.) */
      .card {
        display: flex;
        flex-direction: column;
        text-align: left;
        padding: 0;
        border: none;
        border-radius: 12px;
        overflow: hidden;
        background: var(--cd-surface-raised);
        color: var(--ion-text-color);
        cursor: pointer;
      }
      .thumb {
        position: relative;
        aspect-ratio: 4 / 3;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--cd-surface-sunken);
      }
      .thumb img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .thumb ion-icon {
        font-size: 40px;
        color: var(--ion-color-medium);
      }
      .flag {
        position: absolute;
        top: 6px;
        left: 6px;
      }
      .body {
        padding: 8px 10px 12px;
      }
      /* Izrecna barva in ne podedovana: kartica je SVOJA površina in njeno besedilo ne sme biti
         odvisno od tega, kar je pod njo. */
      .body h2 {
        margin: 0 0 4px;
        font-size: 0.95rem;
        line-height: 1.25;
        color: var(--ion-text-color);
      }
      .meta,
      .cooked,
      .source,
      .tags {
        margin: 2px 0;
        font-size: 0.78rem;
        color: var(--ion-color-medium-shade);
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
      }
      /* Oznake na kartici so bile kot navadno besedilo skoraj nevidne, zato dobijo obarvane žetone. */
      .tags {
        margin-top: 6px;
        gap: 4px;
      }
      .tags .tag {
        display: inline-flex;
        align-items: center;
        padding: 2px 8px;
        border-radius: 999px;
        font-size: 0.72rem;
        font-weight: 500;
        line-height: 1.5;
        background: rgba(var(--ion-color-primary-rgb), 0.18);
        color: var(--ion-color-primary);
      }
      .meta span {
        display: inline-flex;
        align-items: center;
        gap: 2px;
      }
      .rating ion-icon {
        color: var(--ion-color-warning);
        font-size: 0.85rem;
      }
    `,
  ],
})
export class RecipesPage implements OnInit, OnDestroy {
  private readonly api = inject(RecipesApi);
  private readonly router = inject(Router);

  readonly recipes = signal<Recipe[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly query = signal('');
  readonly activeTag = signal<string | null>(null);
  readonly activeCategory = signal<string | null>(null);
  readonly categories = signal<RecipeCategory[]>([]);
  readonly categoriesOpen = signal(false);

  // ── Krčenje vrstic filtrov na telefonu ────────────────────────────────────────────────
  //
  // Vrstici kategorij in oznak sta se na ozkem zaslonu prelomili v štiri ali pet vrstic in
  // potisnili prvi recept pod rob zaslona. Vidnih je zato prvih CHIP_LIMIT, ostali pa se skrivajo
  // za števcem "+N", ki jih na tap razpre. Izbira, kaj se pokaže, je ČISTA funkcija
  // (`chip-window.ts`) in je testirana brez brskalnika.
  readonly categoriesExpanded = signal(false);
  readonly tagsExpanded = signal(false);

  /**
   * Ali je zaslon ozek. Prek `matchMedia` in NE prek ugibanja iz širine okna ob nalaganju:
   * uporabnik telefon zavrti, okno na namizju pa spreminja širino, in krčenje se mora temu
   * sproti prilagoditi.
   *
   * Meja 640px je ista kot drugod v tej aplikaciji za "telefon".
   */
  private readonly narrow = signal(false);
  private mediaQuery: MediaQueryList | null = null;
  private readonly onMediaChange = (event: MediaQueryListEvent) => this.narrow.set(event.matches);

  readonly shownCategories = computed(
    () =>
      chipWindow(this.categories(), {
        keyOf: (c) => c.name,
        active: this.activeCategory(),
        expanded: this.categoriesExpanded(),
        narrow: this.narrow(),
      }).shown,
  );
  readonly hiddenCategories = computed(
    () =>
      chipWindow(this.categories(), {
        keyOf: (c) => c.name,
        active: this.activeCategory(),
        expanded: this.categoriesExpanded(),
        narrow: this.narrow(),
      }).hidden,
  );
  readonly shownTags = computed(
    () =>
      chipWindow(this.tags(), {
        keyOf: (t) => t,
        active: this.activeTag(),
        expanded: this.tagsExpanded(),
        narrow: this.narrow(),
      }).shown,
  );
  readonly hiddenTags = computed(
    () =>
      chipWindow(this.tags(), {
        keyOf: (t) => t,
        active: this.activeTag(),
        expanded: this.tagsExpanded(),
        narrow: this.narrow(),
      }).hidden,
  );
  readonly scope = signal<RecipeScope>('all');
  readonly sort = signal<RecipeSort>('recent');

  readonly sortOptions: RecipeSort[] = ['recent', 'title', 'rating', 'cooked'];
  readonly sortLabels = SORT_LABELS;
  readonly stars = [1, 2, 3, 4, 5];

  /**
   * Naslovi slik, pretvorjeni v `objectURL`.
   *
   * Slike se NE morejo naložiti prek `<img src="/api/...">`, ker ta naslov ne gre skozi
   * prestreznik za avtentikacijo in bi vrnil 401 (glej `RecipesApi.imageBlob`). Zato se prenesejo
   * kot `Blob` in se tu shranijo kot `objectURL`.
   *
   * Vsak tak naslov zadrži pomnilnik, dokler ga kdo ne sprosti — zato `ngOnDestroy` in zato
   * čiščenje ob vsakem ponovnem nalaganju seznama. Brez tega bi brskanje po zavihku počasi jedlo
   * pomnilnik, kar je napaka, ki se pokaže šele po pol ure uporabe.
   */
  private readonly covers = signal<Record<string, string>>({});

  /** Oznake iz TRENUTNEGA seznama, ne z ločene poti: oznaka, ki je ni na nobenem vidnem receptu,
   * je filter, ki vrne prazen seznam. */
  readonly tags = computed(() => {
    const all = new Set<string>();
    for (const recipe of this.recipes()) for (const tag of recipe.tags) all.add(tag);
    return [...all].sort((a, b) => a.localeCompare(b, 'sl'));
  });

  readonly hasShared = computed(() => this.recipes().some((recipe) => !recipe.isOwn));

  readonly isFiltered = computed(
    () =>
      this.query().trim().length > 0 ||
      this.activeTag() !== null ||
      this.activeCategory() !== null ||
      this.scope() !== 'all',
  );

  readonly subtitle = computed(() => {
    const count = this.recipes().length;
    if (this.loading() && count === 0) return 'Nalagam …';
    return count === 1 ? '1 recept' : `${count} receptov`;
  });

  /** Ali je bila stran že enkrat naložena — glej ionViewWillEnter. */
  private initialised = false;

  async ngOnInit(): Promise<void> {
    // `matchMedia` ni na voljo v vsakem okolju (strežniški izris, testi brez DOM) — brez njega
    // ostane `narrow` na `false` in vrstici se ne krčita, kar je varno privzeto stanje.
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      this.mediaQuery = window.matchMedia('(max-width: 640px)');
      this.narrow.set(this.mediaQuery.matches);
      this.mediaQuery.addEventListener('change', this.onMediaChange);
    }

    // Besednjak in recepti se naložita vzporedno: čipi kategorij so nad seznamom in bi ob
    // zaporednem nalaganju poskočili šele po tem, ko je seznam že izrisan.
    await Promise.all([this.loadCategories(), this.reload()]);
    this.initialised = true;
  }

  /**
   * Ionic strani PREDPOMNI: ob vrnitvi na že obiskano stran se komponenta ne ustvari znova in
   * `ngOnInit` se ne izvede. Posledica je bila, da je izbrisan recept ostal na seznamu —
   * urejevalnik ga izbriše in preusmeri na `/recipes`, ta stran pa je pokazala star seznam,
   * dokler uporabnik ni osvežil cele strani (F5).
   *
   * Isti hrošč in isti popravek kot v `features/todos/todos.page.ts`; velja za VSAK povratek,
   * ne le za brisanje — tudi nov recept in urejanje sta po tem takoj vidna.
   *
   * Prvi vstop pusti pri miru: takrat je naložil že `ngOnInit` in dvojno branje ni potrebno.
   */
  async ionViewWillEnter(): Promise<void> {
    if (this.initialised) await Promise.all([this.loadCategories(), this.reload()]);
  }

  /** Besednjak kategorij za vrstico čipov.
   *
   * Prihaja z LOČENE poti in ne iz receptov (kot oznake): kategorija sme obstajati, preden je vanjo
   * uvrščen prvi recept — sicer je ne bi bilo mogoče ustvariti vnaprej. */
  private async loadCategories(): Promise<void> {
    try {
      this.categories.set(await this.api.listCategories());
    } catch {
      // Brez besednjaka seznam še vedno deluje; čipov kategorij takrat ni.
      this.categories.set([]);
    }
  }

  ngOnDestroy(): void {
    this.releaseCovers();
    this.mediaQuery?.removeEventListener('change', this.onMediaChange);
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const recipes = await this.api.list({
        q: this.query(),
        tag: this.activeTag() ?? undefined,
        category: this.activeCategory() ?? undefined,
        scope: this.scope(),
        sort: this.sort(),
      });
      this.recipes.set(recipes);
      await this.loadCovers(recipes);
    } catch {
      this.error.set('Receptov ni bilo mogoče naložiti.');
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Naloži naslovne sličice.
   *
   * Zahteva se `variant=thumb`: strežnik vrne pomanjšavo, kadar obstaja, sicer izvirnik — seznam
   * deluje v obeh primerih in odjemalcu ni treba vedeti, katero je dobil (research.md §5).
   *
   * Neuspeh ene slike NE sme pokvariti seznama, zato `catch` na vsaki posebej: recept brez sličice
   * se izriše z nadomestno ikono, kar je natanko tako, kot se izriše recept brez slike.
   */
  private async loadCovers(recipes: Recipe[]): Promise<void> {
    this.releaseCovers();
    const entries = await Promise.all(
      recipes
        .filter((recipe) => recipe.coverImageId)
        .map(async (recipe) => {
          try {
            const blob = await this.api.imageBlob(recipe.id, recipe.coverImageId!, 'thumb');
            return [recipe.id, URL.createObjectURL(blob)] as const;
          } catch {
            return null;
          }
        }),
    );
    this.covers.set(Object.fromEntries(entries.filter((entry): entry is [string, string] => entry !== null)));
  }

  private releaseCovers(): void {
    for (const url of Object.values(this.covers())) URL.revokeObjectURL(url);
    this.covers.set({});
  }

  coverUrl(recipe: Recipe): string | null {
    return this.covers()[recipe.id] ?? null;
  }

  duration(recipe: Recipe): string {
    return formatDuration(recipe.prepMinutes);
  }

  lastCooked(recipe: Recipe): string {
    return formatLastCooked(recipe.lastCookedAt);
  }

  async onQuery(value: string): Promise<void> {
    this.query.set(value);
    await this.reload();
  }

  async setTag(tag: string | null): Promise<void> {
    this.activeTag.set(tag);
    await this.reload();
  }

  /** Klik na že izbrano kategorijo jo ODZNAČI — sicer bi bilo treba za "vse" vedno ciljati prvi
   * čip, kar je pri dolgi vrstici, ki se drsi, nerodno. */
  async setCategory(category: string | null): Promise<void> {
    this.activeCategory.set(category !== null && category === this.activeCategory() ? null : category);
    await this.reload();
  }

  /** Besednjak se je spremenil (dodana, preimenovana, izbrisana kategorija) — osvežiti je treba
   * OBOJE: čipe in recepte, ker preimenovanje spremeni tudi imena na receptih. */
  async onCategoriesChanged(): Promise<void> {
    await Promise.all([this.loadCategories(), this.reload()]);
  }

  async setScope(scope: RecipeScope): Promise<void> {
    this.scope.set(scope);
    await this.reload();
  }

  async setSort(sort: RecipeSort): Promise<void> {
    this.sort.set(sort);
    await this.reload();
  }

  async clearFilters(): Promise<void> {
    this.query.set('');
    this.activeTag.set(null);
    this.activeCategory.set(null);
    this.scope.set('all');
    await this.reload();
  }

  openNew(): void {
    void this.router.navigate(['/recipes', 'new']);
  }

  open(recipe: Recipe): void {
    void this.router.navigate(['/recipes', recipe.id]);
  }
}

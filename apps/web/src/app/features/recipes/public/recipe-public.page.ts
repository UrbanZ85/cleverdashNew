import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import {
  IonChip,
  IonContent,
  IonHeader,
  IonIcon,
  IonNote,
  IonSpinner,
  IonText,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { apiUrl } from '../../../core/api/api-base.js';
import { formatDuration } from '../recipes.model.js';

// JAVNA stran deljenega recepta — `/r/:token`. Tretja pot v tej aplikaciji BREZ `authGuard`, ob
// `/d/:token` (prevzem datoteke) in `/u/:token` (oddaja datoteke).
//
// Odpre jo človek, ki nima računa in ga ne bo dobil (FR-041): `authGuard` bi ga preusmeril na
// Keycloak, `tabGuard` pa preverja točno ujemanje z registrom zavihkov, kjer te poti NI in ne sme
// biti (FR-071).
//
// TA ZASLON JE SAMO ZA BRANJE (FR-043). Tu ni nobenega gumba, ki bi karkoli spremenil — ne
// "skuhano", ne ocene, ne nalaganja slik. To ni pomanjkljivost, ki bi jo kdaj veljalo dopolniti:
// vsaka pisalna poteza bi terjala identiteto, ki je na tej strani po definiciji ni.
//
// Razlika do prijavljenih zaslonov, ki jo je treba poznati: slike se tu nalagajo NARAVNOST prek
// `<img src>` in ne prek `HttpClient`. Na prijavljenih zaslonih to ne gre, ker naslov v atributu
// `src` ne gre skozi prestreznik za avtentikacijo in bi vrnil 401 — tu pa prestreznika ni treba,
// ker pot ne zahteva poverilnic. Zato tudi ni `objectURL`-ov, ki bi jih bilo treba sproščati.

interface PublicRecipe {
  title: string;
  url: string | null;
  description: string | null;
  ingredients: string[];
  steps: string[];
  prepMinutes: number | null;
  servings: number | null;
  tags: string[];
  categories: string[];
  coverImageId: string | null;
  images: { id: string; caption: string | null }[];
  updatedAt: string;
}

@Component({
  selector: 'app-recipe-public-page',
  standalone: true,
  imports: [IonHeader, IonToolbar, IonTitle, IonContent, IonChip, IonIcon, IonNote, IonText, IonSpinner],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ recipe()?.title ?? 'Recept' }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      @if (loading()) {
        <div class="center"><ion-spinner></ion-spinner></div>
      } @else if (error(); as message) {
        <!-- ENAK odgovor za neveljavno, preklicano in neobstoječo povezavo (FR-046): različna
             besedila bi povedala, da je povezava nekoč obstajala. -->
        <div class="center">
          <ion-icon name="restaurant-outline" aria-hidden="true"></ion-icon>
          <ion-text color="medium"><p>{{ message }}</p></ion-text>
        </div>
      } @else if (recipe(); as current) {
        <article class="recipe">
          @if (current.coverImageId; as cover) {
            <button type="button" class="open" (click)="zoom(cover)">
              <img class="cover" [src]="imageSrc(cover)" [alt]="current.title" />
            </button>
          }

          <h1>{{ current.title }}</h1>

          <p class="meta">
            @if (duration(current); as time) {
              <span><ion-icon name="time-outline" aria-hidden="true"></ion-icon> {{ time }}</span>
            }
            @if (current.servings !== null) {
              <span><ion-icon name="people-outline" aria-hidden="true"></ion-icon> {{ current.servings }} porcij</span>
            }
          </p>

          @if (current.categories.length > 0) {
            <div class="tags">
              @for (category of current.categories; track category) {
                <ion-chip color="primary">{{ category }}</ion-chip>
              }
            </div>
          }

          @if (current.tags.length > 0) {
            <div class="tags">
              @for (tag of current.tags; track tag) {
                <ion-chip outline>{{ tag }}</ion-chip>
              }
            </div>
          }

          @if (current.description; as description) {
            <p class="description">{{ description }}</p>
          }

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
                <li>{{ step }}</li>
              }
            </ol>
          }

          @if (otherImages(current).length > 0) {
            <div class="gallery">
              @for (image of otherImages(current); track image.id) {
                <button type="button" class="open" (click)="zoom(image.id)">
                  <img [src]="imageSrc(image.id)" [alt]="image.caption ?? current.title" loading="lazy" />
                </button>
              }
            </div>
          }

          @if (current.url; as source) {
            <p class="source">
              Izvirnik:
              <!-- noopener noreferrer je tu obvezen: povezava kaže na TUJO stran, ki jo je vpisal
                   nekdo drug, in window.opener bi ji sicer dal dostop do tega okna. -->
              <a [href]="source" target="_blank" rel="noopener noreferrer nofollow">{{ source }}</a>
            </p>
          }

          <ion-note class="footer">Recept je bil s teboj deljen prek CleverDasha.</ion-note>
        </article>
      }

      <!-- Povečana slika. Tu ni prenosa prek HttpClienta kot na prijavljenih zaslonih: pot je javna,
           zato naslov v src deluje neposredno in ni objectURL-ov, ki bi jih bilo treba
           sproščati. -->
      @if (zoomed(); as id) {
        <div class="viewer" (click)="closeZoom()">
          <img class="viewer-image" [src]="imageSrc(id)" alt="" />
        </div>
      }
    </ion-content>
  `,
  styles: [
    `
      .center {
        padding: 48px 24px;
        text-align: center;
      }
      .center ion-icon {
        font-size: 48px;
        color: var(--ion-color-medium);
      }
      .recipe {
        max-width: 720px;
        margin: 0 auto;
        padding: 12px 16px 48px;
      }
      .cover {
        width: 100%;
        max-height: 320px;
        object-fit: cover;
        border-radius: 12px;
      }
      h1 {
        font-size: 1.5rem;
        margin: 12px 0 4px;
      }
      .meta {
        display: flex;
        gap: 14px;
        flex-wrap: wrap;
        color: var(--ion-color-medium-shade);
        font-size: 0.9rem;
      }
      .meta span {
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }
      .description {
        white-space: pre-wrap;
      }
      li {
        margin-bottom: 6px;
        line-height: 1.5;
      }
      .gallery {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
        gap: 8px;
        padding-top: 12px;
      }
      .gallery img {
        width: 100%;
        aspect-ratio: 4 / 3;
        object-fit: cover;
        border-radius: 8px;
        display: block;
      }
      .open {
        display: block;
        width: 100%;
        padding: 0;
        border: none;
        background: none;
        cursor: zoom-in;
      }
      .viewer {
        position: fixed;
        inset: 0;
        z-index: 30;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.92);
        cursor: zoom-out;
      }
      .viewer-image {
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
      }
      .source {
        font-size: 0.85rem;
        word-break: break-all;
      }
      .footer {
        display: block;
        padding-top: 24px;
        font-size: 0.78rem;
      }
    `,
  ],
})
export class RecipePublicPage implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);

  readonly recipe = signal<PublicRecipe | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly zoomed = signal<string | null>(null);

  private token = '';

  async ngOnInit(): Promise<void> {
    this.token = this.route.snapshot.paramMap.get('token') ?? '';
    try {
      this.recipe.set(
        // Brez `withCredentials`: pot je javna in piškotek seje tu nima kaj iskati. Pošiljanje
        // poverilnic na javno pot bi pomenilo, da se obisk deljene povezave veže na prijavljenega
        // uporabnika, kar ni ne potrebno ne zaželeno.
        await firstValueFrom(this.http.get<PublicRecipe>(apiUrl(`/shared-recipes/${this.token}`))),
      );
    } catch {
      this.error.set('Ta povezava ne obstaja ali ni več veljavna.');
    } finally {
      this.loading.set(false);
    }
  }

  /** Slika je vezana na ŽETON in ne na identifikator recepta — pot brez žetona bi bila odprta pot
   * do vsake slike v bazi. */
  imageSrc(imageId: string): string {
    return apiUrl(`/shared-recipes/${this.token}/images/${imageId}`);
  }

  zoom(imageId: string): void {
    this.zoomed.set(imageId);
  }

  closeZoom(): void {
    this.zoomed.set(null);
  }

  otherImages(recipe: PublicRecipe): { id: string; caption: string | null }[] {
    return recipe.images.filter((image) => image.id !== recipe.coverImageId);
  }

  duration(recipe: PublicRecipe): string {
    return formatDuration(recipe.prepMinutes);
  }
}

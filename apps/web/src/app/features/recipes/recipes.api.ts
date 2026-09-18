import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { apiUrl } from '../../core/api/api-base.js';
import type {
  MemberRole,
  Recipe,
  RecipeCategory,
  RecipeDraft,
  RecipeImage,
  RecipeScope,
  RecipeSort,
} from './recipes.model.js';

// Odjemalec modula "Recepti". Uvaža samo iz `core/` in iz lastne mape — nikoli iz druge
// funkcionalnosti pod `features/` (člen I).
//
// Vsaka mutacija recepta vrne CEL nov recept, zato tu ni delnih posodobitev in odjemalcu ni treba
// ugibati novega stanja (npr. koliko je števec kuhanj po kliku) — enak dogovor kot v modulu 010.
// Izjemi sta brisanje in odhod, ki vrneta 204: po njiju zapisa ni ali ga klicatelj ne sme videti.

@Injectable({ providedIn: 'root' })
export class RecipesApi {
  private readonly http = inject(HttpClient);

  private readonly opts = { withCredentials: true } as const;

  private path(suffix = ''): string {
    return apiUrl(`/recipes${suffix}`);
  }

  list(
    params: {
      q?: string;
      tag?: string;
      category?: string;
      scope?: RecipeScope;
      sort?: RecipeSort;
      limit?: number;
    } = {},
  ): Promise<Recipe[]> {
    const search = new URLSearchParams();
    if (params.q?.trim()) search.set('q', params.q.trim());
    if (params.tag) search.set('tag', params.tag);
    // Kategorija in oznaka sta LOČENA filtra in ju je mogoče uporabiti hkrati.
    if (params.category) search.set('category', params.category);
    if (params.scope && params.scope !== 'all') search.set('scope', params.scope);
    if (params.sort) search.set('sort', params.sort);
    if (params.limit) search.set('limit', String(params.limit));
    const suffix = search.size > 0 ? `?${search.toString()}` : '';

    return firstValueFrom(
      this.http.get<{ recipes: Recipe[] }>(this.path(suffix), this.opts),
    ).then((res) => res.recipes);
  }

  /** Odprtje pobriše oznako "novo" na strežniku (FR-038) — zato ta klic ni brez stranskega
   * učinka in ga ne kličemo ob vsakem izrisu seznama. */
  get(recipeId: string): Promise<Recipe> {
    return firstValueFrom(this.http.get<Recipe>(this.path(`/${recipeId}`), this.opts));
  }

  create(draft: RecipeDraft): Promise<Recipe> {
    return firstValueFrom(this.http.post<Recipe>(this.path(), draft, this.opts));
  }

  /** Izpuščeno polje pomeni "ne spreminjaj", `null` pomeni "pobriši" — enak dogovor kot pri
   * `PATCH /settings`. Zato tu ni `??` in se `null` ne sme tiho spremeniti v `undefined`. */
  update(recipeId: string, patch: Partial<RecipeDraft>): Promise<Recipe> {
    return firstValueFrom(this.http.patch<Recipe>(this.path(`/${recipeId}`), patch, this.opts));
  }

  remove(recipeId: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(this.path(`/${recipeId}`), this.opts));
  }

  /** "Skuhal sem." Datum je neobvezen — brez njega je zdaj. */
  markCooked(recipeId: string, cookedAt?: Date): Promise<Recipe> {
    const body = cookedAt ? { cookedAt: cookedAt.toISOString() } : {};
    return firstValueFrom(this.http.post<Recipe>(this.path(`/${recipeId}/cooked`), body, this.opts));
  }

  /** Ponovni uvoz z izvorne strani. `overwrite: true` prepiše tudi izpolnjena polja in se ponudi
   * izrecno ("prevzemi vse s strani"), nikoli kot privzeto vedenje (FR-014). */
  reimport(recipeId: string, overwrite = false): Promise<Recipe> {
    return firstValueFrom(
      this.http.post<Recipe>(this.path(`/${recipeId}/import`), { overwrite }, this.opts),
    );
  }

  // ── slike ────────────────────────────────────────────────────────────────────────────────

  listImages(recipeId: string): Promise<RecipeImage[]> {
    return firstValueFrom(
      this.http.get<{ images: RecipeImage[] }>(this.path(`/${recipeId}/images`), this.opts),
    ).then((res) => res.images);
  }

  /** Naloži sliko. Telo je SUROV `Blob`, `Content-Type` je vrsta slike — strežnik za to pot
   * uporablja `express.raw`, ne multipart. Strežnik vrsto vseeno ugotovi iz VSEBINE in tej glavi
   * ne verjame (FR-021); glava je tu zato, ker jo `express.raw` uporabi za izbiro razčlenjevalnika. */
  uploadImage(
    recipeId: string,
    file: Blob,
    options: { caption?: string; width?: number; height?: number; cover?: boolean } = {},
  ): Promise<RecipeImage> {
    const search = new URLSearchParams();
    if (options.caption?.trim()) search.set('caption', options.caption.trim());
    if (options.width) search.set('width', String(options.width));
    if (options.height) search.set('height', String(options.height));
    if (options.cover) search.set('cover', 'true');
    const suffix = search.size > 0 ? `?${search.toString()}` : '';

    return firstValueFrom(
      this.http.post<RecipeImage>(this.path(`/${recipeId}/images${suffix}`), file, {
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        withCredentials: true,
      }),
    );
  }

  /** Pomanjšava za seznam, izračunana v brskalniku (research.md §5). Ločena zahteva, ker je telo
   * surovo in dveh teles ena zahteva nima. Neuspeh TU NI usoden — slika je že naložena in seznam
   * bo pokazal izvirnik. */
  uploadThumb(recipeId: string, imageId: string, thumb: Blob): Promise<void> {
    return firstValueFrom(
      this.http.put<void>(this.path(`/${recipeId}/images/${imageId}/thumb`), thumb, {
        headers: { 'Content-Type': thumb.type || 'application/octet-stream' },
        withCredentials: true,
      }),
    );
  }

  /**
   * Bajti slike.
   *
   * Prenese se prek `HttpClient` in NE prek `<img src="/api/...">`: naslov v atributu `src` ne gre
   * skozi prestreznik (core/auth/auth.interceptor.ts), zato bi bil brez glave `Authorization` in
   * bi vrnil 401. Klicatelj iz vrnjenega `Blob` naredi `objectURL` in ga po uporabi sprosti.
   *
   * Ista past kot pri zvočnih posnetkih beležk; tam je bila to prava napaka.
   */
  imageBlob(recipeId: string, imageId: string, variant?: 'thumb'): Promise<Blob> {
    const suffix = variant ? '?variant=thumb' : '';
    return firstValueFrom(
      this.http.get(this.path(`/${recipeId}/images/${imageId}${suffix}`), {
        responseType: 'blob',
        withCredentials: true,
      }),
    );
  }

  setCover(recipeId: string, imageId: string): Promise<Recipe> {
    return firstValueFrom(
      this.http.patch<Recipe>(this.path(`/${recipeId}/images/${imageId}`), { cover: true }, this.opts),
    );
  }

  removeImage(recipeId: string, imageId: string): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(this.path(`/${recipeId}/images/${imageId}`), this.opts),
    );
  }

  // ── besednjak kategorij ──────────────────────────────────────────────────────────────────

  listCategories(): Promise<RecipeCategory[]> {
    return firstValueFrom(
      this.http.get<{ categories: RecipeCategory[] }>(apiUrl('/recipe-categories'), this.opts),
    ).then((res) => res.categories);
  }

  createCategory(name: string): Promise<RecipeCategory> {
    return firstValueFrom(
      this.http.post<RecipeCategory>(apiUrl('/recipe-categories'), { name }, this.opts),
    );
  }

  /** Preimenovanje popravi ime tudi v vseh LASTNIH receptih; odgovor pove, koliko jih je bilo. */
  renameCategory(
    categoryId: string,
    name: string,
  ): Promise<{ category: RecipeCategory; updatedRecipes: number }> {
    return firstValueFrom(
      this.http.patch<{ category: RecipeCategory; updatedRecipes: number }>(
        apiUrl(`/recipe-categories/${categoryId}`),
        { name },
        this.opts,
      ),
    );
  }

  /** Izbris kategorijo odstrani iz receptov — receptov NE izbriše. */
  deleteCategory(categoryId: string): Promise<{ updatedRecipes: number }> {
    return firstValueFrom(
      this.http.delete<{ updatedRecipes: number }>(apiUrl(`/recipe-categories/${categoryId}`), this.opts),
    );
  }

  /** Pošlje CEL vrstni red, ne relativnega premika. */
  reorderCategories(categoryIds: string[]): Promise<void> {
    return firstValueFrom(
      this.http.put<void>(apiUrl('/recipe-categories/order'), { categoryIds }, this.opts),
    );
  }

  // ── deljenje ─────────────────────────────────────────────────────────────────────────────

  setMember(recipeId: string, userId: string, role: MemberRole): Promise<Recipe> {
    return firstValueFrom(
      this.http.put<Recipe>(this.path(`/${recipeId}/members/${userId}`), { role }, this.opts),
    );
  }

  removeMember(recipeId: string, userId: string): Promise<Recipe> {
    return firstValueFrom(
      this.http.delete<Recipe>(this.path(`/${recipeId}/members/${userId}`), this.opts),
    );
  }

  /** Vrne 204: po odhodu klicatelj recepta ne sme več videti, zato ni česa vrniti. */
  leave(recipeId: string): Promise<void> {
    return firstValueFrom(this.http.post<void>(this.path(`/${recipeId}/leave`), {}, this.opts));
  }

  createPublicLink(recipeId: string): Promise<Recipe> {
    return firstValueFrom(this.http.post<Recipe>(this.path(`/${recipeId}/public-link`), {}, this.opts));
  }

  revokePublicLink(recipeId: string): Promise<Recipe> {
    return firstValueFrom(this.http.delete<Recipe>(this.path(`/${recipeId}/public-link`), this.opts));
  }
}

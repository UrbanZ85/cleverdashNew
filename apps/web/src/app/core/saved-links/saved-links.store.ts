import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { apiUrl } from '../api/api-base.js';
import type {
  CreatedSavedLink,
  SavedLink,
  SavedLinkDraft,
  SavedLinkGroup,
} from './saved-link.model.js';

export type {
  CreatedSavedLink,
  LinkSection,
  MetadataStatus,
  SavedLink,
  SavedLinkDraft,
  SavedLinkGroup,
  TitleSource,
} from './saved-link.model.js';

/**
 * Edini odjemalec poti `/saved-links*` in `/saved-link-groups*`.
 *
 * Živi v `core/` in ne v `features/saved-links/`, ker jo potrebuje TUDI ploščica na nadzorni
 * plošči — ta je registrirana prek `shared/tiles/tile-registry.ts` in bi drugače uvažala iz
 * tuje funkcionalnosti (člen I). Vzorec je isti kot `core/settings/settings.store.ts`:
 * signali + `ensureLoaded()`, ki si ga sočasni klicatelji delijo.
 *
 * Seznam se naloži ENKRAT in v celoti, iskanje pa teče nad naloženim seznamom v pomnilniku
 * (SC-003: pri 500 zapisih pod sekundo, brez klica na strežnik ob vsaki tipki). Parametra `q`
 * in `groupId` na strežniku vseeno obstajata — člen III zahteva, da je isto iskanje mogoče
 * opraviti tudi s HTTP klicem.
 */
@Injectable({ providedIn: 'root' })
export class SavedLinksStore {
  private readonly http = inject(HttpClient);

  private readonly linksState = signal<SavedLink[]>([]);
  private readonly groupsState = signal<SavedLinkGroup[]>([]);
  private readonly loadingState = signal(false);
  private readonly loadedState = signal(false);
  private readonly errorState = signal<string | null>(null);
  private inFlight: Promise<void> | null = null;

  readonly links = this.linksState.asReadonly();
  readonly groups = this.groupsState.asReadonly();
  readonly loading = this.loadingState.asReadonly();
  readonly loaded = this.loadedState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly count = computed(() => this.linksState().length);

  async ensureLoaded(): Promise<void> {
    if (this.loadedState()) return;
    return this.reload();
  }

  /** Naloži zapise in mape. Sočasni klicatelji si delijo isto zahtevo. */
  reload(): Promise<void> {
    this.inFlight ??= this.load().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async load(): Promise<void> {
    this.loadingState.set(true);
    try {
      const [links, groups] = await Promise.all([
        firstValueFrom(
          this.http.get<{ links: SavedLink[] }>(apiUrl('/saved-links'), { withCredentials: true }),
        ),
        firstValueFrom(
          this.http.get<{ groups: SavedLinkGroup[] }>(apiUrl('/saved-link-groups'), {
            withCredentials: true,
          }),
        ),
      ]);
      this.linksState.set(links.links);
      this.groupsState.set(groups.groups);
      this.errorState.set(null);
      this.loadedState.set(true);
    } catch {
      this.errorState.set('Shranjenih linkov ni bilo mogoče naložiti. Poskusi znova.');
    } finally {
      this.loadingState.set(false);
    }
  }

  /** Nazadnje shranjeni — za ploščico na nadzorni plošči (FR-050). Ne gre skozi shrambo
   * seznama: ploščica potrebuje `sort=recent` in svojih šest zapisov, ne celotne knjižnice. */
  recent(limit: number): Promise<{ links: SavedLink[] }> {
    return firstValueFrom(
      this.http.get<{ links: SavedLink[] }>(apiUrl(`/saved-links?sort=recent&limit=${limit}`), {
        withCredentials: true,
      }),
    );
  }

  /**
   * Bajti favicona, prenešeni PREK NAŠEGA STREŽNIKA (člen VIII, SC-005).
   *
   * Gre prek `HttpClient` in NE prek `<img src="/api/…">`: naslov v atributu `src` ne gre
   * skozi prestreznik (core/auth/auth.interceptor.ts), zato bi bil brez glave `Authorization`
   * in bi vrnil 401 (ista opomba kot pri posnetkih beležk). Klicatelj iz Bloba naredi
   * `objectURL` in ga po uporabi sprosti.
   */
  faviconBlob(linkId: string): Promise<Blob> {
    return firstValueFrom(
      this.http.get(apiUrl(`/saved-links/${linkId}/favicon`), {
        responseType: 'blob',
        withCredentials: true,
      }),
    );
  }

  // ── Zapisi ─────────────────────────────────────────────────────────────────────────────

  async create(draft: SavedLinkDraft): Promise<CreatedSavedLink> {
    const created = await firstValueFrom(
      this.http.post<CreatedSavedLink>(apiUrl('/saved-links'), draft, { withCredentials: true }),
    );
    await this.reload();
    return created;
  }

  async update(linkId: string, patch: Partial<SavedLinkDraft>): Promise<SavedLink> {
    const updated = await firstValueFrom(
      this.http.patch<SavedLink>(apiUrl(`/saved-links/${linkId}`), patch, { withCredentials: true }),
    );
    await this.reload();
    return updated;
  }

  async remove(linkId: string): Promise<void> {
    await firstValueFrom(
      this.http.delete<void>(apiUrl(`/saved-links/${linkId}`), { withCredentials: true }),
    );
    await this.reload();
  }

  /** Ponovno branje strani na IZRECNO zahtevo (FR-014). `force` prepiše tudi ime, ki ga je
   * vpisal uporabnik — vmesnik to ponudi kot ločeno dejanje ("prevzemi ime s strani"). */
  async refreshMetadata(linkId: string, force = false): Promise<SavedLink> {
    const updated = await firstValueFrom(
      this.http.post<SavedLink>(
        apiUrl(`/saved-links/${linkId}/refresh-metadata`),
        { force },
        { withCredentials: true },
      ),
    );
    await this.reload();
    return updated;
  }

  /** Vrstni red znotraj ENE mape — ena operacija s celotnim seznamom (FR-032). Zapisi zunaj
   * seznama ostanejo nedotaknjeni, zato prerazporeditev ene mape ne premeša drugih. */
  async reorderLinks(groupId: string | null, linkIds: string[]): Promise<void> {
    await firstValueFrom(
      this.http.put<void>(apiUrl('/saved-links/order'), { groupId, linkIds }, { withCredentials: true }),
    );
    await this.reload();
  }

  // ── Mape ───────────────────────────────────────────────────────────────────────────────

  async createGroup(name: string): Promise<SavedLinkGroup> {
    const group = await firstValueFrom(
      this.http.post<SavedLinkGroup>(apiUrl('/saved-link-groups'), { name }, { withCredentials: true }),
    );
    await this.reload();
    return group;
  }

  async patchGroup(
    groupId: string,
    patch: { name?: string; collapsed?: boolean },
  ): Promise<SavedLinkGroup> {
    const group = await firstValueFrom(
      this.http.patch<SavedLinkGroup>(apiUrl(`/saved-link-groups/${groupId}`), patch, {
        withCredentials: true,
      }),
    );
    // Zlaganje mape se shrani na strežnik (US3, scenarij 2), a ne sme povzročiti ponovnega
    // branja celotnega seznama — zato se posodobi samo ta mapa v pomnilniku.
    this.groupsState.update((groups) => groups.map((g) => (g.id === groupId ? { ...g, ...group } : g)));
    return group;
  }

  /** Brisanje mape zapise PREMAKNE med nerazvrščene (FR-022). Vrne, koliko jih je bilo. */
  async removeGroup(groupId: string): Promise<{ movedLinks: number }> {
    const result = await firstValueFrom(
      this.http.delete<{ movedLinks: number }>(apiUrl(`/saved-link-groups/${groupId}`), {
        withCredentials: true,
      }),
    );
    await this.reload();
    return result;
  }

  async reorderGroups(groupIds: string[]): Promise<void> {
    await firstValueFrom(
      this.http.put<void>(apiUrl('/saved-link-groups/order'), { groupIds }, { withCredentials: true }),
    );
    await this.reload();
  }
}

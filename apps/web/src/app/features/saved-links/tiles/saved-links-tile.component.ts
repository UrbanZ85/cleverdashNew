import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonButton, IonIcon, IonItem, IonLabel, IonList, IonText } from '@ionic/angular/standalone';
import { TileCardComponent } from '../../../shared/layout/tile-card.component.js';
import { ForegroundRefreshService } from '../../../core/refresh/foreground-refresh.service.js';
import { SavedLinksStore } from '../../../core/saved-links/saved-links.store.js';
import { linkHost, type SavedLink } from '../../../core/saved-links/saved-link.model.js';
import { LinkIconComponent } from '../link-icon.component.js';

const MAX_SHOWN = 6;

// Ploščica "Shranjeni linki" na nadzorni plošči (US5, FR-050).
//
// Kaže 6 NAZADNJE shranjenih (`GET /saved-links?sort=recent&limit=6`). Nastavljivost
// (izbrana mapa, drugačno število) NI v obsegu 008 (research.md §11) — terjala bi nov
// razdelek v zaslonu Nastavitve, torej datoteko v TUJI funkcionalnosti.
//
// Izpad te ploščice ne sme vplivati na druge (FR-051): napaka se ujame tukaj in ploščica
// pokaže besedilo, ne pa da bi vrgla naprej.
@Component({
  selector: 'app-saved-links-tile',
  standalone: true,
  imports: [TileCardComponent, LinkIconComponent, IonList, IonItem, IonLabel, IonButton, IonIcon, IonText],
  template: `
    <app-tile-card title="Shranjeni linki" [subtitle]="subtitle()" icon="bookmarks-outline" [loading]="loading()">
      <ion-button slot="actions" fill="clear" size="small" (click)="openTab()" aria-label="Odpri zavihek Shranjeni linki">
        <ion-icon slot="icon-only" name="chevron-forward-outline"></ion-icon>
      </ion-button>

      @if (error(); as message) {
        <ion-text color="danger"><p class="note">{{ message }}</p></ion-text>
      }

      @if (links().length === 0) {
        @if (!loading()) {
          <div class="empty">
            <p class="note cd-muted">Shranjenih strani še ni.</p>
            <ion-button fill="clear" size="small" (click)="openTab()">Shrani prvo</ion-button>
          </div>
        }
      } @else {
        <ion-list lines="none">
          @for (link of links(); track link.id) {
            <ion-item class="row" button (click)="open(link)">
              <app-link-icon slot="start" [link]="link"></app-link-icon>
              <ion-label>
                <span>{{ link.title }}</span>
                <small class="host">{{ host(link) }}</small>
              </ion-label>
              <ion-icon slot="end" name="open-outline" aria-hidden="true"></ion-icon>
            </ion-item>
          }
        </ion-list>
      }
    </app-tile-card>
  `,
  styles: `
    .row {
      --min-height: 38px;
      --padding-start: 0;
      cursor: pointer;
    }
    .host {
      display: block;
      font-size: var(--cd-font-size-xs);
      opacity: 0.7;
    }
    .note {
      margin: 0 0 var(--cd-space-2);
      font-size: var(--cd-font-size-sm);
    }
    .empty {
      text-align: center;
      padding: var(--cd-space-3) 0;
    }
  `,
})
export class SavedLinksTileComponent implements OnInit, OnDestroy {
  private readonly store = inject(SavedLinksStore);
  private readonly refresh = inject(ForegroundRefreshService);
  private readonly router = inject(Router);

  readonly links = signal<SavedLink[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  private unregister?: () => void;

  ngOnInit(): void {
    // `refreshOnNavigation`: `ion-router-outlet` stran predpomni, zato klik na "Nadzorna
    // plošča" ne ustvari nove komponente in `ngOnInit` se ne izvede znova. Brez tega bi
    // ploščica kazala stanje izpred prvega obiska (ista opomba kot pri ploščici Opravila).
    this.unregister = this.refresh.register(() => this.load(), { refreshOnNavigation: true });
  }

  ngOnDestroy(): void {
    this.unregister?.();
  }

  async load(): Promise<{ intervalMs: number }> {
    try {
      const res = await this.store.recent(MAX_SHOWN);
      this.links.set(res.links);
      this.error.set(null);
    } catch {
      // Zadnje znano stanje ostane na zaslonu — ploščica, ki ob prehodni napaki izgine, je
      // slabša od ploščice, ki kaže malo star podatek.
      if (this.links().length === 0) this.error.set('Shranjenih linkov ni bilo mogoče naložiti.');
    } finally {
      this.loading.set(false);
    }
    // Shranjene strani se ne spreminjajo same od sebe — samodejnega osveževanja ta ploščica
    // ne potrebuje. Interval je dolg zato, ker se seznam spremeni samo, ko uporabnik nekaj
    // shrani, in takrat ga osveži prehod na nadzorno ploščo (`refreshOnNavigation` zgoraj).
    return { intervalMs: 15 * 60 * 1000 };
  }

  subtitle(): string | null {
    const count = this.links().length;
    return count === 0 ? null : 'nazadnje shranjene';
  }

  host(link: SavedLink): string {
    return linkHost(link.url);
  }

  /** Klik odpre stran v NOVEM zavihku z `noopener noreferrer` (FR-040) — nadzorna plošča
   * ostane odprta, tuja stran pa ne izve, s katerega naslova je bila odprta. */
  open(link: SavedLink): void {
    window.open(link.url, '_blank', 'noopener,noreferrer');
  }

  openTab(): void {
    void this.router.navigate(['/saved-links']);
  }
}

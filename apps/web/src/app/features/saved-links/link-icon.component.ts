import { Component, Input, OnChanges, OnDestroy, inject, signal } from '@angular/core';
import { IonIcon } from '@ionic/angular/standalone';
import { SavedLinksStore } from '../../core/saved-links/saved-links.store.js';
import {
  FALLBACK_LINK_ICON,
  usesFavicon,
  type SavedLink,
} from '../../core/saved-links/saved-link.model.js';

// research.md §9: vrstni red prednosti je uporabnikova ikona → favicon → `link-outline`.
// Izrecna izbira uporabnika je močnejša od samodejno pridobljenega; kdor hoče favicon nazaj,
// ikono odstrani. Zato je `icon: null` "brez izbire" in ne "privzeta ikona".
//
// Ena komponenta za seznam IN za ploščico, ker je pravilo prednosti eno — dva izvoda bi se
// razšla ob prvi spremembi.
//
// Favicon se prenese prek `HttpClient` in objectURL, NE prek `<img src="/api/…">`: naslov v
// atributu `src` ne gre skozi prestreznik in bi vrnil 401 (glej SavedLinksStore.faviconBlob).
// Odjemalec tujega gostitelja ne kliče nikoli (člen VIII, SC-005).
@Component({
  selector: 'app-link-icon',
  standalone: true,
  imports: [IonIcon],
  template: `
    @if (objectUrl(); as src) {
      <img [src]="src" alt="" width="20" height="20" />
    } @else {
      <ion-icon [name]="iconName()" aria-hidden="true"></ion-icon>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 20px;
      height: 20px;
    }
    img {
      width: 20px;
      height: 20px;
      object-fit: contain;
      border-radius: 3px;
    }
    ion-icon {
      font-size: 20px;
      color: var(--ion-color-medium);
    }
  `,
})
export class LinkIconComponent implements OnChanges, OnDestroy {
  private readonly store = inject(SavedLinksStore);

  @Input({ required: true }) link!: SavedLink;

  protected readonly objectUrl = signal<string | null>(null);
  /** Kar se izriše, dokler favicona ni (ali ga sploh ne bo). */
  protected readonly iconName = signal<string>(FALLBACK_LINK_ICON);

  ngOnChanges(): void {
    this.release();
    this.iconName.set(this.link.icon ?? FALLBACK_LINK_ICON);
    if (usesFavicon(this.link)) void this.loadFavicon(this.link.id);
  }

  ngOnDestroy(): void {
    this.release();
  }

  private async loadFavicon(linkId: string): Promise<void> {
    try {
      const blob = await this.store.faviconBlob(linkId);
      // Zapis se je med prenosom lahko zamenjal (seznam se osveži) — takrat slika ne pripada
      // več temu zapisu in se zavrže.
      if (this.link.id !== linkId) return;
      this.objectUrl.set(URL.createObjectURL(blob));
    } catch {
      // Favicona ni ali prenos je spodletel. To NI napaka, ki bi jo bilo treba pokazati
      // uporabniku (research.md §9) — izriše se ikona, ki je že nastavljena.
    }
  }

  private release(): void {
    const url = this.objectUrl();
    if (url) URL.revokeObjectURL(url);
    this.objectUrl.set(null);
  }
}

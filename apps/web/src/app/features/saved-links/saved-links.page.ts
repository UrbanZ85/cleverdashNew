import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  AlertController,
  IonBadge,
  IonButton,
  IonContent,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonReorder,
  IonReorderGroup,
  IonSearchbar,
  IonSpinner,
  IonText,
  type ItemReorderEventDetail,
} from '@ionic/angular/standalone';
import { PageHeaderComponent } from '../../shared/layout/page-header.component.js';
import { SavedLinksStore } from '../../core/saved-links/saved-links.store.js';
import {
  groupLinks,
  linkHost,
  metadataBadge,
  type LinkSection,
  type SavedLink,
} from '../../core/saved-links/saved-link.model.js';
import { foldForSearch } from '../../core/search/fold-text.js';
import { LinkEditorComponent } from './link-editor.component.js';
import { LinkIconComponent } from './link-icon.component.js';
import { GroupEditorComponent } from './group-editor.component.js';

// Zavihek "Shranjeni linki" (platform/tabs/registry.ts, id `saved-links`).
//
// Seznam se naloži ENKRAT in v celoti, iskanje pa teče nad naloženim seznamom v pomnilniku
// (SC-003: pri 500 zapisih pod sekundo). Klic na strežnik ob vsaki tipki bi bil počasnejši in
// popolnoma nepotreben — zbirka je nekaj sto zapisov (spec.md, Assumptions). Iskanje prek HTTP
// vseeno obstaja (`GET /saved-links?q=`), ker člen III zahteva, da je vsaka operacija vmesnika
// izvedljiva tudi s klicem.
//
// Zlaganje šumnikov je ISTO pravilo kot na strežniku (core/search/fold-text.ts) — brez tega bi
// isto iskanje na zaslonu in prek HTTP dalo dva različna izida.
@Component({
  selector: 'app-saved-links-page',
  standalone: true,
  imports: [
    FormsModule,
    PageHeaderComponent,
    LinkEditorComponent,
    LinkIconComponent,
    GroupEditorComponent,
    IonContent,
    IonSearchbar,
    IonList,
    IonItem,
    IonLabel,
    IonButton,
    IonIcon,
    IonBadge,
    IonNote,
    IonText,
    IonSpinner,
    IonReorder,
    IonReorderGroup,
  ],
  template: `
    <app-page-header title="Shranjeni linki" [subtitle]="subtitle()">
      <ion-button slot="end" (click)="openNew(null)" aria-label="Shrani stran">
        <ion-icon slot="icon-only" name="add-outline"></ion-icon>
      </ion-button>
      <ion-button slot="end" (click)="toggleGroups()" aria-label="Uredi mape">
        <ion-icon slot="icon-only" name="folder-outline"></ion-icon>
      </ion-button>
    </app-page-header>

    <ion-content>
      <div class="links">
        @if (editorOpen()) {
          <app-link-editor
            [link]="editing()"
            [groups]="store.groups()"
            [defaultGroupId]="editorGroupId()"
            (saved)="onSaved($event)"
            (cancelled)="closeEditor()"
            (showLink)="highlight($event)"
          ></app-link-editor>
        }

        @if (groupsOpen()) {
          <app-group-editor (closed)="groupsOpen.set(false)"></app-group-editor>
        }

        <!-- Dejanji sta TU in ne le kot ikoni v glavi. Ikona mape v glavi je bila edina pot do
             urejanja map in je nihče ni našel — ikona brez besedila ne pove, da za njo sploh
             kaj je. Gumba z besedilom sta prva stvar nad seznamom. -->
        <div class="actions">
          <ion-button size="small" (click)="openNew(null)">
            <ion-icon slot="start" name="add-outline" aria-hidden="true"></ion-icon>
            Shrani stran
          </ion-button>
          <ion-button size="small" fill="outline" (click)="toggleGroups()">
            <ion-icon slot="start" name="folder-outline" aria-hidden="true"></ion-icon>
            {{ groupsOpen() ? 'Zapri mape' : 'Mape' }}
            @if (store.groups().length > 0) {
              <ion-badge slot="end" color="medium">{{ store.groups().length }}</ion-badge>
            }
          </ion-button>
        </div>

        <ion-searchbar
          placeholder="Išči po imenu, naslovu in komentarju"
          [debounce]="100"
          [value]="query()"
          (ionInput)="query.set($any($event).detail.value ?? '')"
        ></ion-searchbar>

        @if (store.error(); as message) {
          <ion-text color="danger"><p class="msg">{{ message }}</p></ion-text>
        }

        @if (store.loading() && !store.loaded()) {
          <!-- Stanje nalaganja, nikoli prazen bel zaslon (FR-071). -->
          <div class="empty">
            <ion-spinner name="dots" aria-label="Nalaganje"></ion-spinner>
          </div>
        } @else if (store.count() === 0) {
          <div class="empty">
            <p>Shranjenih strani še ni. Prilepi naslov in shrani prvo.</p>
            <ion-button fill="outline" size="small" (click)="openNew(null)">
              <ion-icon slot="start" name="add-outline" aria-hidden="true"></ion-icon>
              Shrani stran
            </ion-button>
          </div>
        } @else if (visible().length === 0) {
          <!-- Iskanje brez izida NI napaka in gumb za nov zapis tu ni odgovor (US2, scenarij 4). -->
          <div class="empty">
            <p>Nobena shranjena stran ne ustreza iskanju “{{ query() }}”.</p>
            <ion-button fill="clear" size="small" (click)="query.set('')">Počisti iskanje</ion-button>
          </div>
        } @else {
          @for (section of sections(); track section.group?.id ?? 'ungrouped') {
            <div class="section">
              <div class="section-head">
                <ion-button
                  fill="clear"
                  size="small"
                  [disabled]="!section.group"
                  (click)="toggleCollapsed(section)"
                  [attr.aria-label]="section.group ? 'Zloži ali razpri mapo ' + section.group.name : 'Nerazvrščeni'"
                >
                  <ion-icon
                    slot="icon-only"
                    [name]="isCollapsed(section) ? 'chevron-forward-outline' : 'chevron-down-outline'"
                  ></ion-icon>
                </ion-button>
                <h2>
                  @if (section.group) {
                    <ion-icon name="folder-outline" aria-hidden="true"></ion-icon>
                    {{ section.group.name }}
                  } @else {
                    Nerazvrščeni
                  }
                  <ion-note>{{ section.links.length }}</ion-note>
                </h2>
                <ion-button fill="clear" size="small" (click)="openNew(section.group?.id ?? null)">
                  <ion-icon slot="icon-only" name="add-outline"></ion-icon>
                </ion-button>
              </div>

              @if (!isCollapsed(section)) {
                @if (section.links.length === 0) {
                  <p class="msg cd-muted">Ta mapa je prazna.</p>
                } @else {
                  <ion-list>
                    <!-- Prerazporejanje je omogočeno samo BREZ iskanja: vrstni red, shranjen iz
                         filtriranega seznama, bi premešal zapise, ki jih uporabnik takrat niti
                         ne vidi (FR-032 govori o celotni mapi). -->
                    <ion-reorder-group
                      [disabled]="isFiltered()"
                      (ionItemReorder)="onReorder(section, $any($event).detail)"
                    >
                      @for (link of section.links; track link.id) {
                        <ion-item
                          button
                          [class.highlighted]="highlighted() === link.id"
                          (click)="open(link)"
                        >
                          <app-link-icon slot="start" [link]="link"></app-link-icon>
                          <ion-label>
                            <h3>
                              {{ link.title }}
                              @if (badge(link); as info) {
                                <ion-badge [color]="info.color" [title]="info.hint">{{ info.text }}</ion-badge>
                              }
                            </h3>
                            <p class="host">{{ host(link) }}</p>
                            @if (link.comment) {
                              <p class="comment">{{ link.comment }}</p>
                            }
                          </ion-label>
                          @if (badge(link)) {
                            <ion-button
                              slot="end"
                              fill="clear"
                              size="small"
                              aria-label="Osveži podatke strani"
                              (click)="refresh(link, $event)"
                            >
                              <ion-icon slot="icon-only" name="refresh-outline"></ion-icon>
                            </ion-button>
                          }
                          <ion-button
                            slot="end"
                            fill="clear"
                            size="small"
                            [attr.aria-label]="'Uredi ' + link.title"
                            (click)="edit(link, $event)"
                          >
                            <ion-icon slot="icon-only" name="create-outline"></ion-icon>
                          </ion-button>
                          <ion-button
                            slot="end"
                            fill="clear"
                            size="small"
                            color="danger"
                            [attr.aria-label]="'Izbriši ' + link.title"
                            (click)="confirmDelete(link, $event)"
                          >
                            <ion-icon slot="icon-only" name="trash-outline"></ion-icon>
                          </ion-button>
                          @if (!isFiltered()) {
                            <ion-reorder slot="end"></ion-reorder>
                          }
                        </ion-item>
                      }
                    </ion-reorder-group>
                  </ion-list>
                }
              }
            </div>
          }
        }
      </div>
    </ion-content>
  `,
  styles: `
    ion-content {
      --background: var(--ion-background-color);
    }
    .links {
      padding: var(--cd-space-3);
      max-width: 820px;
      margin: 0 auto;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--cd-space-1);
      margin-bottom: var(--cd-space-1);
    }
    .section {
      margin-bottom: var(--cd-space-3);
    }
    .section-head {
      display: flex;
      align-items: center;
      gap: var(--cd-space-1);
    }
    .section-head h2 {
      flex: 1;
      margin: 0;
      font-size: 0.95rem;
      display: flex;
      align-items: center;
      gap: var(--cd-space-1);
    }
    .section-head ion-note {
      font-size: var(--cd-font-size-xs);
    }
    .empty {
      text-align: center;
      padding: var(--cd-space-5) var(--cd-space-3);
      color: var(--cd-text-muted, var(--ion-color-medium));
    }
    .msg {
      margin: var(--cd-space-1) 0;
      font-size: var(--cd-font-size-sm);
    }
    .host {
      font-size: var(--cd-font-size-xs);
      opacity: 0.75;
    }
    .comment {
      font-size: var(--cd-font-size-sm);
    }
    h3 ion-badge {
      vertical-align: middle;
      margin-left: var(--cd-space-1);
      font-size: 0.7rem;
    }
    .highlighted {
      --background: var(--ion-color-warning-tint, #fff3cd);
    }
  `,
})
export class SavedLinksPage implements OnInit {
  protected readonly store = inject(SavedLinksStore);
  private readonly alertController = inject(AlertController);

  protected readonly query = signal('');
  protected readonly editorOpen = signal(false);
  protected readonly editing = signal<SavedLink | null>(null);
  protected readonly editorGroupId = signal<string | null>(null);
  protected readonly groupsOpen = signal(false);
  /** Zapis, na katerega je pokazalo opozorilo o dvojniku — poudarjen, da ga uporabnik najde. */
  protected readonly highlighted = signal<string | null>(null);

  /** Zapisi, ki ustrezajo iskanju. Filtriranje v pomnilniku prek istega zlaganja kot na
   * strežniku; ujemanje gre po IMENU, NASLOVU in KOMENTARJU hkrati (FR-030). */
  protected readonly visible = computed(() => {
    const folded = foldForSearch(this.query().trim());
    if (folded.length === 0) return this.store.links();
    return this.store
      .links()
      .filter((link) =>
        foldForSearch(`${link.title} ${link.url} ${link.comment ?? ''}`).includes(folded),
      );
  });

  /** Zapisi, razvrščeni po mapah. Iskanje gre čez VSE mape hkrati (FR-031). */
  protected readonly sections = computed<LinkSection[]>(() =>
    groupLinks(this.visible(), this.store.groups()),
  );

  async ngOnInit(): Promise<void> {
    await this.store.ensureLoaded();
  }

  protected subtitle(): string | null {
    const count = this.store.count();
    if (count === 0) return null;
    const shown = this.visible().length;
    if (this.isFiltered() && shown !== count) return `${shown} od ${count}`;
    return `${count} ${count === 1 ? 'stran' : count === 2 ? 'strani' : 'strani'}`;
  }

  protected isFiltered(): boolean {
    return this.query().trim().length > 0;
  }

  protected host(link: SavedLink): string {
    return linkHost(link.url);
  }

  protected badge(link: SavedLink): { text: string; color: string; hint: string } | null {
    return metadataBadge(link);
  }

  /** Zložena mapa ostane zložena tudi ob naslednjem obisku, ker je stanje na strežniku
   * (US3, scenarij 2). Med iskanjem se zložena mapa vseeno odpre — sicer bi iskanje "ničesar
   * ne našlo", čeprav je zadetek v njej (FR-031). */
  protected isCollapsed(section: LinkSection): boolean {
    if (this.isFiltered()) return false;
    return section.group?.collapsed ?? false;
  }

  protected async toggleCollapsed(section: LinkSection): Promise<void> {
    if (!section.group) return;
    await this.store.patchGroup(section.group.id, { collapsed: !section.group.collapsed });
  }

  protected openNew(groupId: string | null): void {
    this.editing.set(null);
    this.editorGroupId.set(groupId);
    this.editorOpen.set(true);
  }

  protected edit(link: SavedLink, event: Event): void {
    event.stopPropagation();
    this.editing.set(link);
    this.editorGroupId.set(link.groupId);
    this.editorOpen.set(true);
  }

  protected closeEditor(): void {
    this.editorOpen.set(false);
    this.editing.set(null);
  }

  /** Shranjeno: shramba je seznam že osvežila. Obrazec ostane odprt samo, kadar to sam
   * zahteva — opozorilo o dvojniku ali osveženi podatki strani (glej link-editor.component.ts). */
  protected onSaved(event: { keepOpen: boolean }): void {
    if (!event.keepOpen) this.closeEditor();
  }

  protected toggleGroups(): void {
    this.groupsOpen.update((open) => !open);
  }

  protected highlight(linkId: string): void {
    this.highlighted.set(linkId);
    this.editorOpen.set(false);
  }

  /** Klik na zapis odpre stran v NOVEM zavihku, brez posredovanja poti izvorne strani
   * (FR-040): `noopener` prekine dostop do `window.opener`, `noreferrer` ne pošlje glave
   * `Referer` — tuja stran ne izve, s katerega naslova je bila odprta. */
  protected open(link: SavedLink): void {
    window.open(link.url, '_blank', 'noopener,noreferrer');
  }

  protected async refresh(link: SavedLink, event: Event): Promise<void> {
    event.stopPropagation();
    try {
      await this.store.refreshMetadata(link.id);
    } catch {
      // Neuspelo osveževanje pusti zapis nespremenjen; značka že pove, da podatkov ni.
    }
  }

  protected async confirmDelete(link: SavedLink, event: Event): Promise<void> {
    event.stopPropagation();
    const alert = await this.alertController.create({
      header: 'Izbriši zapis',
      message: `“${link.title}” bo izbrisan s seznama in s ploščice na nadzorni plošči. Nadaljuješ?`,
      buttons: [
        { text: 'Prekliči', role: 'cancel' },
        { text: 'Izbriši', role: 'destructive', handler: () => void this.store.remove(link.id) },
      ],
    });
    await alert.present();
  }

  /**
   * Prerazporeditev znotraj ENE mape (FR-032).
   *
   * `complete(false)` je namerno: seznam se ne premakne lokalno, ampak šele ko strežnik
   * potrdi in shramba prinese nov vrstni red — sicer bi ob neuspehu ostal na zaslonu vrstni
   * red, ki v bazi ne obstaja.
   */
  protected async onReorder(section: LinkSection, detail: ItemReorderEventDetail): Promise<void> {
    const ids = section.links.map((l) => l.id);
    const [moved] = ids.splice(detail.from, 1);
    if (moved) ids.splice(detail.to, 0, moved);
    detail.complete(false);
    try {
      await this.store.reorderLinks(section.group?.id ?? null, ids);
    } catch {
      await this.store.reload();
    }
  }
}

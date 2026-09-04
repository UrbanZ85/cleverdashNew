import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  AlertController,
  IonBadge,
  IonButton,
  IonChip,
  IonContent,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonSearchbar,
  IonText,
} from '@ionic/angular/standalone';
import { PageHeaderComponent } from '../../shared/layout/page-header.component.js';
import { NotesApi } from './notes.api.js';
import { notePreview, type NoteListItem } from './notes.model.js';

// Zavihek "Beležke" (platform/tabs/registry.ts, id `notes`). Seznam je bralni zaslon: iskanje,
// filtriranje po oznakah, pripenjanje in brisanje. Pisanje je na svojem zaslonu
// (note-editor.page.ts), ker beležka z narekovanjem in posnetki potrebuje ves prostor.
@Component({
  selector: 'app-notes-page',
  standalone: true,
  imports: [
    FormsModule,
    PageHeaderComponent,
    IonContent,
    IonSearchbar,
    IonList,
    IonItem,
    IonLabel,
    IonButton,
    IonIcon,
    IonBadge,
    IonChip,
    IonText,
  ],
  template: `
    <app-page-header title="Beležke" [subtitle]="subtitle()">
      <ion-button slot="end" (click)="openNew()" aria-label="Nova beležka">
        <ion-icon slot="icon-only" name="add-outline"></ion-icon>
      </ion-button>
    </app-page-header>

    <ion-content>
      <div class="notes">
        <ion-searchbar
          placeholder="Išči po naslovu in vsebini"
          [debounce]="250"
          [value]="query()"
          (ionInput)="onQuery($any($event).detail.value ?? '')"
        ></ion-searchbar>

        @if (tags().length > 0) {
          <div class="tag-filters">
            <ion-chip [outline]="activeTag() !== null" (click)="setTag(null)">Vse</ion-chip>
            @for (tag of tags(); track tag) {
              <ion-chip [outline]="activeTag() !== tag" (click)="setTag(tag)">{{ tag }}</ion-chip>
            }
          </div>
        }

        @if (error(); as message) {
          <ion-text color="danger"><p>{{ message }}</p></ion-text>
        }

        @if (notes().length === 0) {
          <!-- Prazen seznam pove, KAJ narediti, ne le da je prazen. Ločena besedila za
               "nimaš beležk" in "iskanje ni našlo" — drugo ni napaka in gumb za novo
               beležko tam ni odgovor. -->
          <div class="empty">
            @if (isFiltered()) {
              <p>Nobena beležka ne ustreza iskanju.</p>
              <ion-button fill="clear" size="small" (click)="clearFilters()">Počisti iskanje</ion-button>
            } @else if (!loading()) {
              <p>Beležk še ni. Napiši prvo — ali jo narekuj.</p>
              <ion-button fill="outline" size="small" (click)="openNew()">
                <ion-icon slot="start" name="add-outline" aria-hidden="true"></ion-icon>
                Nova beležka
              </ion-button>
            }
          </div>
        } @else {
          <ion-list>
            @for (note of notes(); track note.id) {
              <ion-item button (click)="open(note)">
                <ion-label>
                  <h2>
                    {{ note.title }}
                    @if (note.pinned) {
                      <ion-icon name="pin-outline" color="primary" aria-label="Pripeto"></ion-icon>
                    }
                    @if (note.audioCount > 0) {
                      <ion-badge color="medium">
                        <ion-icon name="mic-outline" aria-hidden="true"></ion-icon>
                        {{ note.audioCount }}
                      </ion-badge>
                    }
                  </h2>
                  <p>{{ preview(note) }}</p>
                  @if (note.tags.length > 0) {
                    <p class="tags">{{ note.tags.join(' · ') }}</p>
                  }
                </ion-label>
                <ion-button
                  slot="end"
                  fill="clear"
                  size="small"
                  [color]="note.pinned ? 'primary' : 'medium'"
                  [attr.aria-label]="note.pinned ? 'Odpni' : 'Pripni'"
                  (click)="togglePinned(note, $event)"
                >
                  <ion-icon slot="icon-only" name="pin-outline"></ion-icon>
                </ion-button>
                <ion-button
                  slot="end"
                  fill="clear"
                  size="small"
                  color="danger"
                  aria-label="Izbriši"
                  (click)="confirmDelete(note, $event)"
                >
                  <ion-icon slot="icon-only" name="trash-outline"></ion-icon>
                </ion-button>
              </ion-item>
            }
          </ion-list>
        }
      </div>
    </ion-content>
  `,
  styles: `
    ion-content {
      --background: var(--ion-background-color);
    }
    .notes {
      padding: var(--cd-space-3);
      max-width: 780px;
      margin: 0 auto;
    }
    .tag-filters {
      display: flex;
      flex-wrap: wrap;
      gap: var(--cd-space-1);
      margin-bottom: var(--cd-space-2);
    }
    .empty {
      text-align: center;
      padding: var(--cd-space-5) var(--cd-space-3);
      color: var(--cd-text-muted, var(--ion-color-medium));
    }
    h2 ion-icon,
    h2 ion-badge {
      vertical-align: middle;
      margin-left: var(--cd-space-1);
      font-size: 0.9rem;
    }
    .tags {
      font-size: 0.8rem;
      opacity: 0.75;
    }
  `,
})
export class NotesPage implements OnInit {
  private readonly api = inject(NotesApi);
  private readonly router = inject(Router);
  private readonly alertController = inject(AlertController);

  protected readonly notes = signal<NoteListItem[]>([]);
  protected readonly tags = signal<string[]>([]);
  protected readonly total = signal(0);
  protected readonly query = signal('');
  protected readonly activeTag = signal<string | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  protected subtitle(): string | null {
    const count = this.total();
    if (this.loading()) return null;
    return count === 0 ? null : `${count} ${count === 1 ? 'beležka' : count === 2 ? 'beležki' : 'beležk'}`;
  }

  protected preview(note: NoteListItem): string {
    return notePreview(note.body);
  }

  protected isFiltered(): boolean {
    return this.query().trim().length > 0 || this.activeTag() !== null;
  }

  protected async onQuery(value: string): Promise<void> {
    this.query.set(value);
    await this.reload();
  }

  protected async setTag(tag: string | null): Promise<void> {
    this.activeTag.set(tag);
    await this.reload();
  }

  protected async clearFilters(): Promise<void> {
    this.query.set('');
    this.activeTag.set(null);
    await this.reload();
  }

  protected openNew(): void {
    void this.router.navigate(['/notes/new']);
  }

  protected open(note: NoteListItem): void {
    void this.router.navigate(['/notes', note.id]);
  }

  /** Pripenjanje in brisanje sta gumba NA vrstici, ki je sama klikljiva — brez
   * `stopPropagation()` bi vsak klik na gumb hkrati odprl beležko. */
  protected async togglePinned(note: NoteListItem, event: Event): Promise<void> {
    event.stopPropagation();
    try {
      await this.api.update(note.id, { pinned: !note.pinned });
    } catch {
      this.error.set('Beležke ni bilo mogoče spremeniti.');
    }
    await this.reload();
  }

  protected async confirmDelete(note: NoteListItem, event: Event): Promise<void> {
    event.stopPropagation();
    const alert = await this.alertController.create({
      header: 'Izbriši beležko',
      message: `Beležka "${note.title}" bo nepovratno izbrisana, skupaj s posnetki. Nadaljuješ?`,
      buttons: [
        { text: 'Prekliči', role: 'cancel' },
        { text: 'Izbriši', role: 'destructive', handler: () => void this.remove(note.id) },
      ],
    });
    await alert.present();
  }

  private async remove(noteId: string): Promise<void> {
    try {
      await this.api.remove(noteId);
    } catch {
      this.error.set('Beležke ni bilo mogoče izbrisati.');
    }
    await this.reload();
  }

  private async reload(): Promise<void> {
    this.loading.set(true);
    try {
      const res = await this.api.list({ query: this.query(), tag: this.activeTag() ?? undefined });
      this.notes.set(res.notes);
      this.total.set(res.total);
      this.tags.set(res.tags);
      this.error.set(null);
    } catch {
      this.notes.set([]);
      this.error.set('Beležk ni bilo mogoče naložiti. Poskusi znova.');
    } finally {
      this.loading.set(false);
    }
  }
}

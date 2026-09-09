import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  inject,
  signal,
  type SimpleChanges,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import {
  AlertController,
  IonButton,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonNote,
  IonSelect,
  IonSelectOption,
  IonText,
  IonTextarea,
} from '@ionic/angular/standalone';
import { AVAILABLE_ICON_NAMES } from '../../core/icons/register-icons.js';
import { SavedLinksStore } from '../../core/saved-links/saved-links.store.js';
import type { SavedLink, SavedLinkGroup } from '../../core/saved-links/saved-link.model.js';

// US1 in US4: en obrazec za dodajanje IN urejanje — `link` vhod odloči način (isti vzorec kot
// features/cameras/manage/camera-form.component.ts).
//
// Edino OBVEZNO polje je naslov. To ni prijaznost, ampak zahteva: prisiljen komentar ali ime
// ob shranjevanju je razlog, da stran raje ni shranjena (spec.md, FR-001, SC-001) — obrazec
// mora prenesti lepljenje in en klik.
//
// Ikona se izbira iz NABORA in ne vpisuje kot prost niz (isti vzorec kot vtičniki v 005):
// vpisano ime, ki ni registrirano, bi se izrisalo kot prazen prostor. Prazna izbira pomeni
// "brez" in prepusti mesto faviconu (research.md §9) — zato ni privzeta ikona.
@Component({
  selector: 'app-link-editor',
  standalone: true,
  imports: [
    FormsModule,
    IonItem,
    IonInput,
    IonTextarea,
    IonSelect,
    IonSelectOption,
    IonButton,
    IonIcon,
    IonLabel,
    IonNote,
    IonText,
  ],
  template: `
    <div class="editor">
      <h2>{{ link ? 'Uredi zapis' : 'Shrani stran' }}</h2>

      <ion-item>
        <ion-input
          label="Naslov strani"
          labelPlacement="stacked"
          type="url"
          inputmode="url"
          autocapitalize="off"
          spellcheck="false"
          placeholder="prilepi naslov, npr. arso.gov.si"
          [(ngModel)]="url"
          (keyup.enter)="save()"
          required
        ></ion-input>
      </ion-item>
      <ion-note class="hint">
        Shema ni potrebna — <code>primer.si/stran</code> se shrani kot <code>https://primer.si/stran</code>.
      </ion-note>

      <ion-item>
        <ion-input
          label="Ime (neobvezno)"
          labelPlacement="stacked"
          placeholder="pusti prazno in ime preberem s strani"
          [(ngModel)]="title"
        ></ion-input>
      </ion-item>

      <ion-item>
        <ion-textarea
          label="Komentar (neobvezno)"
          labelPlacement="stacked"
          placeholder="zakaj si to shranil"
          [autoGrow]="true"
          rows="2"
          [(ngModel)]="comment"
        ></ion-textarea>
      </ion-item>

      <ion-item>
        <!-- Izbirnik mape MORA znati ustvariti mapo. Brez tega je pri uporabniku, ki map še
             nima, edina možnost "Nerazvrščeno" in izbirnika ni mogoče spremeniti v nič — kar
             je videti kot pokvarjeno polje, ne kot "map še ni". -->
        <ion-select
          label="Mapa"
          labelPlacement="stacked"
          interface="popover"
          [ngModel]="groupId"
          (ngModelChange)="onGroupChange($event)"
          placeholder="Nerazvrščeno"
        >
          <ion-select-option [value]="''">Nerazvrščeno</ion-select-option>
          @for (group of groups; track group.id) {
            <ion-select-option [value]="group.id">{{ group.name }}</ion-select-option>
          }
          <ion-select-option [value]="NEW_GROUP">+ Nova mapa …</ion-select-option>
        </ion-select>
      </ion-item>

      <ion-item>
        <ion-select
          label="Ikona"
          labelPlacement="stacked"
          interface="popover"
          [(ngModel)]="icon"
          placeholder="Brez — uporabi favicon strani"
        >
          <ion-select-option [value]="''">Brez — uporabi favicon strani</ion-select-option>
          @for (name of icons; track name) {
            <ion-select-option [value]="name">{{ name }}</ion-select-option>
          }
        </ion-select>
      </ion-item>

      @if (error(); as message) {
        <ion-text color="danger"><p class="msg">{{ message }}</p></ion-text>
      }

      @if (duplicate(); as existing) {
        <!-- Dvojnik NI napaka (FR-005): zapis je nastal. Vmesnik nanj samo opozori in ponudi
             bližnjico do obstoječega, da uporabnik vidi, kaj že ima. -->
        <ion-text color="warning">
          <p class="msg">
            To stran že imaš shranjeno kot “{{ existing.title }}”.
            <ion-button fill="clear" size="small" (click)="revealDuplicate(existing)">
              Pokaži obstoječi
            </ion-button>
          </p>
        </ion-text>
      }

      @if (link) {
        <!-- US4: ponovno branje strani je IZRECNO dejanje in ne stranski učinek shranjevanja
             — samodejnega ponovnega branja ni, ker bi pomenilo klicanje tujih strani brez
             povoda (člen VIII, FR-014). -->
        <div class="metadata-actions">
          <ion-button fill="outline" size="small" [disabled]="busy()" (click)="refresh(false)">
            <ion-icon slot="start" name="refresh-outline" aria-hidden="true"></ion-icon>
            Osveži podatke strani
          </ion-button>
          @if (link.titleSource === 'manual') {
            <ion-button fill="clear" size="small" [disabled]="busy()" (click)="refresh(true)">
              Prevzemi ime s strani
            </ion-button>
          }
        </div>
        <ion-note class="hint">
          @if (link.titleSource === 'manual') {
            Ime si vpisal sam, zato ga osveževanje ne prepiše (FR-014).
          } @else {
            Ime je prebrano s strani.
          }
        </ion-note>
      }

      <div class="actions">
        <ion-button [disabled]="busy()" (click)="save()">
          <ion-icon slot="start" [name]="link ? 'save-outline' : 'add-outline'" aria-hidden="true"></ion-icon>
          {{ link ? 'Shrani' : 'Shrani stran' }}
        </ion-button>
        <ion-button fill="clear" [disabled]="busy()" (click)="cancelled.emit()">Prekliči</ion-button>
        @if (link) {
          <ion-button fill="clear" color="danger" [disabled]="busy()" (click)="remove()">
            <ion-icon slot="start" name="trash-outline" aria-hidden="true"></ion-icon>
            Izbriši
          </ion-button>
        }
      </div>

      @if (link) {
        <ion-label class="url-preview">
          <ion-note>{{ link.url }}</ion-note>
        </ion-label>
      }
    </div>
  `,
  styles: `
    .editor {
      border: 1px solid var(--cd-divider);
      border-radius: var(--cd-radius-lg);
      padding: var(--cd-space-3);
      margin-bottom: var(--cd-space-3);
      background: var(--cd-surface);
    }
    h2 {
      margin: 0 0 var(--cd-space-2);
      font-size: 1rem;
    }
    .hint {
      display: block;
      padding: var(--cd-space-1) 0 var(--cd-space-2);
      font-size: var(--cd-font-size-xs);
    }
    .msg {
      margin: var(--cd-space-2) 0 0;
      font-size: var(--cd-font-size-sm);
    }
    .actions,
    .metadata-actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--cd-space-1);
      margin-top: var(--cd-space-3);
    }
    .metadata-actions {
      margin-top: var(--cd-space-2);
    }
    .url-preview {
      display: block;
      margin-top: var(--cd-space-2);
      overflow-wrap: anywhere;
    }
  `,
})
export class LinkEditorComponent implements OnChanges {
  private readonly store = inject(SavedLinksStore);
  private readonly alertController = inject(AlertController);

  /** `null`/izpuščeno = nov zapis; podan zapis = urejanje. */
  @Input() link: SavedLink | null = null;
  @Input() groups: readonly SavedLinkGroup[] = [];
  /** Mapa, v kateri je uporabnik kliknil "dodaj" — nov zapis pristane tam, kjer ga je začel. */
  @Input() defaultGroupId: string | null = null;

  /** `keepOpen` pomeni, da mora obrazec ostati na zaslonu — edini tak primer je opozorilo o
   * dvojniku, kjer je bližnjica do obstoječega zapisa še potrebna (FR-005). */
  @Output() readonly saved = new EventEmitter<{ keepOpen: boolean }>();
  @Output() readonly cancelled = new EventEmitter<void>();
  @Output() readonly showLink = new EventEmitter<string>();

  protected readonly icons = AVAILABLE_ICON_NAMES;

  /** Vrednost, ki v izbirniku mape pomeni "ustvari novo". Sentinel in ne prazen niz, ker je
   * prazen niz že zaseden za "nerazvrščeno" — in ne `null`, ker `ion-select` prazno vrednost
   * pokaže kot neizbrano. */
  protected readonly NEW_GROUP = '__nova__';

  protected url = '';
  protected title = '';
  protected comment = '';
  protected groupId = '';
  protected icon = '';

  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly duplicate = signal<SavedLink | null>(null);

  /**
   * Polja se napolnijo iz vhoda SAMO, kadar se zamenja zapis, ki ga urejamo — ne ob vsaki
   * spremembi kateregakoli vhoda.
   *
   * Razlika je bila prava napaka: `groups` je vezan na `store.groups()`, ki ob vsakem
   * osvežitvi vrne NOVO polje, torej se šteje za spremembo vhoda. Ustvarjanje mape sredi
   * vnosa je tako pobrisalo že vpisani naslov in komentar — uporabnik je izbral "Nova mapa",
   * jo poimenoval in se vrnil k praznemu obrazcu.
   */
  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['link'] && !changes['defaultGroupId']) return;
    this.url = this.link?.url ?? '';
    this.title = this.link?.title ?? '';
    this.comment = this.link?.comment ?? '';
    this.groupId = this.link?.groupId ?? this.defaultGroupId ?? '';
    this.icon = this.link?.icon ?? '';
    this.error.set(null);
    this.duplicate.set(null);
  }

  /**
   * Sprememba izbrane mape. Izbira "+ Nova mapa …" vpraša za ime, mapo ustvari in jo TAKOJ
   * izbere — uporabnik ne sme biti poslan na drug zaslon sredi shranjevanja strani.
   *
   * Ob preklicu ali napaki se izbirnik vrne na prejšnjo vrednost; brez tega bi v njem obtičal
   * sentinel in shranjevanje bi poslalo `groupId: '__nova__'`, kar bi strežnik zavrnil s 404.
   */
  protected async onGroupChange(value: string): Promise<void> {
    if (value !== this.NEW_GROUP) {
      this.groupId = value;
      return;
    }

    const previous = this.groupId;
    // Vrnemo se na prejšnjo vrednost že zdaj: `ion-select` je svojo vrednost že postavil na
    // sentinel, in če pogovorno okno prekličeš, mora izbirnik takoj kazati staro stanje.
    this.groupId = previous;

    const alert = await this.alertController.create({
      header: 'Nova mapa',
      inputs: [{ name: 'name', type: 'text', placeholder: 'npr. Delo, Recepti, Za prebrati', attributes: { maxlength: 60 } }],
      buttons: [
        { text: 'Prekliči', role: 'cancel' },
        {
          text: 'Ustvari',
          handler: (data: { name?: string }) => {
            void this.createGroup(data?.name ?? '');
          },
        },
      ],
    });
    await alert.present();
  }

  private async createGroup(rawName: string): Promise<void> {
    const name = rawName.trim();
    if (name.length === 0) return;

    this.busy.set(true);
    try {
      const group = await this.store.createGroup(name);
      // Nova mapa je izbrana takoj — sicer bi jo uporabnik moral poiskati še enkrat.
      this.groupId = group.id;
      this.error.set(null);
    } catch (err) {
      // Najpogostejši razlog je zasedeno ime; `detail` strežnika to pove (člen VII).
      this.error.set(detailOf(err) ?? 'Mape ni bilo mogoče ustvariti.');
    } finally {
      this.busy.set(false);
    }
  }

  protected async save(): Promise<void> {
    const url = this.url.trim();
    if (url.length === 0) {
      this.error.set('Vpiši naslov strani.');
      return;
    }

    this.busy.set(true);
    this.error.set(null);
    this.duplicate.set(null);
    try {
      if (this.link) {
        await this.store.update(this.link.id, {
          url,
          // Poslano ime pomeni ročni vnos in nastavi `titleSource: manual` (FR-014). Prazno
          // ime se NE pošlje: sicer bi vsak popravek komentarja tiho razglasil ime za ročno.
          ...(this.title.trim().length > 0 ? { title: this.title.trim() } : {}),
          comment: this.comment.trim().length > 0 ? this.comment.trim() : null,
          icon: this.icon.length > 0 ? this.icon : null,
          groupId: this.groupId.length > 0 ? this.groupId : null,
        });
      } else {
        const created = await this.store.create({
          url,
          ...(this.title.trim().length > 0 ? { title: this.title.trim() } : {}),
          comment: this.comment.trim().length > 0 ? this.comment.trim() : null,
          icon: this.icon.length > 0 ? this.icon : null,
          groupId: this.groupId.length > 0 ? this.groupId : null,
        });

        if (created.duplicateOfId) {
          // Zapis JE nastal — opozorilo ostane na zaslonu, obrazec pa se ne zapre, da je
          // bližnjica do obstoječega še vidna.
          const existing = this.store.links().find((l) => l.id === created.duplicateOfId);
          this.duplicate.set(existing ?? null);
          this.saved.emit({ keepOpen: true });
          this.busy.set(false);
          return;
        }
      }
      this.saved.emit({ keepOpen: false });
    } catch (err) {
      // Sporočilo strežnika ("javascript ni naslov strani", "Mapa ne obstaja") pove, KAJ je
      // narobe — splošno besedilo bi ta podatek vrglo stran (člen VII).
      this.error.set(detailOf(err) ?? 'Zapisa ni bilo mogoče shraniti.');
    } finally {
      this.busy.set(false);
    }
  }

  protected async refresh(force: boolean): Promise<void> {
    if (!this.link) return;
    this.busy.set(true);
    try {
      const updated = await this.store.refreshMetadata(this.link.id, force);
      this.title = updated.title;
      this.error.set(null);
      // Osveževanje ni zaključek urejanja — obrazec ostane odprt, da uporabnik vidi novo ime.
      this.saved.emit({ keepOpen: true });
    } catch (err) {
      this.error.set(detailOf(err) ?? 'Podatkov strani ni bilo mogoče osvežiti.');
    } finally {
      this.busy.set(false);
    }
  }

  protected async remove(): Promise<void> {
    if (!this.link) return;
    this.busy.set(true);
    try {
      await this.store.remove(this.link.id);
      this.saved.emit({ keepOpen: false });
    } catch (err) {
      this.error.set(detailOf(err) ?? 'Zapisa ni bilo mogoče izbrisati.');
    } finally {
      this.busy.set(false);
    }
  }

  protected revealDuplicate(existing: SavedLink): void {
    this.showLink.emit(existing.id);
  }
}

/** `detail` iz problem+json odgovora, kadar ga strežnik pošlje. */
function detailOf(err: unknown): string | null {
  if (err instanceof HttpErrorResponse) {
    const detail = (err.error as { detail?: string } | null)?.detail;
    if (typeof detail === 'string' && detail.length > 0) return detail;
  }
  return null;
}

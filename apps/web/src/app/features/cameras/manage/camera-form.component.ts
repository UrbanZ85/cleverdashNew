import { Component, EventEmitter, Input, OnChanges, OnInit, Output, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  IonItem,
  IonInput,
  IonSelect,
  IonSelectOption,
  IonToggle,
  IonButton,
  IonText,
  IonLabel,
  IonNote,
} from '@ionic/angular/standalone';
import { apiUrl } from '../../../core/api/api-base.js';
import { HelpButtonComponent } from '../../../shared/help/help-button.component.js';
import {
  isEmbedOnlyAddress,
  normalizeEmbedAddress,
  type EmbedAddressNote,
} from '../../../core/embeds/embed-address.js';

type CameraType = 'snapshot' | 'mjpeg' | 'hls' | 'iframe' | 'snapshot+iframe';

export interface CameraFormValue {
  id?: string;
  name: string;
  type: CameraType;
  previewUrl: string;
  fullUrl: string | null;
  refreshIntervalSeconds: number;
  groupId: string | null;
  timeOfDay: 'morning' | 'afternoon' | 'always';
  active: boolean;
}

interface CameraGroupOption {
  id: string;
  name: string;
}

interface ArsoWebcamOption {
  direction: string;
  imageUrl: string;
}

/** Besedilo za vsako popravljeno obliko naslova — uporabnik mora videti, KAJ se je
 * spremenilo, sicer je samodejni popravek le še ena nerazložena sprememba v polju. */
const ADDRESS_NOTE_TEXT: Record<EmbedAddressNote, string> = {
  'extracted-from-iframe': 'Iz prilepljene oznake <iframe> je vzet samo naslov (src) — shrani se naslov, ne HTML.',
  'youtube-to-embed':
    'YouTube naslov za gledanje je pretvorjen v naslov za vdelavo (/embed/). Naslova za gledanje YouTube v okvirju ne dovoli in bi prikaz ostal prazen.',
};

/** Da uporabnik ve, da mu oznake ni treba razstavljati: obrazec iz nje sam vzame `src`
 * (`normalizeEmbedAddress`). Brez tega namiga tega nihče ne ugane — polje govori o "naslovu". */
const EMBED_PASTE_HINT =
  'Prilepiš lahko tudi cel <iframe …>, kot ga ponudi YouTube pod “Deli → Vdelaj” — iz oznake se vzame samo naslov.';

const EMBED_PLACEHOLDER = 'https://… ali cel <iframe …>';

const TYPE_SWITCHED_TEXT =
  'Vrsta vira je preklopljena na “Vdelava tuje strani” — YouTube slike posnetka ne vrne, zato bi se kot posnetek izrisala pokvarjena slika.';

// Story 3 (P3, FR-031, FR-036, FR-037) in Story 4 (P4, FR-032). En obrazec za dodajanje IN
// urejanje — `camera` input odloči način. Vdelava tuje strani je prva-razredna možnost
// (FR-036: izbira vrste `iframe`/`snapshot+iframe` takoj pokaže polje za naslov vdelave, ne
// skrita tehnična podrobnost). Ob `422` z nedovoljenim gostiteljem obrazec ponudi izrecno
// dodajanje gostitelja na seznam (research.md §6) — se NE zgodi samodejno.
//
// Prilepljena vrednost naslova gre skozi `core/embeds/embed-address.ts`, preden se pošlje: YouTubov
// gumb "Vdelaj" ponudi cel `<iframe …>` (ni URL, strežnik ga zavrne), gumb "Deli" pa naslov
// za gledanje (JE URL, se shrani, a ga YouTube v okvirju zavrne — prikaz ostane prazen brez
// pojasnila). Popravek se pokaže v polju in je izpisan, ne tih.
@Component({
  selector: 'app-camera-form',
  standalone: true,
  imports: [
    FormsModule,
    HelpButtonComponent,
    IonItem,
    IonInput,
    IonSelect,
    IonSelectOption,
    IonToggle,
    IonButton,
    IonText,
    IonLabel,
    IonNote,
  ],
  template: `
    <ion-item>
      <ion-input label="Ime" labelPlacement="stacked" [(ngModel)]="value.name"></ion-input>
      <app-help slot="end" topic="camera.name"></app-help>
    </ion-item>
    <ion-item>
      <ion-select label="Vrsta vira" [(ngModel)]="value.type">
        <ion-select-option value="snapshot">Posnetek (statična slika)</ion-select-option>
        <ion-select-option value="mjpeg">Zvezni MJPEG tok</ion-select-option>
        <ion-select-option value="hls">HLS tok</ion-select-option>
        <ion-select-option value="iframe">Vdelava tuje strani (YouTube, predvajalnik ...)</ion-select-option>
        <ion-select-option value="snapshot+iframe">Posnetek + vdelava ob kliku</ion-select-option>
      </ion-select>
      <app-help slot="end" topic="camera.type"></app-help>
    </ion-item>

    @if (isEmbedType()) {
      <ion-note class="cd-section-hint">
        Naslov vdelave se preveri proti seznamu dovoljenih gostiteljev. {{ EMBED_PASTE_HINT }}
      </ion-note>
    }

    <ion-item>
      <ion-input
        [label]="value.type === 'snapshot+iframe' ? 'Naslov posnetka (predogled)' : 'Naslov'"
        labelPlacement="stacked"
        [placeholder]="previewPlaceholder()"
        [(ngModel)]="value.previewUrl"
        (ionBlur)="normalizePreviewUrl()"
      ></ion-input>
      <app-help slot="end" topic="camera.previewUrl"></app-help>
    </ion-item>

    @if (value.type === 'snapshot+iframe') {
      <ion-item>
        <ion-input
          label="Naslov vdelave (polni prikaz)"
          labelPlacement="stacked"
          [placeholder]="EMBED_PLACEHOLDER"
          [(ngModel)]="fullUrlValue"
          (ionBlur)="normalizeFullUrl()"
        ></ion-input>
        <app-help slot="end" topic="camera.fullUrl"></app-help>
      </ion-item>
    }

    <!-- Kaj je bilo v prilepljenem naslovu popravljeno. Ni napaka, zato ne rdeče. -->
    @for (note of addressNotes(); track note) {
      <ion-text color="medium"><p class="hint">{{ note }}</p></ion-text>
    }

    @if (showArsoPicker()) {
      <ion-item>
        <ion-input label="ARSO lokacija" labelPlacement="stacked" [(ngModel)]="arsoLocation"></ion-input>
        <ion-button slot="end" fill="outline" (click)="loadArsoWebcams()">Poišči</ion-button>
      </ion-item>
      @if (arsoWebcams().length > 0) {
        @for (webcam of arsoWebcams(); track webcam.imageUrl) {
          <ion-item button="true" (click)="applyArsoWebcam(webcam)">
            <ion-label>ARSO webcam — {{ webcam.direction || 'brez smeri' }}</ion-label>
          </ion-item>
        }
      } @else if (arsoSearched()) {
        <ion-text color="medium"><p class="hint">Za to lokacijo ARSO trenutno ne ponuja slike.</p></ion-text>
      }
    }

    <ion-item>
      <ion-input
        label="Interval osveževanja (s)"
        labelPlacement="stacked"
        type="number"
        [(ngModel)]="value.refreshIntervalSeconds"
      ></ion-input>
      <app-help slot="end" topic="camera.refresh"></app-help>
    </ion-item>
    <ion-item>
      <ion-select label="Skupina" [(ngModel)]="value.groupId">
        <ion-select-option [value]="null">Brez skupine</ion-select-option>
        @for (group of groups(); track group.id) {
          <ion-select-option [value]="group.id">{{ group.name }}</ion-select-option>
        }
      </ion-select>
      <app-help slot="end" topic="camera.group"></app-help>
    </ion-item>
    <ion-item>
      <ion-select label="Časovna oznaka" [(ngModel)]="value.timeOfDay">
        <ion-select-option value="always">Vedno</ion-select-option>
        <ion-select-option value="morning">Dopoldne</ion-select-option>
        <ion-select-option value="afternoon">Popoldne</ion-select-option>
      </ion-select>
      <app-help slot="end" topic="camera.timeOfDay"></app-help>
    </ion-item>
    <ion-item>
      <ion-toggle [(ngModel)]="value.active">Aktivna</ion-toggle>
      <app-help slot="end" topic="camera.active"></app-help>
    </ion-item>

    <ion-item>
      <ion-input
        label="Uporabniško ime (če vir zahteva)"
        labelPlacement="stacked"
        [(ngModel)]="credentialUsername"
      ></ion-input>
      <app-help slot="end" topic="camera.credentials"></app-help>
    </ion-item>
    <ion-item>
      <ion-input
        label="Geslo (če vir zahteva)"
        labelPlacement="stacked"
        type="password"
        [(ngModel)]="credentialPassword"
      ></ion-input>
    </ion-item>

    @if (error(); as message) {
      <ion-text color="danger"><p>{{ message }}</p></ion-text>
      @if (rejectedHost(); as host) {
        <app-help topic="camera.embedHosts"></app-help>
        <ion-button fill="outline" [disabled]="approvingHost()" (click)="approveHostAndRetry(host)">
          Dodaj "{{ host }}" na seznam dovoljenih in poskusi znova
        </ion-button>
      }
    }

    <ion-button expand="block" [disabled]="saving()" (click)="save()">
      {{ saving() ? 'Shranjujem ...' : (isEditMode() ? 'Shrani spremembe' : 'Dodaj kamero') }}
    </ion-button>
    <ion-button expand="block" fill="clear" (click)="cancelled.emit()">Prekliči</ion-button>
  `,
  styles: `
    .hint { font-size: 0.85rem; }
  `,
})
export class CameraFormComponent implements OnInit, OnChanges {
  @Input() camera: CameraFormValue | null = null;
  @Output() saved = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();

  // Besedili živita kot konstanti nad razredom (oznaka <iframe …> v besedilu predloge bi jo
  // Angular razčlenil kot element), predloga pa ju vidi samo prek razreda.
  protected readonly EMBED_PASTE_HINT = EMBED_PASTE_HINT;
  protected readonly EMBED_PLACEHOLDER = EMBED_PLACEHOLDER;

  private readonly http = inject(HttpClient);

  value: CameraFormValue = this.emptyValue();
  fullUrlValue = '';
  credentialUsername = '';
  credentialPassword = '';
  arsoLocation = 'Ljubljana';

  readonly groups = signal<CameraGroupOption[]>([]);
  readonly arsoWebcams = signal<ArsoWebcamOption[]>([]);
  readonly arsoSearched = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly rejectedHost = signal<string | null>(null);
  readonly approvingHost = signal(false);
  /** Že prevedena sporočila o tem, kaj je bilo v prilepljenem naslovu popravljeno. */
  readonly addressNotes = signal<string[]>([]);

  async ngOnInit(): Promise<void> {
    try {
      const res = await firstValueFrom(
        this.http.get<{ groups: CameraGroupOption[] }>(apiUrl('/camera-groups'), { withCredentials: true }),
      );
      this.groups.set(res.groups);
    } catch {
      this.groups.set([]);
    }
  }

  ngOnChanges(): void {
    this.value = this.camera ? { ...this.camera } : this.emptyValue();
    this.fullUrlValue = this.camera?.fullUrl ?? '';
    this.credentialUsername = '';
    this.credentialPassword = '';
    this.error.set(null);
    this.rejectedHost.set(null);
    this.addressNotes.set([]);
  }

  isEditMode(): boolean {
    return this.camera !== null;
  }

  /** Pri vrsti brez vdelave oznaka `<iframe>` ni smiselna — namig velja samo tam, kjer naslov
   * res gre v okvir. */
  previewPlaceholder(): string {
    return this.isEmbedType() ? EMBED_PLACEHOLDER : 'https://…';
  }

  isEmbedType(): boolean {
    return this.value.type === 'iframe' || this.value.type === 'snapshot+iframe';
  }

  showArsoPicker(): boolean {
    return this.value.type === 'snapshot' || this.value.type === 'snapshot+iframe';
  }

  /**
   * Popravi obliko prilepljenega glavnega naslova in po potrebi preklopi vrsto vira.
   * Teče ob izgubi fokusa in še enkrat pred shranjevanjem — polje se lahko prilepi in
   * gumb pritisne brez vmesnega klika drugam (na dotik je to običajno zaporedje).
   */
  normalizePreviewUrl(): void {
    const before = this.value.previewUrl;
    const { url, notes } = normalizeEmbedAddress(before);
    this.value.previewUrl = url;

    const messages = notes.map((note) => ADDRESS_NOTE_TEXT[note]);
    // Vdelavo se preklopi samo pri glavnem naslovu in samo, kadar TA naslov res gre v
    // okvir — pri `snapshot+iframe` je glavni naslov slika in preklop bi bil narobe.
    if (this.value.type === 'snapshot' && isEmbedOnlyAddress(url)) {
      this.value.type = 'iframe';
      messages.push(TYPE_SWITCHED_TEXT);
    }
    this.addressNotes.set(messages);
  }

  /** Isto za drugi naslov, brez preklopa vrste — pri `snapshot+iframe` je vdelava že izbrana. */
  normalizeFullUrl(): void {
    const { url, notes } = normalizeEmbedAddress(this.fullUrlValue);
    this.fullUrlValue = url;
    this.addressNotes.set(notes.map((note) => ADDRESS_NOTE_TEXT[note]));
  }

  async loadArsoWebcams(): Promise<void> {
    this.arsoSearched.set(false);
    try {
      const res = await firstValueFrom(
        this.http.get<{ webcams: ArsoWebcamOption[] }>(
          apiUrl(`/cameras/arso-webcams?location=${encodeURIComponent(this.arsoLocation)}`),
          { withCredentials: true },
        ),
      );
      this.arsoWebcams.set(res.webcams);
    } catch {
      this.arsoWebcams.set([]);
    }
    this.arsoSearched.set(true);
  }

  applyArsoWebcam(webcam: ArsoWebcamOption): void {
    this.value.type = 'snapshot';
    this.value.previewUrl = webcam.imageUrl;
    this.addressNotes.set([]);
  }

  async approveHostAndRetry(host: string): Promise<void> {
    this.approvingHost.set(true);
    try {
      await firstValueFrom(
        this.http.post(apiUrl('/cameras/embed-hosts'), { host, addedReason: this.value.name }, { withCredentials: true }),
      );
      this.rejectedHost.set(null);
      await this.save();
    } catch {
      this.error.set(`Gostitelja "${host}" ni bilo mogoče dodati na seznam dovoljenih.`);
    } finally {
      this.approvingHost.set(false);
    }
  }

  async save(): Promise<void> {
    this.normalizePreviewUrl();
    if (this.value.type === 'snapshot+iframe') this.normalizeFullUrl();

    // Strežnik zavrne prazno ime in interval pod 5 s z Zodovim 400, ki nima imena polja —
    // uporabnik bi dobil samo "Shranjevanje ni uspelo". Ta dva pogoja povemo sami.
    if (!this.value.name.trim()) {
      this.error.set('Ime kamere je obvezno.');
      return;
    }
    if (!this.value.previewUrl.trim()) {
      this.error.set('Naslov kamere je obvezen.');
      return;
    }
    const refreshIntervalSeconds = Number(this.value.refreshIntervalSeconds) || 30;
    if (refreshIntervalSeconds < 5) {
      this.error.set('Interval osveževanja ne more biti manjši od 5 sekund.');
      return;
    }

    this.saving.set(true);
    this.error.set(null);
    this.rejectedHost.set(null);
    try {
      const body: Record<string, unknown> = {
        name: this.value.name,
        type: this.value.type,
        previewUrl: this.value.previewUrl,
        fullUrl: this.value.type === 'snapshot+iframe' ? this.fullUrlValue || null : null,
        refreshIntervalSeconds,
        groupId: this.value.groupId,
        timeOfDay: this.value.timeOfDay,
        active: this.value.active,
      };
      if (this.credentialUsername || this.credentialPassword) {
        body.credentials = { username: this.credentialUsername, password: this.credentialPassword };
      }

      if (this.isEditMode() && this.camera?.id) {
        await firstValueFrom(this.http.put(apiUrl(`/cameras/${this.camera.id}`), body, { withCredentials: true }));
      } else {
        await firstValueFrom(this.http.post(apiUrl('/cameras'), body, { withCredentials: true }));
      }
      this.saved.emit();
    } catch (err) {
      this.handleSaveError(err);
    } finally {
      this.saving.set(false);
    }
  }

  private handleSaveError(err: unknown): void {
    if (err instanceof HttpErrorResponse && err.status === 422) {
      const detail: string = err.error?.detail ?? 'Naslov ni veljaven.';
      this.error.set(detail);
      // FR-034 detail oblika je "previewUrl: Gostitelj \"host\" ni na seznamu dovoljenih ...".
      const match = /Gostitelj "([^"]+)" ni na seznamu dovoljenih/.exec(detail);
      this.rejectedHost.set(match ? match[1] ?? null : null);
      return;
    }
    // 400 je Zodova zavrnitev oblike telesa; brez tega razlikovanja je sporočilo enako kot
    // pri prekinjeni povezavi in uporabnik ne ve, ali naj popravi vnos ali poskusi znova.
    if (err instanceof HttpErrorResponse && err.status === 400) {
      this.error.set('Vnos ni v pravi obliki — preveri naslov in interval osveževanja.');
      return;
    }
    this.error.set('Shranjevanje ni uspelo. Poskusi znova.');
  }

  private emptyValue(): CameraFormValue {
    return {
      name: '',
      type: 'snapshot',
      previewUrl: '',
      fullUrl: null,
      refreshIntervalSeconds: 30,
      groupId: null,
      timeOfDay: 'always',
      active: true,
    };
  }
}

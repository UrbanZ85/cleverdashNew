import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import {
  AlertController,
  IonBadge,
  IonButton,
  IonContent,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonNote,
  IonSpinner,
  IonText,
  IonTextarea,
  IonToggle,
} from '@ionic/angular/standalone';
import { PageHeaderComponent } from '../../shared/layout/page-header.component.js';
import { HelpButtonComponent } from '../../shared/help/help-button.component.js';
import { NotesApi } from './notes.api.js';
import { VoiceInputComponent, type RecordedEvent } from './voice-input.component.js';
import {
  appendDictation,
  describeTranscript,
  formatBytes,
  formatDuration,
  formatTagInput,
  parseTagInput,
  type Note,
  type NoteAudio,
  type NotesCapabilities,
} from './notes.model.js';

// Pisanje ene beležke. Podstran zavihka `notes` — dosegljiva samo prek seznama, zato ima glavo
// z potjo nazaj in ne gumba za meni (enak vzorec kot cameras/manage, glej page-header).
@Component({
  selector: 'app-note-editor-page',
  standalone: true,
  imports: [
    FormsModule,
    PageHeaderComponent,
    HelpButtonComponent,
    VoiceInputComponent,
    IonContent,
    IonItem,
    IonInput,
    IonTextarea,
    IonToggle,
    IonButton,
    IonIcon,
    IonLabel,
    IonNote,
    IonText,
    IonBadge,
    IonSpinner,
  ],
  template: `
    <app-page-header
      [title]="isNew() ? 'Nova beležka' : 'Beležka'"
      backRoute="/notes"
      backLabel="Beležke"
    >
      <ion-button slot="end" [disabled]="saving() || !canSave()" (click)="save()">
        <ion-icon slot="start" name="save-outline" aria-hidden="true"></ion-icon>
        Shrani
      </ion-button>
    </app-page-header>

    <ion-content>
      <div class="editor">
        @if (loading()) {
          <ion-spinner aria-label="Nalagam"></ion-spinner>
        } @else {
          <ion-item>
            <ion-input
              label="Naslov"
              labelPlacement="stacked"
              placeholder="Brez naslova se uporabi prva vrstica"
              [(ngModel)]="title"
              (ngModelChange)="markDirty()"
            ></ion-input>
          </ion-item>

          <ion-item>
            <ion-textarea
              label="Vsebina"
              labelPlacement="stacked"
              [autoGrow]="true"
              [rows]="10"
              [(ngModel)]="body"
              (ngModelChange)="markDirty()"
            ></ion-textarea>
          </ion-item>

          <ion-item>
            <ion-input
              label="Oznake"
              labelPlacement="stacked"
              placeholder="ločene z vejico, npr. delo, ideje"
              [(ngModel)]="tagsInput"
              (ngModelChange)="markDirty()"
            ></ion-input>
            <app-help slot="end" topic="notes.tags"></app-help>
          </ion-item>

          <ion-item>
            <ion-toggle [(ngModel)]="pinned" (ngModelChange)="markDirty()">Pripni na vrh seznama</ion-toggle>
          </ion-item>

          <!-- Govor: narekovanje piše v vsebino, snemanje shrani posnetek k beležki. -->
          <app-voice-input
            [serverTranscription]="serverTranscription()"
            (dictated)="onDictated($event)"
            (recorded)="onRecorded($event)"
          ></app-voice-input>

          @if (uploading()) {
            <ion-note class="status">
              <ion-spinner name="dots" aria-hidden="true"></ion-spinner>
              Shranjujem posnetek{{ transcribing() ? ' in ga prepisujem' : '' }} …
            </ion-note>
          }

          @if (audio().length > 0) {
            <h2 class="cd-section-title">Posnetki</h2>
            @for (item of audio(); track item.id) {
              <div class="recording">
                <div class="recording-head">
                  <ion-label>
                    <h3>{{ formatDuration(item.durationMs) }} · {{ formatBytes(item.byteSize) }}</h3>
                    <p>
                      <ion-badge [color]="item.transcriptStatus === 'failed' ? 'warning' : 'medium'">
                        {{ describeTranscript(item) }}
                      </ion-badge>
                    </p>
                  </ion-label>
                  <ion-button fill="clear" size="small" (click)="play(item)" [disabled]="loadingAudioId() === item.id">
                    <ion-icon slot="icon-only" name="play-outline" aria-label="Predvajaj"></ion-icon>
                  </ion-button>
                  @if (serverTranscription().available) {
                    <ion-button
                      fill="clear"
                      size="small"
                      [disabled]="transcribingId() === item.id"
                      (click)="transcribe(item)"
                    >
                      <ion-icon slot="icon-only" name="sparkles-outline" aria-label="Prepiši na strežniku"></ion-icon>
                    </ion-button>
                  }
                  <ion-button fill="clear" size="small" color="danger" (click)="confirmDeleteAudio(item)">
                    <ion-icon slot="icon-only" name="trash-outline" aria-label="Izbriši posnetek"></ion-icon>
                  </ion-button>
                </div>

                @if (playingUrl()[item.id]; as src) {
                  <audio class="player" controls autoplay [src]="src"></audio>
                }

                @if (item.transcript; as transcript) {
                  <p class="transcript">{{ transcript }}</p>
                  <ion-button fill="clear" size="small" (click)="insertTranscript(transcript)">
                    <ion-icon slot="start" name="add-outline" aria-hidden="true"></ion-icon>
                    Vstavi v vsebino
                  </ion-button>
                }
              </div>
            }
          }

          @if (error(); as message) {
            <ion-text color="danger"><p>{{ message }}</p></ion-text>
          }
          @if (savedAt()) {
            <ion-note class="status">Shranjeno.</ion-note>
          }
        }
      </div>
    </ion-content>
  `,
  styles: `
    ion-content {
      --background: var(--ion-background-color);
    }
    .editor {
      padding: var(--cd-space-3);
      max-width: 780px;
      margin: 0 auto;
    }
    .recording {
      border: 1px solid var(--cd-divider);
      border-radius: var(--cd-radius-lg);
      padding: var(--cd-space-2) var(--cd-space-3);
      margin-bottom: var(--cd-space-2);
      background: var(--cd-surface);
    }
    .recording-head {
      display: flex;
      align-items: center;
      gap: var(--cd-space-1);
    }
    .player {
      width: 100%;
      margin-top: var(--cd-space-2);
    }
    .transcript {
      white-space: pre-wrap;
      font-size: 0.9rem;
      margin: var(--cd-space-2) 0 0;
    }
    .status {
      display: block;
      margin-top: var(--cd-space-2);
    }
  `,
})
export class NoteEditorPage implements OnInit, OnDestroy {
  private readonly api = inject(NotesApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly alertController = inject(AlertController);

  protected readonly formatDuration = formatDuration;
  protected readonly formatBytes = formatBytes;
  protected readonly describeTranscript = describeTranscript;

  title = '';
  body = '';
  tagsInput = '';
  pinned = false;

  protected readonly noteId = signal<string | null>(null);
  protected readonly audio = signal<NoteAudio[]>([]);
  protected readonly capabilities = signal<NotesCapabilities | null>(null);
  /** Izpeljano stanje za `<app-voice-input>` in gumb za prepis. Kot `computed`, ne kot izraz v
   * predlogi: Angularjev `?.` v predlogi ne varuje CELE verige (`a?.b.c` je zanj napaka), zato
   * gnezdenega neobveznega objekta ni mogoče brati neposredno tam. */
  protected readonly serverTranscription = computed(() => {
    const caps = this.capabilities();
    return {
      available: caps?.serverTranscription.available ?? false,
      detail: caps?.serverTranscription.detail ?? null,
    };
  });
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly uploading = signal(false);
  protected readonly transcribing = signal(false);
  protected readonly transcribingId = signal<string | null>(null);
  protected readonly loadingAudioId = signal<string | null>(null);
  protected readonly playingUrl = signal<Record<string, string>>({});
  protected readonly error = signal<string | null>(null);
  protected readonly savedAt = signal<number | null>(null);
  private dirty = false;

  async ngOnInit(): Promise<void> {
    // `'new'` je sentinel iz poti (glej app.routes.ts) — nova beležka še ni v bazi.
    const id = this.route.snapshot.paramMap.get('noteId');
    // Zmožnosti se preberejo vzporedno z beležko in nikoli ne podrejo zaslona: brez njih se
    // prepis na strežniku samo ne ponudi, pisanje beležke pa deluje naprej.
    void this.api
      .capabilities()
      .then((caps) => this.capabilities.set(caps))
      .catch(() => this.capabilities.set(null));

    if (!id || id === 'new') {
      this.loading.set(false);
      return;
    }
    try {
      this.applyNote(await this.api.get(id));
    } catch {
      this.error.set('Beležke ni bilo mogoče naložiti.');
    } finally {
      this.loading.set(false);
    }
  }

  ngOnDestroy(): void {
    // `objectURL` je referenca na Blob v pomnilniku zavihka — brez `revoke` ostane posnetek
    // v pomnilniku, dokler zavihek živi.
    for (const url of Object.values(this.playingUrl())) URL.revokeObjectURL(url);
  }

  protected isNew(): boolean {
    return this.noteId() === null;
  }

  protected canSave(): boolean {
    return this.title.trim().length > 0 || this.body.trim().length > 0;
  }

  protected markDirty(): void {
    this.dirty = true;
    this.savedAt.set(null);
  }

  protected onDictated(text: string): void {
    this.body = appendDictation(this.body, text);
    this.markDirty();
  }

  protected insertTranscript(transcript: string): void {
    this.body = appendDictation(this.body, transcript);
    this.markDirty();
  }

  protected async save(): Promise<void> {
    await this.persist();
  }

  /** Shrani beležko in vrne njen ID. Posnetek se lahko naloži samo k OBSTOJEČI beležki, zato
   * snemanje v novi beležki najprej sproži shranjevanje — sicer bi uporabnik posnel govor in
   * ga izgubil ob prvi napaki. */
  private async persist(): Promise<string | null> {
    if (!this.canSave()) {
      this.error.set('Beležka potrebuje naslov ali vsebino.');
      return null;
    }
    this.saving.set(true);
    this.error.set(null);
    try {
      const draft = {
        title: this.title.trim(),
        body: this.body,
        tags: parseTagInput(this.tagsInput),
        pinned: this.pinned,
      };
      const existingId = this.noteId();
      const note = existingId ? await this.api.update(existingId, draft) : await this.api.create(draft);
      this.applyNote(note);
      this.dirty = false;
      this.savedAt.set(Date.now());
      // Po prvem shranjevanju naslov strani ni več "/notes/new": brez tega bi osvežitev
      // strani odprla prazen urejevalnik, beležka pa bi bila že shranjena.
      if (!existingId) {
        void this.router.navigate(['/notes', note.id], { replaceUrl: true });
      }
      return note.id;
    } catch (err) {
      this.error.set(this.describeError(err, 'Beležke ni bilo mogoče shraniti.'));
      return null;
    } finally {
      this.saving.set(false);
    }
  }

  protected async onRecorded(event: RecordedEvent): Promise<void> {
    const maxBytes = this.capabilities()?.audioMaxBytes;
    if (maxBytes && event.blob.size > maxBytes) {
      this.error.set(`Posnetek je prevelik (${formatBytes(event.blob.size)}, največ ${formatBytes(maxBytes)}).`);
      return;
    }

    const noteId = this.noteId() ?? (await this.persist());
    if (!noteId) return;
    // Sprememba besedila, narejena med snemanjem, se shrani skupaj s posnetkom — sicer bi
    // nalaganje posnetka "dvignilo" beležko z zastarelo vsebino.
    if (this.dirty && this.noteId()) await this.persist();

    this.uploading.set(true);
    this.transcribing.set(event.transcribeOnServer);
    this.error.set(null);
    try {
      const uploaded = await this.api.uploadAudio(noteId, event, { transcribe: event.transcribeOnServer });
      this.audio.set([...this.audio(), uploaded]);
      if (uploaded.transcriptStatus === 'failed' && uploaded.transcriptError) {
        // Posnetek JE shranjen, prepis ni uspel — to je dvoje in uporabnik mora videti oboje.
        this.error.set(`Posnetek je shranjen, prepis pa ni uspel: ${uploaded.transcriptError}`);
      }
    } catch (err) {
      this.error.set(this.describeError(err, 'Posnetka ni bilo mogoče shraniti.'));
    } finally {
      this.uploading.set(false);
      this.transcribing.set(false);
    }
  }

  protected async play(item: NoteAudio): Promise<void> {
    const noteId = this.noteId();
    if (!noteId || this.playingUrl()[item.id]) return;
    this.loadingAudioId.set(item.id);
    try {
      const blob = await this.api.audioBlob(noteId, item.id);
      this.playingUrl.set({ ...this.playingUrl(), [item.id]: URL.createObjectURL(blob) });
    } catch {
      this.error.set('Posnetka ni bilo mogoče naložiti.');
    } finally {
      this.loadingAudioId.set(null);
    }
  }

  protected async transcribe(item: NoteAudio): Promise<void> {
    const noteId = this.noteId();
    if (!noteId) return;
    this.transcribingId.set(item.id);
    this.error.set(null);
    try {
      const updated = await this.api.transcribeAudio(noteId, item.id);
      this.audio.set(this.audio().map((a) => (a.id === updated.id ? updated : a)));
      if (updated.transcriptStatus === 'failed' && updated.transcriptError) {
        this.error.set(updated.transcriptError);
      }
    } catch (err) {
      this.error.set(this.describeError(err, 'Prepisa ni bilo mogoče izvesti.'));
    } finally {
      this.transcribingId.set(null);
    }
  }

  protected async confirmDeleteAudio(item: NoteAudio): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Izbriši posnetek',
      message: 'Posnetek bo nepovratno izbrisan. Besedilo beležke ostane.',
      buttons: [
        { text: 'Prekliči', role: 'cancel' },
        { text: 'Izbriši', role: 'destructive', handler: () => void this.deleteAudio(item) },
      ],
    });
    await alert.present();
  }

  private async deleteAudio(item: NoteAudio): Promise<void> {
    const noteId = this.noteId();
    if (!noteId) return;
    try {
      await this.api.removeAudio(noteId, item.id);
      const url = this.playingUrl()[item.id];
      if (url) {
        URL.revokeObjectURL(url);
        const rest = { ...this.playingUrl() };
        delete rest[item.id];
        this.playingUrl.set(rest);
      }
      this.audio.set(this.audio().filter((a) => a.id !== item.id));
    } catch {
      this.error.set('Posnetka ni bilo mogoče izbrisati.');
    }
  }

  private applyNote(note: Note): void {
    this.noteId.set(note.id);
    this.title = note.title;
    this.body = note.body;
    this.tagsInput = formatTagInput(note.tags);
    this.pinned = note.pinned;
    this.audio.set(note.audio ?? this.audio());
  }

  /** Strežnik pošilja `application/problem+json` (platform/errors/problem.ts) — `detail` je
   * napisan za človeka in je vedno boljši od našega splošnega stavka, kadar obstaja. Velja
   * tudi za 409 "prepis ni na voljo", ki natanko pove, kaj manjka. */
  private describeError(err: unknown, fallback: string): string {
    if (err instanceof HttpErrorResponse) {
      const detail = (err.error as { detail?: unknown } | null)?.detail;
      if (typeof detail === 'string' && detail.trim().length > 0) return detail;
    }
    return fallback;
  }
}

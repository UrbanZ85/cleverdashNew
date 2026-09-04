import { Component, EventEmitter, OnDestroy, Output, input, signal } from '@angular/core';
import { IonButton, IonIcon, IonNote, IonText, IonToggle } from '@ionic/angular/standalone';
import { HelpButtonComponent } from '../../shared/help/help-button.component.js';
import { DictationSession, dictationUnsupportedReason, isDictationSupported } from './dictation.js';
import {
  RecordingSession,
  describeRecordingError,
  isRecordingSupported,
  recordingUnsupportedReason,
  type Recording,
} from './recorder.js';
import { formatDuration } from './notes.model.js';

export interface RecordedEvent extends Recording {
  /** Ali naj posnetek prepiše strežnik. `false`, dokler uporabnik tega izrecno ne izbere — in
   * možnosti sploh ni videti, dokler je strežnik ne ponudi (glej `serverTranscription`). */
  transcribeOnServer: boolean;
}

/**
 * Govorni vnos za beležko. Dva ločena, med sabo neodvisna mehanizma v enem razdelku, ker
 * uporabnik iz njiju izbira v istem trenutku — a je razlika med njima pomembna in izpisana:
 *
 *  - **Narekovanje** (Web Speech API, dictation.ts) piše BESEDILO naravnost v vsebino
 *    beležke. Zvok se ne shrani. V Chromu gre za prepoznavo prek Googlovih strežnikov.
 *  - **Snemanje** (MediaRecorder, recorder.ts) shrani ZVOK k beležki. Nikamor ne gre, razen
 *    če uporabnik izrecno izbere prepis na strežniku — in ta možnost se pokaže samo, kadar je
 *    ključ nastavljen v okolju IN je stikalo v nastavitvah vklopljeno (dvojna ključavnica,
 *    glej apps/api/src/modules/notes/domain/transcription-gate.ts).
 */
@Component({
  selector: 'app-voice-input',
  standalone: true,
  imports: [HelpButtonComponent, IonButton, IonIcon, IonNote, IonText, IonToggle],
  template: `
    <div class="voice">
      <div class="voice-row">
        @if (dictationSupported) {
          <ion-button
            size="small"
            [color]="dictating() ? 'danger' : 'primary'"
            [fill]="dictating() ? 'solid' : 'outline'"
            (click)="toggleDictation()"
          >
            <ion-icon slot="start" [name]="dictating() ? 'stop-circle-outline' : 'mic-outline'" aria-hidden="true"></ion-icon>
            {{ dictating() ? 'Končaj narekovanje' : 'Narekuj' }}
          </ion-button>
        }
        @if (recordingSupported) {
          <ion-button
            size="small"
            [color]="recording() ? 'danger' : 'medium'"
            [fill]="recording() ? 'solid' : 'outline'"
            [disabled]="busy()"
            (click)="toggleRecording()"
          >
            <ion-icon slot="start" [name]="recording() ? 'stop-circle-outline' : 'radio-outline'" aria-hidden="true"></ion-icon>
            {{ recording() ? 'Ustavi snemanje (' + elapsed() + ')' : 'Posnemi' }}
          </ion-button>
          @if (recording()) {
            <ion-button size="small" fill="clear" color="medium" (click)="cancelRecording()">Zavrzi</ion-button>
          }
        }
        <app-help slot="end" topic="notes.voice"></app-help>
      </div>

      @if (dictating()) {
        <ion-note class="voice-live">
          Poslušam … {{ interim() || '(govori)' }}
        </ion-note>
      }

      <!-- Stikalo je vidno SAMO, kadar je prepis na strežniku res mogoč. Kadar ni, je
           namesto njega razlog — uporabnik mora vedeti, ali manjka klik v nastavitvah ali
           ključ v namestitvi. -->
      @if (serverTranscription().available) {
        <ion-toggle
          class="voice-toggle"
          [checked]="transcribeOnServer()"
          (ionChange)="transcribeOnServer.set($any($event).detail.checked)"
        >
          Posnetek naj prepiše strežnik
        </ion-toggle>
      } @else if (serverTranscription().detail; as detail) {
        <ion-note class="voice-hint">{{ detail }}</ion-note>
      }

      @if (!dictationSupported) {
        <ion-note class="voice-hint">{{ dictationUnsupported }}</ion-note>
      }
      @if (!recordingSupported) {
        <ion-note class="voice-hint">{{ recordingUnsupported }}</ion-note>
      }
      @if (error(); as message) {
        <ion-text color="danger"><p class="voice-error">{{ message }}</p></ion-text>
      }
    </div>
  `,
  styles: `
    .voice {
      display: flex;
      flex-direction: column;
      gap: var(--cd-space-2);
      padding: var(--cd-space-3) 0;
    }
    .voice-row {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: var(--cd-space-2);
    }
    .voice-live {
      font-style: italic;
    }
    .voice-hint,
    .voice-error {
      font-size: 0.85rem;
      margin: 0;
    }
    .voice-toggle {
      font-size: 0.9rem;
    }
  `,
})
export class VoiceInputComponent implements OnDestroy {
  /** Kaj je s prepisom na strežniku — pride iz `GET /notes/capabilities`. */
  readonly serverTranscription = input<{ available: boolean; detail: string | null }>({
    available: false,
    detail: null,
  });

  /** Dokončan del narekovanega besedila. Starš ga prilepi v vsebino (appendDictation). */
  @Output() readonly dictated = new EventEmitter<string>();
  /** Končan posnetek — starš ga naloži k beležki (in jo prej po potrebi ustvari). */
  @Output() readonly recorded = new EventEmitter<RecordedEvent>();

  protected readonly dictationSupported = isDictationSupported();
  protected readonly recordingSupported = isRecordingSupported();
  protected readonly dictationUnsupported = dictationUnsupportedReason;
  protected readonly recordingUnsupported = recordingUnsupportedReason;

  protected readonly dictating = signal(false);
  protected readonly recording = signal(false);
  protected readonly busy = signal(false);
  protected readonly interim = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly elapsed = signal('0:00');
  protected readonly transcribeOnServer = signal(false);

  private dictation: DictationSession | null = null;
  private session: RecordingSession | null = null;
  private ticker: ReturnType<typeof setInterval> | null = null;

  ngOnDestroy(): void {
    // Zapuščena stran ne sme pustiti prižganega mikrofona.
    this.dictation?.stop();
    this.session?.cancel();
    this.stopTicker();
  }

  protected toggleDictation(): void {
    if (this.dictating()) {
      this.dictation?.stop();
      return;
    }
    this.error.set(null);
    this.dictation = new DictationSession({
      onFinal: (text) => this.dictated.emit(text),
      onInterim: (text) => this.interim.set(text),
      onError: (message) => this.error.set(message),
      onEnd: () => {
        this.dictating.set(false);
        this.dictation = null;
      },
    });
    this.dictation.start();
    // `active` je `false`, če zagon ni uspel (npr. zavrnjen mikrofon) — takrat gumb ne sme
    // trditi, da posluša.
    this.dictating.set(this.dictation.active);
  }

  protected async toggleRecording(): Promise<void> {
    if (this.recording()) {
      await this.finishRecording();
      return;
    }
    this.error.set(null);
    this.busy.set(true);
    try {
      this.session = await RecordingSession.start();
      this.recording.set(true);
      this.startTicker();
    } catch (err) {
      this.error.set(describeRecordingError(err));
    } finally {
      this.busy.set(false);
    }
  }

  protected cancelRecording(): void {
    this.session?.cancel();
    this.session = null;
    this.recording.set(false);
    this.stopTicker();
  }

  private async finishRecording(): Promise<void> {
    const session = this.session;
    if (!session) return;
    this.busy.set(true);
    try {
      const recording = await session.stop();
      this.recorded.emit({ ...recording, transcribeOnServer: this.transcribeOnServer() });
    } catch (err) {
      this.error.set(describeRecordingError(err));
    } finally {
      this.session = null;
      this.recording.set(false);
      this.stopTicker();
      this.busy.set(false);
    }
  }

  private startTicker(): void {
    this.stopTicker();
    this.elapsed.set('0:00');
    this.ticker = setInterval(() => {
      this.elapsed.set(formatDuration(this.session?.elapsedMs ?? 0));
    }, 500);
  }

  private stopTicker(): void {
    if (this.ticker) clearInterval(this.ticker);
    this.ticker = null;
  }
}

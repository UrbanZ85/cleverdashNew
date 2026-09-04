// Snemanje zvoka v brskalniku (MediaRecorder). Posnetek gre nato na naš strežnik in se
// shrani k beležki (POST /notes/{id}/audio) — nikamor drugam.
//
// Ločeno od dictation.ts namenoma: narekovanje da BESEDILO in zvoka ne shrani, snemanje da
// ZVOK in besedila ne naredi. Uporabnik lahko oboje hkrati (govori in ima posnetek), a to sta
// dva različna mehanizma z dvema različnima posledicama za zasebnost, zato tudi dva razreda.
//
// Brez uvozov iz @angular/*.

/** Oblike po prednostnem vrstnem redu. Prvo, kar brskalnik podpira, tudi uporabimo:
 *  - `audio/webm;codecs=opus` — Chrome, Edge, Firefox, Android;
 *  - `audio/mp4` — Safari (webm ne zna posneti).
 * Strežnik sprejme oboje (glej modules/notes/domain/note-input.ts). */
const PREFERRED_MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];

export function isRecordingSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof MediaRecorder !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  );
}

export const recordingUnsupportedReason =
  'Snemanje v tem brskalniku ni na voljo. Beležko lahko vseeno napišeš ali narekuješ.';

export function pickRecordingMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const type of PREFERRED_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return null;
}

export interface Recording {
  blob: Blob;
  /** Vrsta BREZ parametra kodeka — točno to gre v glavo `Content-Type` pri nalaganju. */
  mimeType: string;
  durationMs: number;
}

/** Sporočilo za napake `getUserMedia`. `NotAllowedError` je zavrnjeno dovoljenje in edina,
 * ki jo uporabnik lahko odpravi sam; `NotFoundError` pomeni, da mikrofona ni. */
export function describeRecordingError(err: unknown): string {
  const name = err instanceof Error ? err.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Dostop do mikrofona ni dovoljen. Dovoli ga v nastavitvah strani in poskusi znova.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'Mikrofona ni bilo mogoče najti.';
  }
  if (name === 'NotReadableError') {
    return 'Mikrofon je zaseden z drugo aplikacijo.';
  }
  return err instanceof Error && err.message ? err.message : 'Snemanja ni bilo mogoče zagnati.';
}

/**
 * Ena seja snemanja. `start()` vrne šele, ko uporabnik dovoli mikrofon in snemanje res teče
 * — dokler ni tako, vmesnik ne sme trditi, da snema.
 */
export class RecordingSession {
  private readonly chunks: Blob[] = [];
  private readonly startedAt = Date.now();

  private constructor(
    private readonly recorder: MediaRecorder,
    private readonly stream: MediaStream,
    private readonly mimeType: string,
  ) {}

  static async start(): Promise<RecordingSession> {
    const mimeType = pickRecordingMimeType();
    if (!isRecordingSupported() || !mimeType) {
      throw new Error(recordingUnsupportedReason);
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream, { mimeType });
    const session = new RecordingSession(recorder, stream, mimeType);
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) session.chunks.push(event.data);
    };
    // Kos na sekundo: brez tega MediaRecorder v nekaterih brskalnikih vse zadrži do konca in
    // dolgo snemanje se ob nenadnem zaprtju zavihka izgubi v celoti.
    recorder.start(1000);
    return session;
  }

  get elapsedMs(): number {
    return Date.now() - this.startedAt;
  }

  /** Ustavi snemanje in vrne posnetek. Mikrofon se sprosti (`stop()` na sledeh) v vsakem
   * primeru — brez tega ostane v zavihku prižgana rdeča pika, tudi ko nič ne snemamo. */
  stop(): Promise<Recording> {
    return new Promise<Recording>((resolve, reject) => {
      this.recorder.onstop = () => {
        this.releaseMicrophone();
        const blob = new Blob(this.chunks, { type: this.mimeType });
        if (blob.size === 0) {
          reject(new Error('Posnetek je prazen — mikrofon ni oddal zvoka.'));
          return;
        }
        resolve({
          blob,
          // Parameter kodeka se odreže: strežnik shrani osnovno vrsto, ker je ta tudi
          // predvajljiva nazaj skozi <audio>.
          mimeType: this.mimeType.split(';')[0] ?? this.mimeType,
          durationMs: this.elapsedMs,
        });
      };
      this.recorder.onerror = () => {
        this.releaseMicrophone();
        reject(new Error('Snemanje je spodletelo.'));
      };
      if (this.recorder.state === 'inactive') {
        this.releaseMicrophone();
        reject(new Error('Snemanje ni teklo.'));
        return;
      }
      this.recorder.stop();
    });
  }

  /** Prekinitev brez shranjevanja — uporabnik je snemanje preklical. */
  cancel(): void {
    if (this.recorder.state !== 'inactive') this.recorder.stop();
    this.chunks.length = 0;
    this.releaseMicrophone();
  }

  private releaseMicrophone(): void {
    for (const track of this.stream.getTracks()) track.stop();
  }
}

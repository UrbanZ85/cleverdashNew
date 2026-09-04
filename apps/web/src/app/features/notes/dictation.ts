// Narekovanje v BRSKALNIKU (Web Speech API). Brez strežnika, brez ključev, brez stroška:
// prepis nastane sproti med govorjenjem in se piše naravnost v polje vsebine.
//
// Kaj mora uporabnik o tem vedeti (in kar zato pove vmesnik, ne samo ta komentar):
//  - podpira ga Chrome, Edge in Android WebView; Firefox in iOS Safari ne — tam gumba ni,
//    namesto njega je pojasnilo (`dictationUnsupportedReason`), ne pa mrtev gumb;
//  - Chrome zvok za prepoznavo pošlje Googlu. To ni naša odločitev in je ne moremo izklopiti;
//    zato je narekovanje ločeno od SNEMANJA (recorder.ts) in od prepisa na strežniku, ki
//    zahteva izrecno privolitev (glej modules/notes/domain/transcription-gate.ts na API-ju).
//
// Ta datoteka nima uvozov iz @angular/* — je navaden razred nad brskalniškim API-jem.

/** Minimalen opis `SpeechRecognition`, kolikor ga uporabljamo. Lasten, ker ga TypeScriptov
 * `lib.dom` še ne pozna, in tipiziran, ker `any` v tej plasti ni dovoljen (ustava, vrata 1). */
interface SpeechRecognitionAlternativeLike {
  transcript: string;
}
interface SpeechRecognitionResultLike {
  readonly length: number;
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternativeLike;
}
interface SpeechRecognitionResultListLike {
  readonly length: number;
  [index: number]: SpeechRecognitionResultLike;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: SpeechRecognitionResultListLike;
}
interface SpeechRecognitionErrorEventLike {
  error: string;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function recognitionConstructor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isDictationSupported(): boolean {
  return recognitionConstructor() !== null;
}

/** Zakaj gumba ni — besedilo za vmesnik. Mrtev gumb z razlago v opisu je slabši od gumba,
 * ki ga ni, skupaj s stavkom, kaj namesto njega. */
export const dictationUnsupportedReason =
  'Narekovanje v tem brskalniku ni na voljo (podpirajo ga Chrome, Edge in Android). Posnetek lahko vseeno posnameš in shraniš k beležki.';

/** Slovenska sporočila za napake, ki jih Web Speech API vrne kot kode. `not-allowed` je
 * najpogostejša in edina, ki jo uporabnik lahko odpravi sam. */
const ERROR_TEXT: Record<string, string> = {
  'not-allowed': 'Brskalnik ni dovolil dostopa do mikrofona. Dovoli ga v nastavitvah strani in poskusi znova.',
  'service-not-allowed': 'Brskalnik je zavrnil storitev za prepoznavo govora.',
  'no-speech': 'Ničesar nisem slišal — preveri mikrofon in poskusi znova.',
  'audio-capture': 'Mikrofona ni bilo mogoče odpreti. Je priklopljen in prost?',
  network: 'Prepoznava govora potrebuje omrežje, tega pa zdaj ni.',
  aborted: 'Narekovanje je bilo prekinjeno.',
};

export function describeDictationError(code: string): string {
  return ERROR_TEXT[code] ?? `Narekovanje je spodletelo (${code}).`;
}

export interface DictationCallbacks {
  /** Dokončan del govora — to se doda v vsebino beležke. */
  onFinal(text: string): void;
  /** Trenutna, še ne dokončana beseda/stavek. Uporabnik mora videti, da ga sistem posluša;
   * brez tega je narekovanje videti kot da ne dela, dokler ne konča stavka. */
  onInterim(text: string): void;
  onError(message: string): void;
  onEnd(): void;
}

/**
 * Ena seja narekovanja. `continuous: true` pomeni, da se prepoznava ne ustavi po prvem
 * stavku, a jo brskalnik vseeno lahko sam konča (tišina, izguba omrežja) — takrat se sproži
 * `onEnd` in vmesnik mora pokazati, da ne posluša več. Samodejnega ponovnega zagona
 * NAMENOMA ni: mikrofon, ki se sam prižge nazaj, je za uporabnika neprijetno presenečenje.
 */
export class DictationSession {
  private recognition: SpeechRecognitionLike | null = null;
  private stopping = false;

  constructor(private readonly callbacks: DictationCallbacks, private readonly lang = 'sl-SI') {}

  get active(): boolean {
    return this.recognition !== null;
  }

  start(): void {
    if (this.recognition) return;
    const Ctor = recognitionConstructor();
    if (!Ctor) {
      this.callbacks.onError(dictationUnsupportedReason);
      return;
    }

    const recognition = new Ctor();
    recognition.lang = this.lang;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      // Od `resultIndex` naprej so SAMO novi rezultati. Brez tega bi se vsak dokončan stavek
      // ob vsakem dogodku dodal znova in besedilo bi se množilo.
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (!result || result.length === 0) continue;
        const text = result[0]?.transcript ?? '';
        if (result.isFinal) {
          this.callbacks.onFinal(text);
        } else {
          interim += text;
        }
      }
      this.callbacks.onInterim(interim);
    };

    recognition.onerror = (event) => {
      // `aborted` po našem `stop()` ni napaka, ampak pričakovan konec.
      if (this.stopping && event.error === 'aborted') return;
      this.callbacks.onError(describeDictationError(event.error));
    };

    recognition.onend = () => {
      this.recognition = null;
      this.stopping = false;
      this.callbacks.onInterim('');
      this.callbacks.onEnd();
    };

    this.recognition = recognition;
    try {
      recognition.start();
    } catch (err) {
      // `start()` vrže, če je seja že tekla — stanje pobrišemo, da gumb ne obtiči v "posluša".
      this.recognition = null;
      this.callbacks.onError(err instanceof Error ? err.message : 'Narekovanja ni bilo mogoče zagnati.');
    }
  }

  stop(): void {
    if (!this.recognition) return;
    this.stopping = true;
    this.recognition.stop();
  }
}

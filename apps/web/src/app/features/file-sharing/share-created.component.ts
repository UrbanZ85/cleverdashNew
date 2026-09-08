import { Component, input, output, signal } from '@angular/core';
import { IonButton, IonIcon, IonNote, IonText } from '@ionic/angular/standalone';

/**
 * Enkraten prikaz povezave IN skrivnosti, ki gre z njo (FR-011, FR-082).
 *
 * Opozorilo, da skrivnosti pozneje ne bo več mogoče videti, je VNAPREJ — ne potem, ko je okno že
 * zaprto. To je edina točka v vsem vmesniku, kjer je v čistopisu; v bazi je samo scrypt povzetek
 * in nobenega drugega odgovora, ki bi ga vseboval.
 *
 * 009b: ista komponenta streže OBEMA smerema — geslu za prevzem in kodi za oddajo. Napisi so
 * zato vhodi z privzetkom deljenja. Dvojnik te komponente z drugimi napisi bi pomenil dve
 * izvedbi opozorila "vidiš samo enkrat" in dve izvedbi kopiranja v odložišče, ki lahko spodleti.
 */
@Component({
  selector: 'app-share-created',
  standalone: true,
  imports: [IonButton, IonIcon, IonNote, IonText],
  template: `
    <div class="share-created">
      <div class="warning">
        <ion-icon name="lock-closed-outline" aria-hidden="true"></ion-icon>
        <ion-text>
          <strong>{{ warning() }}</strong>
          Ko to okno zapreš, ne bo več mogoče prebrati — lahko pa izdaš novo, kar staro povezavo
          takoj razveljavi.
        </ion-text>
      </div>

      <label class="field">
        <span>{{ linkLabel() }}</span>
        <output>{{ shareUrl() }}</output>
        <ion-button size="small" fill="outline" (click)="copy(shareUrl(), 'povezavo')">Kopiraj</ion-button>
      </label>

      <label class="field">
        <span>{{ secretLabel() }}</span>
        <output class="password">{{ password() }}</output>
        <ion-button size="small" fill="outline" (click)="copy(password(), secretNoun())">Kopiraj</ion-button>
      </label>

      @if (copied(); as what) {
        <ion-note color="success">Kopirano: {{ what }}.</ion-note>
      }
      @if (copyFailed()) {
        <ion-note color="warning">Kopiranje ni uspelo — označi besedilo in ga kopiraj ročno.</ion-note>
      }

      <ion-note>{{ hint() }}</ion-note>

      <ion-button expand="block" (click)="done.emit()">Zapri</ion-button>
    </div>
  `,
  styles: [
    `
      .share-created {
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }
      .warning {
        display: flex;
        gap: 0.5rem;
        align-items: flex-start;
        padding: 0.75rem;
        border-radius: 8px;
        background: var(--ion-color-warning-tint, #fff4e0);
        color: var(--ion-color-warning-contrast, #000);
      }
      .field {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      }
      .field span {
        font-size: 0.8rem;
        color: var(--ion-color-medium);
      }
      .field output {
        font-family: monospace;
        word-break: break-all;
        padding: 0.5rem;
        border-radius: 6px;
        background: var(--ion-color-light);
      }
      .password {
        font-size: 1.2rem;
        letter-spacing: 0.08em;
      }
    `,
  ],
})
export class ShareCreatedComponent {
  readonly shareUrl = input.required<string>();
  readonly password = input.required<string>();
  /** Napisi. Privzetki so za DELJENJE (009); sprejemni predal (009b) jih prepiše. */
  readonly linkLabel = input('Povezava');
  readonly secretLabel = input('Geslo');
  /** Tožilnik za sporočilo "Kopirano: …" — slovenščina brez sklona zveni kot strojni prevod. */
  readonly secretNoun = input('geslo');
  /** Cel stavek in ne sestavljanje iz `secretLabel`: "Geslo je prikazano" proti "Koda je
   * prikazana" se razlikuje v končnici, ki je ni mogoče izpeljati iz imena polja. */
  readonly warning = input('Geslo je prikazano samo enkrat.');
  readonly hint = input(
    'Prejemniku pošlji oboje. Sama povezava ne odpre ničesar — in prav to je namen. Priporočljivo je, da gesla ne pošlješ po isti poti kot povezavo.',
  );
  readonly done = output<void>();

  readonly copied = signal<string | null>(null);
  readonly copyFailed = signal(false);

  async copy(value: string, what: string): Promise<void> {
    this.copyFailed.set(false);
    try {
      // `navigator.clipboard` ni povsod na voljo (starejši WebView, stran brez varnega izvora);
      // tiho spodletelo kopiranje bi pomenilo geslo, ki ga uporabnik misli, da ima.
      await navigator.clipboard.writeText(value);
      this.copied.set(what);
    } catch {
      this.copied.set(null);
      this.copyFailed.set(true);
    }
  }
}

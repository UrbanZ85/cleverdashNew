import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { IonButton, IonIcon, IonItem, IonNote, IonText, IonToggle } from '@ionic/angular/standalone';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { apiUrl } from '../../core/api/api-base.js';
import { SettingsStore } from '../../core/settings/settings.store.js';
import { HelpButtonComponent } from '../../shared/help/help-button.component.js';

/** Odgovor `GET /notes/capabilities`, kolikor ga ta razdelek potrebuje. */
interface NotesCapabilitiesResponse {
  serverTranscription: { configured: boolean; enabled: boolean; available: boolean };
}

// Živi v features/settings/, ne v features/notes/ — enak vzorec kot app-cameras-settings in
// app-time-tracking-settings: Nastavitve so skupni gostitelj, modul prispeva svoj razdelek
// prek istega GET/PUT /settings.
//
// Razdelek ima eno samo nastavitev, a ta ni majhna: z njo posnetek uporabnikovega glasu
// zapusti strežnik. Zato je vklop izrecen, privzeto izklopljen, in stanje ključa v okolju je
// izpisano — brez tega bi vklopljeno stikalo brez ključa pomenilo gumb, ki tiho ne dela.
@Component({
  selector: 'app-notes-settings',
  standalone: true,
  imports: [FormsModule, RouterLink, HelpButtonComponent, IonItem, IonToggle, IonNote, IonText, IonButton, IonIcon],
  template: `
    <ion-item>
      <ion-toggle [(ngModel)]="serverTranscription" (ionChange)="save()">
        Pošiljaj posnetke zunanji storitvi za prepis
      </ion-toggle>
      <app-help slot="end" topic="notes.serverTranscription"></app-help>
    </ion-item>

    @if (configured() === false) {
      <ion-note class="cd-section-hint">
        Storitev za prepis v tej namestitvi ni nastavljena (manjkata <code>NOTES_TRANSCRIPTION_URL</code> in
        <code>NOTES_TRANSCRIPTION_API_KEY</code> v okolju strežnika). Stikalo lahko vklopiš že zdaj — učinek bo
        imelo, ko bosta ključ in naslov nastavljena.
      </ion-note>
    } @else if (configured() === true && !serverTranscription) {
      <ion-note class="cd-section-hint">
        Ključ je nastavljen, pošiljanje pa izklopljeno — posnetki ostajajo na tem strežniku. Narekovanje v
        brskalniku deluje tudi tako.
      </ion-note>
    }

    @if (saved()) {
      <ion-text color="success"><p>Shranjeno.</p></ion-text>
    }
    @if (error(); as message) {
      <ion-text color="danger"><p>{{ message }}</p></ion-text>
    }

    <p class="cd-section-hint">Beležke same pišeš in urejaš na svojem zaslonu.</p>
    <ion-button expand="block" fill="outline" [routerLink]="['/notes']">
      <ion-icon slot="start" name="reader-outline" aria-hidden="true"></ion-icon>
      Odpri beležke
    </ion-button>
  `,
})
export class NotesSettingsComponent implements OnInit {
  private readonly settings = inject(SettingsStore);
  private readonly http = inject(HttpClient);

  serverTranscription = false;
  /** `null`, dokler odgovora strežnika ni — takrat se ne trdi ne eno ne drugo. */
  readonly configured = signal<boolean | null>(null);
  readonly saved = signal(false);
  readonly error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    await this.settings.ensureLoaded();
    this.serverTranscription = this.settings.settings().notes.serverTranscription;
    try {
      const caps = await firstValueFrom(
        this.http.get<NotesCapabilitiesResponse>(apiUrl('/notes/capabilities'), { withCredentials: true }),
      );
      this.configured.set(caps.serverTranscription.configured);
    } catch {
      // Neznano stanje ključa ni napaka tega razdelka — stikalo deluje naprej, samo namiga o
      // okolju ni.
      this.configured.set(null);
    }
  }

  async save(): Promise<void> {
    this.saved.set(false);
    this.error.set(null);
    try {
      await this.settings.patch({ notes: { serverTranscription: this.serverTranscription } });
      this.saved.set(true);
    } catch {
      // Shramba je lokalno stanje že povrnila — uskladi še polje, sicer bi stikalo ostalo na
      // neshranjeni vrednosti (ista napaka, kot je bila v cameras-section.component.ts).
      this.serverTranscription = this.settings.settings().notes.serverTranscription;
      this.error.set('Nastavitve ni bilo mogoče shraniti. Poskusi znova.');
    }
  }
}

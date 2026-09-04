import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonList, IonItem, IonInput, IonButton, IonNote, IonText } from '@ionic/angular/standalone';
import { SettingsStore } from '../../core/settings/settings.store.js';
import { HelpButtonComponent } from '../../shared/help/help-button.component.js';
import type { HelpTopicId } from '../../shared/help/help-topics.js';

interface SourceRow {
  key: 'weatherUrl' | 'radarUrl' | 'webcamBaseUrl';
  label: string;
  hint: string;
  /** Ključ pojasnila; vsak vir ima svojega, ker se razlikujejo po obliki odgovora. */
  help: HelpTopicId;
}

// 005: naslovi zunanjih virov so bili do zdaj SAMO v .env (ARSO_WEATHER_URL, ARSO_RADAR_URL,
// ARSO_WEBCAM_BASE_URL), kar je pomenilo, da jih ni mogel spremeniti nihče brez dostopa do
// strežnika in ponovnega zagona.
//
// Zdaj sta dva nivoja: .env ostane SISTEMSKI PRIVZETEK (namestitev deluje takoj), tukaj pa
// jih vsak zase prepiše. Prazno polje pomeni "velja privzetek" — zato je gumb "Povrni na
// privzeto" isto kot izprazniti polje in shraniti.
const ROWS: SourceRow[] = [
  {
    key: 'weatherUrl',
    label: 'Vremenski vir (JSON)',
    hint: 'Privzeto ARSO. Ime lokacije se pripne kot ?location=…',
    help: 'sources.weatherUrl',
  },
  {
    key: 'radarUrl',
    label: 'Radarska slika',
    hint: 'Privzeto animirani GIF ARSO.',
    help: 'sources.radarUrl',
  },
  {
    key: 'webcamBaseUrl',
    label: 'Osnovni naslov spletnih kamer',
    hint: 'Predloga za kamere ARSO na zavihku Kamere.',
    help: 'sources.webcamBaseUrl',
  },
];

@Component({
  selector: 'app-sources-settings',
  standalone: true,
  imports: [FormsModule, HelpButtonComponent, IonList, IonItem, IonInput, IonButton, IonNote, IonText],
  template: `
    <p class="cd-section-hint">
      Prazno polje pomeni, da velja sistemska privzeta vrednost. Dovoljen je samo
      <strong>https</strong> in naslov, ki ne kaže v lokalno omrežje — te naslove prenaša
      strežnik v tvojem imenu.
    </p>

    <ion-list class="sources" lines="full">
      @for (row of rows; track row.key) {
        <ion-item>
          <ion-input
            [label]="row.label"
            labelPlacement="stacked"
            type="url"
            inputmode="url"
            placeholder="Privzeto (iz sistemske nastavitve)"
            [(ngModel)]="values[row.key]"
            [name]="row.key"
          ></ion-input>
          @if (values[row.key]) {
            <ion-button slot="end" fill="clear" size="small" (click)="reset(row.key)">Privzeto</ion-button>
          }
          <app-help slot="end" [topic]="row.help"></app-help>
        </ion-item>
        <ion-note class="cd-section-hint row-hint">{{ row.hint }}</ion-note>
      }
    </ion-list>

    @if (saved()) {
      <ion-text color="success"><p class="message">Shranjeno.</p></ion-text>
    }
    @if (error(); as message) {
      <ion-text color="danger"><p class="message">{{ message }}</p></ion-text>
    }

    <ion-button expand="block" [disabled]="saving()" (click)="save()">
      {{ saving() ? 'Shranjujem ...' : 'Shrani vire' }}
    </ion-button>
  `,
  styles: `
    .sources {
      border: 1px solid var(--cd-divider);
      border-radius: var(--cd-radius-md);
      overflow: hidden;
      margin-bottom: var(--cd-space-3);
    }
    .row-hint {
      display: block;
      padding: 0 var(--cd-space-3) var(--cd-space-2);
    }
    .message {
      margin: var(--cd-space-2) 0;
      font-size: var(--cd-font-size-sm);
    }
  `,
})
export class SourcesSettingsComponent implements OnInit {
  private readonly settings = inject(SettingsStore);

  protected readonly rows = ROWS;
  values: Record<SourceRow['key'], string> = { weatherUrl: '', radarUrl: '', webcamBaseUrl: '' };

  readonly saving = signal(false);
  readonly saved = signal(false);
  readonly error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    await this.settings.ensureLoaded();
    const sources = this.settings.sources();
    this.values = {
      weatherUrl: sources.weatherUrl ?? '',
      radarUrl: sources.radarUrl ?? '',
      webcamBaseUrl: sources.webcamBaseUrl ?? '',
    };
  }

  reset(key: SourceRow['key']): void {
    this.values[key] = '';
  }

  async save(): Promise<void> {
    this.saving.set(true);
    this.saved.set(false);
    this.error.set(null);
    try {
      // Prazen niz je pomenska vrednost ("povrni na privzeto"), ne "ne spreminjaj" —
      // strežnik ga tako tudi razume (source-overrides.service.ts).
      await this.settings.patch({
        sources: {
          weatherUrl: this.values.weatherUrl.trim() || null,
          radarUrl: this.values.radarUrl.trim() || null,
          webcamBaseUrl: this.values.webcamBaseUrl.trim() || null,
        },
      });
      this.saved.set(true);
    } catch (err) {
      const detail = (err as { error?: { detail?: unknown } } | null)?.error?.detail;
      this.error.set(typeof detail === 'string' ? detail : 'Virov ni bilo mogoče shraniti.');
    } finally {
      this.saving.set(false);
    }
  }
}

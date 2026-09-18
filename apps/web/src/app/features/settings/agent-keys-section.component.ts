import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import {
  IonButton,
  IonCheckbox,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonSelect,
  IonSelectOption,
} from '@ionic/angular/standalone';
import { apiUrl } from '../../core/api/api-base.js';

interface IngestTargetView {
  key: string;
  title: string;
  summary: string;
}

interface AgentKeyView {
  id: string;
  label: string;
  keyPrefix: string;
  targets: string[];
  targetTitles: string[];
  lastUsedAt: string | null;
  expiresAt: string | null;
}

interface CreatedKey extends AgentKeyView {
  secret: string;
  instructions: string;
  curl: string;
}

/** Ponujene veljavnosti. `null` je IZRECNA izbira "brez roka" in ne odsotnost izbire — ključ,
 * ki ga človek prilepi v tuj pogovorni vmesnik, ne sme veljati večno po pomoti. */
const EXPIRY_CHOICES: { days: number | null; label: string }[] = [
  { days: 30, label: '30 dni' },
  { days: 90, label: '90 dni' },
  { days: 365, label: 'eno leto' },
  { days: null, label: 'brez roka' },
];

// Razdelek Nastavitev za agentske ključe (015). Gostuje ga `settings.page.ts` v sklopu "Agent",
// enako kot vsak drug razdelek — ta stran je samo gostitelj.
//
// ZASLON IMA ENO NALOGO: da uporabnik pride do BESEDILA, ki ga prilepi v ChatGPT. Ključ sam po
// sebi mu ne koristi — koristi mu navodilo s ključem v njem. Zato je gumb za kopiranje navodila
// glavno dejanje po izdaji, čistopis pa je pod njim kot podatek za upravitelja gesel.
//
// Seznam ciljev pride iz `GET /ingest/targets` in NI prepisan sem: prepisan seznam bi se razšel
// z registrom ob prvem novem modulu (člen XI — naprava je odjemalec, ne planer).
@Component({
  selector: 'app-agent-keys-settings',
  standalone: true,
  imports: [
    IonList,
    IonItem,
    IonLabel,
    IonInput,
    IonButton,
    IonCheckbox,
    IonNote,
    IonSelect,
    IonSelectOption,
    FormsModule,
  ],
  template: `
    <p class="cd-section-hint">
      Ključ pove ChatGPT-ju (ali n8n-u), kam sme shranjevati. Ob izdaji dobiš navodilo, ki ga
      samo prilepiš v pogovor — nato mu pošlješ naslov strani in ta se shrani sem.
    </p>

    @if (keys().length > 0) {
      <ion-list>
        @for (key of keys(); track key.id) {
          <ion-item>
            <ion-label>
              <h2>{{ key.label }}</h2>
              <p>{{ key.targetTitles.join(', ') }} · {{ key.keyPrefix }}…</p>
              <p>{{ expiryLabel(key) }}{{ lastUsedLabel(key) }}</p>
            </ion-label>
            <ion-button fill="clear" (click)="showInstructions(key)">Navodilo</ion-button>
            <ion-button color="danger" fill="clear" (click)="revoke(key)">Prekliči</ion-button>
          </ion-item>
        }
      </ion-list>
    }

    <ion-item>
      <ion-input
        label="Ime ključa"
        labelPlacement="stacked"
        [(ngModel)]="newLabel"
        placeholder="ChatGPT — recepti"
      ></ion-input>
    </ion-item>

    <ion-item>
      <ion-select
        label="Veljavnost"
        labelPlacement="stacked"
        [(ngModel)]="newExpiryDays"
        interface="popover"
      >
        @for (choice of expiryChoices; track choice.label) {
          <ion-select-option [value]="choice.days">{{ choice.label }}</ion-select-option>
        }
      </ion-select>
    </ion-item>

    @if (targets().length === 0) {
      <ion-note color="medium">Za noben modul nimaš pravice pisanja, zato ključa ni mogoče izdati.</ion-note>
    } @else {
      <ion-label class="cd-section-hint">Kam sme ta ključ shranjevati:</ion-label>
      @for (target of targets(); track target.key) {
        <ion-item>
          <ion-checkbox
            [checked]="selected.has(target.key)"
            (ionChange)="toggle(target.key)"
            labelPlacement="end"
            justify="start"
          >
            <ion-label>
              <h3>{{ target.title }}</h3>
              <p>{{ target.summary }}</p>
            </ion-label>
          </ion-checkbox>
        </ion-item>
      }
    }

    <ion-button expand="block" [disabled]="!canCreate()" (click)="create()">Izdaj ključ</ion-button>

    @if (error(); as message) {
      <ion-note color="danger">{{ message }}</ion-note>
    }

    @if (created(); as key) {
      <!-- Navodilo je PRVO in največje: to je stvar, po katero je uporabnik prišel. Čistopis je
           pod njim, ker ga potrebuje samo, če navodilo sestavlja sam ali ga hrani v geslovniku. -->
      <div class="issued">
        <h3>Ključ je izdan</h3>
        <p class="cd-section-hint">
          Prilepi spodnje navodilo v ChatGPT. Nato mu pošlji naslov strani — recept, članek ali
          karkoli, kar naj shrani.
        </p>
        <ion-button expand="block" (click)="copy(key.instructions)">
          {{ copied() === 'instructions' ? 'Kopirano ✓' : 'Kopiraj navodilo za ChatGPT' }}
        </ion-button>
        <pre class="instructions">{{ key.instructions }}</pre>

        <ion-note color="warning">
          Ključ je viden SAMO zdaj in ga ni mogoče prikazati znova:
        </ion-note>
        <pre class="secret">{{ key.secret }}</pre>
        <ion-button fill="outline" expand="block" (click)="copy(key.secret)">
          {{ copied() === 'secret' ? 'Kopirano ✓' : 'Kopiraj ključ' }}
        </ion-button>
        <ion-button fill="clear" expand="block" (click)="dismiss()">Zapri</ion-button>
      </div>
    }

    @if (viewedInstructions(); as text) {
      <div class="issued">
        <h3>Navodilo</h3>
        <ion-note color="medium">
          Ključ tu ni izpisan — ni ga mogoče prikazati znova. Če si ga izgubil, izdaj novega.
        </ion-note>
        <ion-button expand="block" (click)="copy(text)">
          {{ copied() === 'viewed' ? 'Kopirano ✓' : 'Kopiraj navodilo' }}
        </ion-button>
        <pre class="instructions">{{ text }}</pre>
        <ion-button fill="clear" expand="block" (click)="viewedInstructions.set(null)">Zapri</ion-button>
      </div>
    }
  `,
  styles: [
    `
      .issued {
        margin-top: 1rem;
      }
      /* Navodilo je poravnano besedilo s stolpci (glej platform/ingest/instructions.ts) —
         sorazmerna pisava bi poravnavo razbila in bi bilo v prilepljenem besedilu težje brati,
         kaj je obvezno. */
      pre.instructions,
      pre.secret {
        white-space: pre-wrap;
        word-break: break-word;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 0.75rem;
        background: var(--ion-color-light);
        padding: 0.75rem;
        border-radius: 8px;
        max-height: 20rem;
        overflow: auto;
      }
      pre.secret {
        font-size: 0.85rem;
        max-height: none;
      }
    `,
  ],
})
export class AgentKeysSettingsComponent implements OnInit {
  private readonly http = inject(HttpClient);

  readonly expiryChoices = EXPIRY_CHOICES;
  readonly targets = signal<IngestTargetView[]>([]);
  readonly keys = signal<AgentKeyView[]>([]);
  readonly created = signal<CreatedKey | null>(null);
  readonly viewedInstructions = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly copied = signal<'instructions' | 'secret' | 'viewed' | null>(null);
  readonly selected = new Set<string>();

  newLabel = '';
  newExpiryDays: number | null = 90;

  /**
   * Navadna METODA in ne `computed()`.
   *
   * `computed()` se osveži samo, kadar se spremeni kak signal, ki ga bere — `newLabel` in
   * `selected` pa sta navadno polje in `Set`, torej nista signala. Gumb bi ostal onemogočen med
   * tipkanjem imena in bi se odklenil šele ob naslednjem prekljucu potrditvenega polja. Pod
   * zone.js se metoda v predlogi ovrednoti ob vsakem dogodku, kar je tu natanko pravo vedenje.
   */
  canCreate(): boolean {
    return this.newLabel.trim().length > 0 && this.selected.size > 0;
  }

  async ngOnInit(): Promise<void> {
    await Promise.all([this.loadTargets(), this.reload()]);
  }

  private async loadTargets(): Promise<void> {
    try {
      const targets = await firstValueFrom(
        this.http.get<IngestTargetView[]>(apiUrl('/ingest/targets'), { withCredentials: true }),
      );
      this.targets.set(targets);
    } catch {
      // Prazen seznam je varno privzeto stanje: brez ciljev gumb ostane onemogočen.
    }
  }

  private async reload(): Promise<void> {
    try {
      const keys = await firstValueFrom(
        this.http.get<AgentKeyView[]>(apiUrl('/ingest/keys'), { withCredentials: true }),
      );
      this.keys.set(keys);
    } catch {
      // Prazen seznam je varno privzeto stanje.
    }
  }

  toggle(key: string): void {
    if (this.selected.has(key)) this.selected.delete(key);
    else this.selected.add(key);
  }

  expiryLabel(key: AgentKeyView): string {
    if (!key.expiresAt) return 'Brez roka';
    const date = new Date(key.expiresAt);
    // Datum se izriše v uporabnikovem časovnem pasu prek `Intl` in ne z ročnim rezanjem ISO
    // niza — člen V.4 (koledarski dan se nikoli ne računa prek UTC).
    const formatted = new Intl.DateTimeFormat('sl-SI', { dateStyle: 'medium' }).format(date);
    return date.getTime() < Date.now() ? `Potekel ${formatted}` : `Velja do ${formatted}`;
  }

  lastUsedLabel(key: AgentKeyView): string {
    if (!key.lastUsedAt) return ' · še neuporabljen';
    const formatted = new Intl.DateTimeFormat('sl-SI', { dateStyle: 'medium' }).format(
      new Date(key.lastUsedAt),
    );
    return ` · nazadnje ${formatted}`;
  }

  async create(): Promise<void> {
    if (!this.canCreate()) return;
    this.error.set(null);
    try {
      const res = await firstValueFrom(
        this.http.post<CreatedKey>(
          apiUrl('/ingest/keys'),
          {
            label: this.newLabel.trim(),
            targets: [...this.selected],
            expiresInDays: this.newExpiryDays,
          },
          { withCredentials: true },
        ),
      );
      this.created.set(res);
      this.viewedInstructions.set(null);
      this.newLabel = '';
      this.selected.clear();
      await this.reload();
    } catch (err: unknown) {
      // Člen VII: razlog mora biti viden uporabniku, ne samo v dnevniku. `detail` je slovenski
      // in brez tehničnih podrobnosti (problem.ts).
      const detail = (err as { error?: { detail?: string } }).error?.detail;
      this.error.set(detail ?? 'Ključa ni bilo mogoče izdati. Poskusi znova.');
    }
  }

  async showInstructions(key: AgentKeyView): Promise<void> {
    try {
      const res = await firstValueFrom(
        this.http.get<{ instructions: string }>(apiUrl(`/ingest/keys/${key.id}/instructions`), {
          withCredentials: true,
        }),
      );
      this.created.set(null);
      this.viewedInstructions.set(res.instructions);
    } catch {
      this.error.set('Navodila ni bilo mogoče prebrati.');
    }
  }

  async revoke(key: AgentKeyView): Promise<void> {
    // Preklic je nepovraten in ga potrdi človek: ključ, ki že teče v nekem pogovoru, se s tem
    // ustavi sredi dela.
    if (!confirm(`Prekličem ključ "${key.label}"? Agent, ki ga uporablja, bo takoj nehal delovati.`)) {
      return;
    }
    try {
      await firstValueFrom(
        this.http.delete(apiUrl(`/ingest/keys/${key.id}`), { withCredentials: true }),
      );
      await this.reload();
    } catch {
      this.error.set('Ključa ni bilo mogoče preklicati. Poskusi znova.');
    }
  }

  async copy(text: string): Promise<void> {
    const which = this.created()
      ? text === this.created()!.secret
        ? ('secret' as const)
        : ('instructions' as const)
      : ('viewed' as const);
    try {
      await navigator.clipboard.writeText(text);
      this.copied.set(which);
      setTimeout(() => this.copied.set(null), 2000);
    } catch {
      // `navigator.clipboard` ni na voljo brez varnega izvora (in v Capacitor WebView ne vedno).
      // Besedilo je izpisano na zaslonu, zato ga je mogoče označiti in kopirati ročno — zato tu
      // ni nadomestnega `document.execCommand`, ki je opuščen.
      this.error.set('Samodejno kopiranje ni na voljo — označi besedilo in kopiraj ročno.');
    }
  }

  dismiss(): void {
    this.created.set(null);
  }
}

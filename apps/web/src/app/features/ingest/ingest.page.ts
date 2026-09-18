import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import {
  IonButton,
  IonContent,
  IonItem,
  IonLabel,
  IonNote,
  IonSelect,
  IonSelectOption,
  IonTextarea,
} from '@ionic/angular/standalone';
import { PageHeaderComponent } from '../../shared/layout/page-header.component.js';
import { apiUrl } from '../../core/api/api-base.js';

interface IngestTargetView {
  key: string;
  title: string;
  summary: string;
}

interface IngestResultView {
  status: 'created' | 'duplicate';
  target: string;
  id: string;
  title: string;
  url: string;
  warnings: string[];
}

interface BatchResultView {
  created: number;
  duplicates: number;
  results: IngestResultView[];
}

// Stran za LEPLJENJE zapisa, ki ga je pripravil agent (`/uvoz`).
//
// ZAKAJ OBSTAJA, čeprav že obstaja `POST /ingest` z API ključem. Ključ je bilo treba prilepiti v
// tuj pogovorni vmesnik, kjer obvisi v zgodovini pogovora — in ravno tako je prvi ključ te
// namestitve pristal v tretjem sistemu. Tu ključa NI: zahtevo pošlje ta stran, s sejo človeka, ki
// je pred zaslonom. V klepet ne gre nobena poverilnica, zato tudi ni česa pozabiti preklicati.
//
// Druga, enako pomembna posledica: deluje z NAVADNIM pogovornim ChatGPT. Ta zahteve POST ne zna
// poslati (bere strani, ne pošilja teles in lastnih glav), JSON pa sestavi brez težav. Custom GPT
// z Action in agentski ključ ostajata za n8n in za tistega, ki hoče brez kopiranja.
//
// Stran NI zavihek in je namenoma ni v registru zavihkov: ne pripada nobenemu modulu (piše v vse
// tri) in v meniju bi bila četrta pot do istega, kar se že da narediti v kuharici, povezavah in
// beležkah. Dosegljiva je iz Nastavitev → Agent in po naslovu. Zato tudi `authGuard` brez
// `tabGuard` — enako kot podstrani modula 002.
//
// KLICE OPRAVI ISTI `POST /ingest` kot agent. Ločenega endpointa za lepljenje NI in ne sme biti:
// dve poti do istega pisanja bi pomenili dve mesti, kjer se preverja isto, in prvo razhajanje med
// njima bi bila varnostna luknja, ne napaka v obliki.
@Component({
  selector: 'app-ingest-page',
  standalone: true,
  imports: [
    PageHeaderComponent,
    IonContent,
    IonButton,
    IonItem,
    IonLabel,
    IonNote,
    IonSelect,
    IonSelectOption,
    IonTextarea,
    FormsModule,
  ],
  template: `
    <app-page-header title="Uvoz iz ChatGPT" subtitle="Prilepi pripravljeni JSON"></app-page-header>

    <ion-content>
      <div class="page">
        <section>
          <h2 class="cd-section-title">1. Povej ChatGPT-ju, kaj naj pripravi</h2>
          <p class="cd-section-hint">
            Navodilo prilepi v pogovor. Nato mu pošlji naslov strani, dokument ali sliko recepta —
            odgovoril bo z JSON-om. ChatGPT ničesar ne pošilja in ključa ne potrebuje.
          </p>
          <ion-button expand="block" fill="outline" (click)="copyPrompt()">
            {{ promptCopied() ? 'Kopirano ✓' : 'Kopiraj navodilo za ChatGPT' }}
          </ion-button>
          @if (prompt(); as text) {
            <details>
              <summary>Pokaži navodilo</summary>
              <pre>{{ text }}</pre>
            </details>
          }
        </section>

        <section>
          <h2 class="cd-section-title">2. Prilepi JSON sem</h2>
          <ion-item>
            <ion-textarea
              label="JSON"
              labelPlacement="stacked"
              [(ngModel)]="raw"
              (ionInput)="onInput()"
              [autoGrow]="true"
              [rows]="10"
              placeholder='{ "target": "recipes", "data": { "title": "…" } }'
              spellcheck="false"
            ></ion-textarea>
          </ion-item>

          <!-- Cilj se prebere IZ JSON-a; izbirnik se pokaže samo, kadar ga v njem ni. Agent
               polje včasih izpusti, in zavrnitev bi človeka poslala nazaj v klepet po popravek,
               ki ga lahko naredi tukaj v eni potezi. -->
          @if (parsedOk() && !targetInJson()) {
            <ion-item>
              <ion-select
                label="Kam naj shranim?"
                labelPlacement="stacked"
                [(ngModel)]="chosenTarget"
                interface="popover"
              >
                @for (t of targets(); track t.key) {
                  <ion-select-option [value]="t.key">{{ t.title }}</ion-select-option>
                }
              </ion-select>
            </ion-item>
            <ion-note color="medium">
              V JSON-u ni polja "target", zato ga izberi tukaj.
            </ion-note>
          }

          @if (parseError(); as message) {
            <ion-note color="danger">{{ message }}</ion-note>
          }
          @if (parsedOk() && summary(); as text) {
            <ion-note color="success">{{ text }}</ion-note>
          }

          <ion-button expand="block" [disabled]="!canSubmit() || busy()" (click)="submit()">
            {{ busy() ? 'Shranjujem…' : 'Shrani v CleverDash' }}
          </ion-button>
          <ion-button expand="block" fill="clear" [disabled]="raw.length === 0" (click)="clear()">
            Počisti
          </ion-button>
        </section>

        @if (error(); as message) {
          <ion-note color="danger" class="block">{{ message }}</ion-note>
        }

        @if (results().length > 0) {
          <section>
            <h2 class="cd-section-title">Shranjeno</h2>
            @for (r of results(); track r.id) {
              <ion-item>
                <ion-label>
                  <h3>{{ r.title }}</h3>
                  <p>{{ r.status === 'created' ? 'Dodano' : 'Že obstaja — nič ni nastalo' }}</p>
                  @for (w of r.warnings; track w) {
                    <p class="warn">{{ w }}</p>
                  }
                </ion-label>
                <ion-button fill="clear" [href]="r.url">Odpri</ion-button>
              </ion-item>
            }
          </section>
        }
      </div>
    </ion-content>
  `,
  styles: [
    `
      .page {
        padding: var(--cd-page-padding);
        max-width: 780px;
        margin: 0 auto;
      }
      section {
        margin-bottom: var(--cd-space-4, 1.5rem);
      }
      pre {
        white-space: pre-wrap;
        word-break: break-word;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 0.75rem;
        background: var(--ion-color-light);
        padding: 0.75rem;
        border-radius: 8px;
        max-height: 24rem;
        overflow: auto;
      }
      .block {
        display: block;
        margin: 0.5rem 0;
      }
      .warn {
        color: var(--ion-color-warning-shade);
      }
      ion-textarea {
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 0.8rem;
      }
    `,
  ],
})
export class IngestPage implements OnInit {
  private readonly http = inject(HttpClient);

  readonly targets = signal<IngestTargetView[]>([]);
  readonly prompt = signal<string | null>(null);
  readonly promptCopied = signal(false);
  readonly parseError = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly results = signal<IngestResultView[]>([]);
  readonly busy = signal(false);

  raw = '';
  chosenTarget: string | null = null;

  /** Razčlenjeno telo, pripravljeno za pošiljanje; `null`, dokler JSON ni veljaven. */
  private payload: { target?: string; data: unknown } | null = null;

  async ngOnInit(): Promise<void> {
    await Promise.all([this.loadTargets(), this.loadPrompt()]);
  }

  private async loadTargets(): Promise<void> {
    try {
      this.targets.set(
        await firstValueFrom(
          this.http.get<IngestTargetView[]>(apiUrl('/ingest/targets'), { withCredentials: true }),
        ),
      );
    } catch {
      // Prazen seznam je varno privzeto stanje: izbirnik cilja ostane prazen, JSON s svojim
      // `target` pa deluje tudi brez tega seznama.
    }
  }

  private async loadPrompt(): Promise<void> {
    try {
      const res = await firstValueFrom(
        this.http.get<{ prompt: string }>(apiUrl('/ingest/prompt'), { withCredentials: true }),
      );
      this.prompt.set(res.prompt);
    } catch {
      // Brez navodila je stran še vedno uporabna — lepljenje deluje.
    }
  }

  parsedOk(): boolean {
    return this.payload !== null;
  }

  targetInJson(): boolean {
    return typeof this.payload?.target === 'string';
  }

  canSubmit(): boolean {
    if (!this.payload) return false;
    return this.targetInJson() || this.chosenTarget !== null || this.targets().length === 1;
  }

  /** Kratek povzetek razčlenjenega, da človek PRED pošiljanjem vidi, kaj bo shranil. */
  summary(): string | null {
    if (!this.payload) return null;
    const count = Array.isArray(this.payload.data) ? this.payload.data.length : 1;
    const target = this.payload.target ?? this.chosenTarget ?? this.targets()[0]?.key ?? '?';
    const title = this.targets().find((t) => t.key === target)?.title ?? target;
    return count === 1 ? `1 zapis → ${title}` : `${count} zapisov → ${title}`;
  }

  /**
   * Razčlenjevanje ob vsakem vnosu, da je napaka vidna PREDEN človek pritisne gumb.
   *
   * Ograja ```json se odstrani: ChatGPT jo doda skoraj vedno, in zavrnitev zaradi nje bi bila
   * zavrnitev zaradi oblike izpisa, ne zaradi vsebine — človek pa bi jo moral brisati na roko ob
   * vsakem receptu.
   */
  onInput(): void {
    this.error.set(null);
    const text = this.raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();

    if (text.length === 0) {
      this.payload = null;
      this.parseError.set(null);
      return;
    }

    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch (err) {
      this.payload = null;
      this.parseError.set(
        `To ni veljaven JSON: ${err instanceof Error ? err.message : 'napaka pri branju'}`,
      );
      return;
    }

    if (value === null || typeof value !== 'object') {
      this.payload = null;
      this.parseError.set('Pričakujem objekt ali seznam objektov.');
      return;
    }

    const record = value as Record<string, unknown>;

    // Sprejmemo OBE obliki: ovojnico `{target, data}`, kot jo predpisuje navodilo, in gol zapis
    // brez nje. Agent ovojnico včasih izpusti; zavrnitev bi bila zvestoba obliki na račun človeka,
    // ki ima pravi podatek pred sabo. Cilj takrat izbere spodnji izbirnik.
    if (Array.isArray(value)) {
      this.payload = { data: value };
    } else if ('data' in record) {
      this.payload = {
        target: typeof record.target === 'string' ? record.target : undefined,
        data: record.data,
      };
    } else {
      this.payload = { data: record };
    }

    this.parseError.set(null);
  }

  async copyPrompt(): Promise<void> {
    const text = this.prompt();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      this.promptCopied.set(true);
      setTimeout(() => this.promptCopied.set(false), 2000);
    } catch {
      this.error.set('Samodejno kopiranje ni na voljo — razpri navodilo in kopiraj ročno.');
    }
  }

  async submit(): Promise<void> {
    if (!this.payload || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);

    const target = this.payload.target ?? this.chosenTarget ?? this.targets()[0]?.key;
    const body = target ? { target, data: this.payload.data } : { data: this.payload.data };

    try {
      const res = await firstValueFrom(
        this.http.post<IngestResultView | BatchResultView>(apiUrl('/ingest'), body, {
          withCredentials: true,
        }),
      );
      const list = 'results' in res ? res.results : [res];
      // Izidi se KOPIČIJO in ne prepišejo: uporabnik pogosto prilepi več receptov zapored in
      // mora videti vse povezave, ne samo zadnje.
      this.results.update((prev) => [...list, ...prev]);
      this.clear();
    } catch (err: unknown) {
      // Člen VII: razlog mora biti viden. `detail` je slovenski in brez tehničnih podrobnosti
      // (platform/errors/problem.ts) — pove tudi, katero polje manjka, kar je natanko tisto, kar
      // človek prilepi nazaj v klepet.
      const detail = (err as { error?: { detail?: string } }).error?.detail;
      this.error.set(detail ?? 'Zapisa ni bilo mogoče shraniti. Poskusi znova.');
    } finally {
      this.busy.set(false);
    }
  }

  clear(): void {
    this.raw = '';
    this.payload = null;
    this.parseError.set(null);
    this.chosenTarget = null;
  }
}

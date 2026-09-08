import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { IonButton, IonContent, IonIcon, IonInput, IonNote, IonProgressBar, IonSpinner, IonText } from '@ionic/angular/standalone';
import { FileSharingApi } from '../file-sharing.api.js';
import {
  describeDropCapacity,
  describeExpiry,
  formatBytes,
  type DropInfo,
  type DropReceipt,
  type DropSession,
} from '../file-sharing.model.js';

// ═══════════════════════════════════════════════════════════════════════════════════════════
//  JAVNA STRAN ZA ODDAJO — pot `/u/:token`, BREZ `authGuard` in BREZ `tabGuard`.
//
//  Druga stran v tej aplikaciji, ki jo vidi človek brez računa, in prva, po kateri ta človek
//  NEKAJ NAPIŠE na naš disk. Iz tega sledi vse ostalo:
//
//   - ni glave z menijem in ni spodnje vrstice zavihkov (pošiljatelj nima zavihkov);
//   - ne preusmerja na Keycloak (FR-081) — obiskovalec ni in ne bo uporabnik;
//   - pred vpisom kode NE pokaže oznake predala ne navodila (FR-084) — oznaka pogosto pove
//     vsebino, enako kot ime datoteke pri prevzemu;
//   - dovolilnica živi SAMO v pomnilniku tega zavihka (`session()`), nikoli v `localStorage`
//     in nikoli v piškotku (FR-091). Osvežitev strani pomeni ponoven vpis kode — to je cena,
//     ki je vredna tega, da tuja stran oddaje v imenu obiskovalca ne more sprožiti;
//   - oddaja gre prek XHR z napredkom, ne prek obrazca: 500 MB ne sme v pomnilnik zavihka.
// ═══════════════════════════════════════════════════════════════════════════════════════════
@Component({
  selector: 'app-file-drop-page',
  standalone: true,
  imports: [FormsModule, IonContent, IonButton, IonIcon, IonInput, IonNote, IonProgressBar, IonSpinner, IonText],
  template: `
    <ion-content>
      <div class="page">
        <div class="card">
          <ion-icon name="cloud-upload-outline" class="logo" aria-hidden="true"></ion-icon>
          <h1>Oddaj datoteko</h1>

          @if (loading()) {
            <ion-spinner aria-label="Nalagam"></ion-spinner>
          } @else if (unavailable()) {
            <!-- Neznan, potekel, zaprt in izbrisan predal dajo ENAK odgovor (FR-085): kdor ima
                 naslov, ne sme izvedeti, katera od možnosti drži. -->
            <ion-text color="danger">
              <p>Ta povezava ne velja — ne obstaja, je potekla ali je bila preklicana.</p>
            </ion-text>
            <ion-note>Če misliš, da je to napaka, prosi prejemnika za novo povezavo.</ion-note>
          } @else if (session(); as open) {
            <p class="label">{{ open.label }}</p>
            @if (open.note) {
              <ion-note class="note">{{ open.note }}</ion-note>
            }

            @for (receipt of sent(); track receipt.fileName) {
              <div class="receipt">
                <ion-icon name="checkmark-circle-outline" color="success" aria-hidden="true"></ion-icon>
                <span>{{ receipt.fileName }} · {{ formatBytes(receipt.byteSize) }}</span>
              </div>
            }

            @if (api.progress(); as progress) {
              <div class="progress">
                <ion-note>{{ progress.fileName }}</ion-note>
                <ion-progress-bar [value]="progress.total ? progress.loaded / progress.total : 0"></ion-progress-bar>
                <ion-note>{{ formatBytes(progress.loaded) }} od {{ formatBytes(progress.total) }}</ion-note>
                <ion-button size="small" fill="outline" color="medium" (click)="api.cancelUpload()">
                  Prekliči oddajo
                </ion-button>
              </div>
            } @else if (capacityLeft()) {
              <ion-input
                label="Tvoje ime (neobvezno)"
                labelPlacement="stacked"
                autocomplete="off"
                maxlength="80"
                placeholder="Da prejemnik ve, od kod je"
                [value]="senderName()"
                (ionInput)="senderName.set($any($event).detail.value ?? '')"
              ></ion-input>

              <ion-button expand="block" (click)="picker.click()">
                <ion-icon slot="start" name="cloud-upload-outline" aria-hidden="true"></ion-icon>
                Izberi datoteko
              </ion-button>
              <input #picker type="file" hidden (change)="onPick($event)" />

              <ion-note>{{ describeDropCapacity(open) }} Ena datoteka do {{ formatBytes(open.maxFileBytes) }}.</ion-note>
            } @else {
              <ion-note>Predal je poln. Če moraš oddati še kaj, se dogovori s prejemnikom.</ion-note>
            }

            @if (error(); as message) {
              <ion-text color="danger"><p>{{ message }}</p></ion-text>
            }
          } @else if (info(); as details) {
            <ion-note>
              Ena datoteka do {{ formatBytes(details.maxFileBytes) }} · {{ describeExpiry(details.expiresAt) }}
            </ion-note>

            <form (ngSubmit)="submit()">
              <ion-input
                label="Koda"
                labelPlacement="stacked"
                type="password"
                autocomplete="off"
                inputmode="text"
                placeholder="XXXX-XXXX-XXXX-XXXX"
                [value]="code()"
                (ionInput)="code.set($any($event).detail.value ?? '')"
                [attr.aria-describedby]="error() ? 'koda-napaka' : null"
              ></ion-input>

              @if (error(); as message) {
                <ion-text color="danger"><p id="koda-napaka">{{ message }}</p></ion-text>
              }

              <ion-button expand="block" type="submit" [disabled]="code().length === 0 || checking()">
                @if (checking()) {
                  <ion-spinner aria-label="Preverjam"></ion-spinner>
                } @else {
                  Odkleni
                }
              </ion-button>
            </form>

            <ion-note>
              Povezava sama ne zadošča — brez kode datoteke ni mogoče oddati.
            </ion-note>
          }
        </div>
      </div>
    </ion-content>
  `,
  styles: [
    `
      .page {
        min-height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 1.5rem;
      }
      .card {
        width: 100%;
        max-width: 26rem;
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        text-align: center;
      }
      .logo {
        font-size: 2.5rem;
        color: var(--ion-color-primary);
        align-self: center;
      }
      h1 {
        margin: 0;
        font-size: 1.3rem;
      }
      .label {
        font-weight: 600;
        word-break: break-word;
        margin: 0;
      }
      .note {
        white-space: pre-wrap;
      }
      form,
      .progress {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        text-align: start;
      }
      .receipt {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        text-align: start;
        word-break: break-all;
      }
    `,
  ],
})
export class FileDropPage implements OnInit {
  protected readonly api = inject(FileSharingApi);
  private readonly route = inject(ActivatedRoute);

  protected readonly info = signal<DropInfo | null>(null);
  /** Dovolilnica in kar se z njo odpre. SAMO v pomnilniku — glej glavo datoteke. */
  protected readonly session = signal<DropSession | null>(null);
  protected readonly sent = signal<DropReceipt[]>([]);
  protected readonly loading = signal(true);
  protected readonly checking = signal(false);
  protected readonly unavailable = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly code = signal('');
  protected readonly senderName = signal('');

  protected readonly formatBytes = formatBytes;
  protected readonly describeExpiry = describeExpiry;
  protected readonly describeDropCapacity = describeDropCapacity;

  private token = '';

  async ngOnInit(): Promise<void> {
    this.token = this.route.snapshot.paramMap.get('token') ?? '';
    try {
      this.info.set(await this.api.dropInfo(this.token));
    } catch {
      this.unavailable.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  protected capacityLeft(): boolean {
    const open = this.session();
    return open !== null && open.remainingFiles > 0 && open.remainingBytes > 0;
  }

  protected async submit(): Promise<void> {
    if (this.code().length === 0 || this.checking()) return;
    this.checking.set(true);
    this.error.set(null);
    try {
      this.session.set(await this.api.dropUnlock(this.token, this.code()));
      this.code.set('');
    } catch (err: unknown) {
      this.applyError(err, 'Koda ni pravilna.');
    } finally {
      this.checking.set(false);
    }
  }

  protected async onPick(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    const open = this.session();
    if (!file || !open) return;

    // Očitno preveliko datoteko zavrnemo TU, ne po petih minutah pošiljanja: strežnik jo bo
    // zavrnil enako (FR-088), a pošiljatelj ne sme čakati na to, da izve nekaj, kar je znano
    // takoj.
    if (file.size > open.maxFileBytes) {
      this.error.set(`Ta datoteka je prevelika. Največ ${formatBytes(open.maxFileBytes)}.`);
      return;
    }
    if (file.size === 0) {
      this.error.set('Ta datoteka je prazna.');
      return;
    }

    this.error.set(null);
    try {
      const receipt = await this.api.dropUpload(this.token, open.ticket, file, this.senderName().trim() || null);
      this.sent.update((list) => [...list, receipt]);
      // Preostali prostor pride iz POTRDILA in ne iz lastnega izračuna: pravo stanje ve
      // strežnik, ki je pravkar zapisal datoteko (in med tem je lahko oddajal še kdo drug).
      this.session.set({
        ...open,
        remainingFiles: receipt.remainingFiles,
        remainingBytes: receipt.remainingBytes,
        maxFileBytes: Math.min(open.maxFileBytes, receipt.remainingBytes),
      });
    } catch (err: unknown) {
      // Tiho spodletela oddaja bi pomenila človeka, ki misli, da je datoteko poslal (člen VII).
      this.applyError(err, 'Oddaja ni uspela. Poskusi znova.');
    }
  }

  /**
   * Napaka javne poti v besedilo, ki pošiljatelju kaj pove.
   *
   * 401 med oddajo pomeni POTEKLO DOVOLILNICO (ali zaprt predal), ne "seja je potekla" —
   * pošiljatelj seje nima. Zato se v tem primeru vrnemo na vpis kode; brez tega bi obtičal na
   * zaslonu, ki ne dela več.
   */
  private applyError(err: unknown, fallback: string): void {
    const status = (err as { status?: number } | null)?.status;
    const detail = (err as { error?: { detail?: unknown } } | null)?.error?.detail;
    const message = typeof detail === 'string' ? detail : fallback;

    if (status === 404) {
      this.unavailable.set(true);
      return;
    }
    if (status === 401 && this.session() !== null) {
      this.session.set(null);
      this.error.set(message);
      return;
    }
    this.error.set(message);
  }
}

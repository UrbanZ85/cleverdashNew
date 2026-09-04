import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { IonButton, IonContent, IonIcon, IonInput, IonNote, IonSpinner, IonText } from '@ionic/angular/standalone';
import { FileSharingApi } from '../file-sharing.api.js';
import { formatBytes, describeExpiry, type PublicShareInfo, type UnlockResult } from '../file-sharing.model.js';

// ═══════════════════════════════════════════════════════════════════════════════════════════
//  JAVNA STRAN — pot `/d/:token`, BREZ `authGuard` in BREZ `tabGuard`.
//
//  Prva stran v tej aplikaciji, ki jo vidi človek brez računa. Iz tega sledi vse ostalo:
//
//   - ni glave z menijem in ni spodnje vrstice zavihkov (prejemnik nima zavihkov);
//   - ne preusmerja na Keycloak (FR-020) — obiskovalec ni in ne bo uporabnik;
//   - pred vpisom gesla NE pokaže imena datoteke (FR-022) — ime pogosto pove vsebino;
//   - prenos sproži NAVIGACIJA brskalnika, ne `fetch`: 500 MB mora prevzeti brskalnikov lastni
//     prenašalnik (z napredkom in nadaljevanjem), ne pomnilnik zavihka (research.md §8).
// ═══════════════════════════════════════════════════════════════════════════════════════════
@Component({
  selector: 'app-file-download-page',
  standalone: true,
  imports: [FormsModule, IonContent, IonButton, IonIcon, IonInput, IonNote, IonSpinner, IonText],
  template: `
    <ion-content>
      <div class="page">
        <div class="card">
          <ion-icon name="cloud-upload-outline" class="logo" aria-hidden="true"></ion-icon>
          <h1>Datoteka te čaka</h1>

          @if (loading()) {
            <ion-spinner aria-label="Nalagam"></ion-spinner>
          } @else if (unavailable()) {
            <!-- Neznana, potekla, preklicana in izbrisana povezava dajo ENAK odgovor (FR-023):
                 kdor ima naslov, ne sme izvedeti, katera od možnosti drži. -->
            <ion-text color="danger">
              <p>Ta povezava ne velja — ne obstaja, je potekla ali je bila preklicana.</p>
            </ion-text>
            <ion-note>Če misliš, da je to napaka, prosi pošiljatelja za novo povezavo.</ion-note>
          } @else if (unlocked(); as file) {
            <p class="filename">{{ file.fileName }}</p>
            <ion-note>{{ formatBytes(file.byteSize) }}</ion-note>
            <ion-button expand="block" (click)="download(file)">
              <ion-icon slot="start" name="cloud-upload-outline" aria-hidden="true"></ion-icon>
              Prenesi datoteko
            </ion-button>
            <ion-note>
              Prenos velja omejen čas. Če poteče, vpiši geslo znova.
            </ion-note>
          } @else if (info(); as details) {
            <ion-note>{{ formatBytes(details.byteSize) }} · {{ describeExpiry(details.expiresAt) }}</ion-note>

            <form (ngSubmit)="submit()">
              <ion-input
                label="Geslo"
                labelPlacement="stacked"
                type="password"
                autocomplete="off"
                inputmode="text"
                placeholder="XXXX-XXXX-XXXX-XXXX"
                [value]="password()"
                (ionInput)="password.set($any($event).detail.value ?? '')"
                [attr.aria-describedby]="error() ? 'geslo-napaka' : null"
              ></ion-input>

              @if (error(); as message) {
                <ion-text color="danger"><p id="geslo-napaka">{{ message }}</p></ion-text>
              }

              <ion-button expand="block" type="submit" [disabled]="password().length === 0 || checking()">
                @if (checking()) {
                  <ion-spinner aria-label="Preverjam"></ion-spinner>
                } @else {
                  Odkleni
                }
              </ion-button>
            </form>

            <ion-note>
              Povezava sama ne zadošča — brez gesla datoteke ni mogoče prenesti.
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
      .filename {
        font-weight: 600;
        word-break: break-all;
        margin: 0;
      }
      form {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        text-align: start;
      }
    `,
  ],
})
export class FileDownloadPage implements OnInit {
  private readonly api = inject(FileSharingApi);
  private readonly route = inject(ActivatedRoute);

  protected readonly info = signal<PublicShareInfo | null>(null);
  protected readonly unlocked = signal<UnlockResult | null>(null);
  protected readonly loading = signal(true);
  protected readonly checking = signal(false);
  protected readonly unavailable = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly password = signal('');

  protected readonly formatBytes = formatBytes;
  protected readonly describeExpiry = describeExpiry;

  private token = '';

  async ngOnInit(): Promise<void> {
    this.token = this.route.snapshot.paramMap.get('token') ?? '';
    try {
      this.info.set(await this.api.publicInfo(this.token));
    } catch {
      this.unavailable.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  protected async submit(): Promise<void> {
    if (this.password().length === 0 || this.checking()) return;
    this.checking.set(true);
    this.error.set(null);
    try {
      this.unlocked.set(await this.api.unlock(this.token, this.password()));
      this.password.set('');
    } catch (err: unknown) {
      const status = (err as { status?: number } | null)?.status;
      const detail = (err as { error?: { detail?: unknown } } | null)?.error?.detail;
      if (status === 404) {
        // Povezava je medtem prenehala veljati (potekla, preklicana, izbrisana).
        this.unavailable.set(true);
      } else if (status === 429) {
        this.error.set(
          typeof detail === 'string'
            ? detail
            : 'Preveč napačnih poskusov. Povezava je začasno zaklenjena — poskusi znova pozneje.',
        );
      } else {
        // Sporočilo strežnika vsebuje število preostalih poskusov (FR-030), da zakonit
        // prejemnik ve, koliko časa ima, preden bo zaklenjen.
        this.error.set(typeof detail === 'string' ? detail : 'Geslo ni pravilno.');
      }
    } finally {
      this.checking.set(false);
    }
  }

  /**
   * Prenos sproži NAVIGACIJA, ne `HttpClient`.
   *
   * Prenos prek XHR bi 500 MB sestavil v pomnilniku zavihka in naredil na odjemalcu isto
   * napako, ki jo strežnik odpravlja s pretakanjem. Navigacija preda datoteko brskalnikovemu
   * prenašalniku, ki zna napredek, nadaljevanje in zapis na disk. Dovolilnica potuje s
   * piškotkom, ki ga je postavila odklenitev — zato v naslovu ni ničesar, kar bi bilo skrivnost.
   */
  protected download(file: UnlockResult): void {
    window.location.href = file.downloadUrl;
  }
}

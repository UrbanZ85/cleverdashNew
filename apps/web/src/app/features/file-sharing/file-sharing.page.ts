import { Component, OnInit, inject, signal } from '@angular/core';
import {
  AlertController,
  IonBadge,
  IonButton,
  IonContent,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonProgressBar,
  IonSelect,
  IonSelectOption,
  IonText,
} from '@ionic/angular/standalone';
import { PageHeaderComponent } from '../../shared/layout/page-header.component.js';
import { FileSharingApi } from './file-sharing.api.js';
import { ShareCreatedComponent } from './share-created.component.js';
import {
  EXPIRY_OPTIONS,
  describeExpiry,
  describeQuota,
  describeState,
  formatBytes,
  hasGuessingWarning,
  isShareable,
  quotaRatio,
  type ExpiryChoice,
  type Quota,
  type SharedFile,
  type UploadResult,
} from './file-sharing.model.js';

// Zavihek "Deljenje datotek" (platform/tabs/registry.ts, id `file-sharing`, PRIVZETO IZKLOPLJEN).
//
// Ta stran je za LASTNIKA. Prejemnik je nekje drugje in nima računa: njegova stran je
// `download/file-download.page.ts` na poti `/d/:token`, zunaj `authGuard` in zunaj menija.
@Component({
  selector: 'app-file-sharing-page',
  standalone: true,
  imports: [
    PageHeaderComponent,
    ShareCreatedComponent,
    IonContent,
    IonList,
    IonItem,
    IonLabel,
    IonButton,
    IonIcon,
    IonBadge,
    IonNote,
    IonText,
    IonProgressBar,
    IonSelect,
    IonSelectOption,
  ],
  template: `
    <app-page-header title="Deljenje datotek" [subtitle]="subtitle()"></app-page-header>

    <ion-content>
      <div class="wrap">
        @if (created(); as result) {
          <app-share-created
            [shareUrl]="result.shareUrl"
            [password]="result.password"
            (done)="created.set(null)"
          ></app-share-created>
        } @else {
          <div class="uploader">
            <ion-item lines="none">
              <ion-select
                label="Povezava velja"
                [value]="expiry()"
                (ionChange)="expiry.set($any($event).detail.value)"
                interface="popover"
              >
                @for (option of expiryOptions; track option.label) {
                  <ion-select-option [value]="option.value">{{ option.label }}</ion-select-option>
                }
              </ion-select>
            </ion-item>

            @if (api.progress(); as progress) {
              <div class="progress">
                <ion-label>{{ progress.fileName }}</ion-label>
                <ion-progress-bar [value]="progress.total ? progress.loaded / progress.total : 0"></ion-progress-bar>
                <ion-note>{{ formatBytes(progress.loaded) }} od {{ formatBytes(progress.total) }}</ion-note>
                <ion-button size="small" fill="outline" color="medium" (click)="api.cancelUpload()">
                  Prekliči nalaganje
                </ion-button>
              </div>
            } @else {
              <ion-button expand="block" (click)="picker.click()">
                <ion-icon slot="start" name="cloud-upload-outline" aria-hidden="true"></ion-icon>
                Naloži datoteko
              </ion-button>
              <input #picker type="file" hidden (change)="onPick($event)" />
            }

            @if (quota(); as q) {
              <div class="quota">
                <ion-progress-bar [value]="quotaRatio(q)"></ion-progress-bar>
                <ion-note>Zasedeno {{ describeQuota(q) }}</ion-note>
              </div>
            }
          </div>
        }

        @if (error(); as message) {
          <ion-text color="danger"><p>{{ message }}</p></ion-text>
        }

        @if (loading()) {
          <ion-note>Nalagam seznam …</ion-note>
        } @else if (files().length === 0) {
          <div class="empty">
            <ion-icon name="cloud-upload-outline" aria-hidden="true"></ion-icon>
            <p>Še nič ni naloženega.</p>
            <ion-note>
              Naloži datoteko in dobil boš povezavo ter geslo. Prejemnik ne potrebuje računa —
              potrebuje pa oboje.
            </ion-note>
          </div>
        } @else {
          <ion-list>
            @for (file of files(); track file.id) {
              <ion-item>
                <ion-label>
                  <h2>{{ file.displayName }}</h2>
                  <p>{{ formatBytes(file.byteSize) }} · {{ describeState(file) }} · {{ describeExpiry(file.expiresAt) }}</p>
                  <p>
                    Prenosov: {{ file.downloadCount }}
                    @if (hasGuessingWarning(file)) {
                      · <ion-text color="warning">neuspeli poskusi gesla: {{ file.failedAttempts }}</ion-text>
                      @if (file.lockedUntil) {
                        <ion-text color="danger"> (povezava je zaklenjena)</ion-text>
                      }
                    }
                  </p>
                </ion-label>

                @if (isShareable(file)) {
                  <ion-badge slot="end" color="success">na voljo</ion-badge>
                } @else if (file.state === 'broken') {
                  <ion-badge slot="end" color="danger">pokvarjeno</ion-badge>
                } @else {
                  <ion-badge slot="end" color="medium">{{ describeState(file) }}</ion-badge>
                }
              </ion-item>

              <div class="actions">
                @if (file.shareUrl && isShareable(file)) {
                  <ion-button size="small" fill="clear" (click)="copyLink(file)">Kopiraj povezavo</ion-button>
                  <ion-button size="small" fill="clear" color="warning" (click)="revoke(file)">Prekliči</ion-button>
                }
                @if (file.state !== 'broken') {
                  <ion-button size="small" fill="clear" (click)="newPassword(file)">Novo geslo</ion-button>
                }
                <ion-button size="small" fill="clear" color="danger" (click)="remove(file)">Izbriši</ion-button>
              </div>
            }
          </ion-list>
        }
      </div>
    </ion-content>
  `,
  styles: [
    `
      .wrap {
        padding: 1rem;
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }
      .uploader,
      .progress,
      .quota {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.25rem;
        padding: 0 0.5rem 0.5rem;
      }
      .empty {
        text-align: center;
        padding: 2rem 1rem;
        color: var(--ion-color-medium);
      }
      .empty ion-icon {
        font-size: 3rem;
      }
    `,
  ],
})
export class FileSharingPage implements OnInit {
  protected readonly api = inject(FileSharingApi);
  private readonly alerts = inject(AlertController);

  protected readonly files = signal<SharedFile[]>([]);
  protected readonly quota = signal<Quota | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly created = signal<UploadResult | null>(null);
  /** `undefined` = privzetek namestitve; izbira `null` je BREZ ROKA in ni isto (FR-040). */
  protected readonly expiry = signal<ExpiryChoice | undefined>(7);

  protected readonly expiryOptions = EXPIRY_OPTIONS;
  protected readonly formatBytes = formatBytes;
  protected readonly describeState = describeState;
  protected readonly describeExpiry = describeExpiry;
  protected readonly describeQuota = describeQuota;
  protected readonly quotaRatio = quotaRatio;
  protected readonly isShareable = isShareable;
  protected readonly hasGuessingWarning = hasGuessingWarning;

  ngOnInit(): void {
    void this.reload();
  }

  protected subtitle(): string {
    const count = this.files().length;
    if (count === 0) return 'nič deljenega';
    return count === 1 ? '1 datoteka' : `${count} datotek`;
  }

  private async reload(): Promise<void> {
    this.loading.set(true);
    try {
      const response = await this.api.list();
      this.files.set(response.files);
      this.quota.set(response.quota);
      this.error.set(null);
    } catch {
      this.error.set('Seznama ni bilo mogoče naložiti.');
    } finally {
      this.loading.set(false);
    }
  }

  protected async onPick(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    this.error.set(null);
    try {
      this.created.set(await this.api.upload(file, this.expiry()));
      await this.reload();
    } catch (err: unknown) {
      // Tiho spodletelo nalaganje bi pomenilo uporabnika, ki misli, da datoteko deli
      // (člen VII). Sporočilo strežnika je slovensko in namenjeno njemu.
      this.error.set(problemDetail(err) ?? 'Nalaganje ni uspelo.');
    }
  }

  protected async copyLink(file: SharedFile): Promise<void> {
    if (!file.shareUrl) return;
    try {
      await navigator.clipboard.writeText(file.shareUrl);
    } catch {
      this.error.set('Kopiranje ni uspelo — povezavo označi in kopiraj ročno.');
    }
  }

  protected async revoke(file: SharedFile): Promise<void> {
    const alert = await this.alerts.create({
      header: 'Prekliči povezavo?',
      message: `Povezava do "${file.displayName}" bo takoj nehala delati, tudi za tistega, ki je geslo že vpisal. Datoteka ostane pri tebi.`,
      buttons: [
        { text: 'Ne', role: 'cancel' },
        {
          text: 'Prekliči povezavo',
          role: 'destructive',
          handler: () => {
            void this.api.revoke(file.id).then(() => this.reload());
          },
        },
      ],
    });
    await alert.present();
  }

  protected async newPassword(file: SharedFile): Promise<void> {
    const alert = await this.alerts.create({
      header: 'Izdaj novo geslo?',
      // FR-015: nastane tudi NOV naslov. Uporabnik, ki tega ne bi vedel, bi prejemniku poslal
      // samo geslo in se čudil, zakaj povezava ne dela.
      message:
        'Nastalo bo novo geslo IN nova povezava. Stara povezava bo nehala delati — prejemniku bo treba poslati oboje znova.',
      buttons: [
        { text: 'Ne', role: 'cancel' },
        {
          text: 'Izdaj novo',
          handler: () => {
            void this.api.regeneratePassword(file.id).then(async (result) => {
              this.created.set(result);
              await this.reload();
            });
          },
        },
      ],
    });
    await alert.present();
  }

  protected async remove(file: SharedFile): Promise<void> {
    const alert = await this.alerts.create({
      header: 'Izbriši datoteko?',
      message: `"${file.displayName}" bo odstranjena z diska. Tega ni mogoče razveljaviti.`,
      buttons: [
        { text: 'Ne', role: 'cancel' },
        {
          text: 'Izbriši',
          role: 'destructive',
          handler: () => {
            void this.api
              .remove(file.id)
              .then(() => this.reload())
              .catch((err: unknown) => this.error.set(problemDetail(err) ?? 'Brisanje ni uspelo.'));
          },
        },
      ],
    });
    await alert.present();
  }
}

/** Sporočilo iz `application/problem+json`, ki ga strežnik piše v slovenščini (člen X). */
function problemDetail(err: unknown): string | null {
  const detail = (err as { error?: { detail?: unknown } } | null)?.error?.detail;
  return typeof detail === 'string' ? detail : null;
}

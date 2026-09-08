import { Component, OnInit, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  AlertController,
  IonBadge,
  IonButton,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonSelect,
  IonSelectOption,
  IonText,
  IonTextarea,
} from '@ionic/angular/standalone';
import { FileSharingApi } from '../file-sharing.api.js';
import { ShareCreatedComponent } from '../share-created.component.js';
import {
  EXPIRY_OPTIONS,
  acceptsUploads,
  describeExpiry,
  describeInboxCapacity,
  describeInboxState,
  describeReceivedAt,
  fileCountChoices,
  inboxHasGuessingWarning,
  totalMbChoices,
  type CreatedInbox,
  type ExpiryChoice,
  type FileInbox,
  type InboxLimits,
} from '../file-sharing.model.js';

// Razdelek "Sprejem datotek" na zavihku deljenja (009b) — LASTNIKOVA stran obrnjene smeri.
//
// Zavestno svoja komponenta in ne del `file-sharing.page.ts`: predal in deljena datoteka sta dva
// pojma z dvema življenjskima potekoma, in stran, ki bi imela oboje v enem telesu, bi bila
// tisočvrstična. Komponenta si sama nalaga svoje stanje, ker predali s seznamom datotek niso
// povezani — razen v eno smer, ki jo pove `changed`: ko predal nekaj prejme, se mora osvežiti
// tudi seznam datotek.
@Component({
  selector: 'app-inbox-list',
  standalone: true,
  imports: [
    FormsModule,
    ShareCreatedComponent,
    IonList,
    IonItem,
    IonLabel,
    IonButton,
    IonIcon,
    IonBadge,
    IonNote,
    IonText,
    IonInput,
    IonTextarea,
    IonSelect,
    IonSelectOption,
  ],
  template: `
    <div class="inboxes">
      <div class="head">
        <h2>Sprejem datotek</h2>
        <ion-note>
          Obrnjena smer: pošlješ povezavo in kodo, nekdo drug pa ti po njiju odda datoteko. Računa
          ne potrebuje — potrebuje pa oboje.
        </ion-note>
      </div>

      @if (created(); as result) {
        <app-share-created
          [shareUrl]="result.dropUrl"
          [password]="result.code"
          linkLabel="Povezava za oddajo"
          secretLabel="Koda"
          secretNoun="kodo"
          warning="Koda je prikazana samo enkrat."
          hint="Prejemniku povezave pošlji oboje. Sama povezava ne odpre ničesar — in prav to je namen. Priporočljivo je, da kode ne pošlješ po isti poti kot povezavo."
          (done)="created.set(null)"
        ></app-share-created>
      } @else if (creating()) {
        <div class="form">
          <ion-input
            label="Za kaj je predal"
            labelPlacement="stacked"
            maxlength="80"
            placeholder="Npr. Skenirane pogodbe"
            [value]="label()"
            (ionInput)="label.set($any($event).detail.value ?? '')"
          ></ion-input>

          <ion-textarea
            label="Navodilo pošiljatelju (neobvezno)"
            labelPlacement="stacked"
            [autoGrow]="true"
            maxlength="500"
            placeholder="Npr. Pošlji obe strani."
            [value]="note()"
            (ionInput)="note.set($any($event).detail.value ?? '')"
          ></ion-textarea>

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

          <!-- Meji predala izbere LASTNIK (FR-087). Ponujene so samo vrednosti do stropa
               namestitve, ki ga pošlje strežnik — izbira, ki bi bila zavrnjena, ni izbira. -->
          <ion-item lines="none">
            <ion-select
              label="Največ datotek"
              [value]="maxFiles()"
              (ionChange)="maxFiles.set($any($event).detail.value)"
              interface="popover"
            >
              @for (choice of fileChoices(); track choice) {
                <ion-select-option [value]="choice">{{ choice }}</ion-select-option>
              }
            </ion-select>
          </ion-item>

          <ion-item lines="none">
            <ion-select
              label="Skupaj največ"
              [value]="maxTotalMb()"
              (ionChange)="maxTotalMb.set($any($event).detail.value)"
              interface="popover"
            >
              @for (choice of mbChoices(); track choice) {
                <ion-select-option [value]="choice">{{ choice }} MB</ion-select-option>
              }
            </ion-select>
          </ion-item>

          <div class="row">
            <ion-button expand="block" [disabled]="label().trim().length === 0 || saving()" (click)="create()">
              Ustvari povezavo za oddajo
            </ion-button>
            <ion-button expand="block" fill="clear" color="medium" (click)="creating.set(false)">
              Prekliči
            </ion-button>
          </div>
        </div>
      } @else {
        <ion-button expand="block" fill="outline" (click)="startCreating()">
          <ion-icon slot="start" name="add-outline" aria-hidden="true"></ion-icon>
          Nova povezava za oddajo
        </ion-button>
      }

      @if (error(); as message) {
        <ion-text color="danger"><p>{{ message }}</p></ion-text>
      }

      @if (loading()) {
        <ion-note>Nalagam predale …</ion-note>
      } @else if (inboxes().length > 0) {
        <ion-list>
          @for (inbox of inboxes(); track inbox.id) {
            <ion-item>
              <ion-label>
                <h3>{{ inbox.label }}</h3>
                <p>{{ describeInboxCapacity(inbox) }} · {{ describeExpiry(inbox.expiresAt) }}</p>
                <p>
                  @if (inboxHasGuessingWarning(inbox)) {
                    <ion-text color="warning">neuspeli poskusi kode: {{ inbox.failedAttempts }}</ion-text>
                    @if (inbox.lockedUntil) {
                      <ion-text color="danger"> (predal je zaklenjen)</ion-text>
                    }
                  } @else {
                    {{ describeReceivedAt(inbox.lastReceivedAt) }}
                  }
                </p>
              </ion-label>

              @if (acceptsUploads(inbox)) {
                <ion-badge slot="end" color="success">sprejema</ion-badge>
              } @else {
                <ion-badge slot="end" color="medium">{{ describeInboxState(inbox) }}</ion-badge>
              }
            </ion-item>

            <div class="actions">
              @if (inbox.dropUrl && acceptsUploads(inbox)) {
                <ion-button size="small" fill="clear" (click)="copyLink(inbox)">Kopiraj povezavo</ion-button>
                <ion-button size="small" fill="clear" color="warning" (click)="close(inbox)">Zapri</ion-button>
              }
              <ion-button size="small" fill="clear" (click)="newCode(inbox)">Nova koda</ion-button>
              <ion-button size="small" fill="clear" color="danger" (click)="remove(inbox)">Izbriši</ion-button>
            </div>
          }
        </ion-list>
      }
    </div>
  `,
  styles: [
    `
      .inboxes,
      .form {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }
      .head h2 {
        margin: 0;
        font-size: 1.05rem;
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.25rem;
        padding: 0 0.5rem 0.5rem;
      }
      .row {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      }
    `,
  ],
})
export class InboxListComponent implements OnInit {
  private readonly api = inject(FileSharingApi);
  private readonly alerts = inject(AlertController);

  /** Predal je nekaj prejel ali je izginil: seznam DATOTEK na strani nad nami mora vedeti. */
  readonly changed = output<void>();

  protected readonly inboxes = signal<FileInbox[]>([]);
  protected readonly limits = signal<InboxLimits | null>(null);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly creating = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly created = signal<CreatedInbox | null>(null);

  protected readonly label = signal('');
  protected readonly note = signal('');
  protected readonly expiry = signal<ExpiryChoice | undefined>(7);
  protected readonly maxFiles = signal(1);
  protected readonly maxTotalMb = signal(50);

  protected readonly expiryOptions = EXPIRY_OPTIONS;
  protected readonly describeExpiry = describeExpiry;
  protected readonly describeInboxState = describeInboxState;
  protected readonly describeInboxCapacity = describeInboxCapacity;
  protected readonly describeReceivedAt = describeReceivedAt;
  protected readonly inboxHasGuessingWarning = inboxHasGuessingWarning;
  protected readonly acceptsUploads = acceptsUploads;

  ngOnInit(): void {
    void this.reload();
  }

  protected fileChoices(): number[] {
    const limits = this.limits();
    return limits ? fileCountChoices(limits) : [1];
  }

  protected mbChoices(): number[] {
    const limits = this.limits();
    return limits ? totalMbChoices(limits) : [50];
  }

  private async reload(): Promise<void> {
    this.loading.set(true);
    try {
      const response = await this.api.listInboxes();
      this.inboxes.set(response.inboxes);
      this.limits.set(response.limits);
      this.error.set(null);
    } catch {
      this.error.set('Predalov ni bilo mogoče naložiti.');
    } finally {
      this.loading.set(false);
    }
  }

  protected startCreating(): void {
    // Privzetki se postavijo iz stropov namestitve, ne iz zadnje izbire: predal je pogosto
    // enkraten in "najmanjše, kar zadošča" je varnejši privzetek od "kar je bilo prejšnjič".
    const choices = this.mbChoices();
    this.maxFiles.set(this.fileChoices()[0] ?? 1);
    this.maxTotalMb.set(choices[0] ?? 50);
    this.label.set('');
    this.note.set('');
    this.error.set(null);
    this.creating.set(true);
  }

  protected async create(): Promise<void> {
    if (this.label().trim().length === 0 || this.saving()) return;
    this.saving.set(true);
    try {
      const result = await this.api.createInbox({
        label: this.label().trim(),
        note: this.note().trim(),
        expiresInDays: this.expiry(),
        maxFiles: this.maxFiles(),
        maxTotalMb: this.maxTotalMb(),
      });
      this.created.set(result);
      this.creating.set(false);
      await this.reload();
    } catch (err: unknown) {
      this.error.set(problemDetail(err) ?? 'Predala ni bilo mogoče ustvariti.');
    } finally {
      this.saving.set(false);
    }
  }

  protected async copyLink(inbox: FileInbox): Promise<void> {
    if (!inbox.dropUrl) return;
    try {
      await navigator.clipboard.writeText(inbox.dropUrl);
    } catch {
      this.error.set('Kopiranje ni uspelo — povezavo označi in kopiraj ročno.');
    }
  }

  protected async close(inbox: FileInbox): Promise<void> {
    const alert = await this.alerts.create({
      header: 'Zapri predal?',
      message: `Po povezavi "${inbox.label}" ne bo več mogoče oddajati — tudi tistemu, ki je kodo že vpisal. Kar je bilo oddano, ostane pri tebi.`,
      buttons: [
        { text: 'Ne', role: 'cancel' },
        {
          text: 'Zapri predal',
          role: 'destructive',
          handler: () => {
            void this.api
              .closeInbox(inbox.id)
              .then(() => this.reload())
              .catch((err: unknown) => this.error.set(problemDetail(err) ?? 'Zaprtje ni uspelo.'));
          },
        },
      ],
    });
    await alert.present();
  }

  protected async newCode(inbox: FileInbox): Promise<void> {
    const alert = await this.alerts.create({
      header: 'Izdaj novo kodo?',
      // FR-083: nastane tudi NOV naslov. Uporabnik, ki tega ne bi vedel, bi pošiljatelju poslal
      // samo kodo in se čudil, zakaj povezava ne dela.
      message:
        'Nastala bo nova koda IN nova povezava. Stara povezava bo nehala delati — pošiljatelju bo treba poslati oboje znova.',
      buttons: [
        { text: 'Ne', role: 'cancel' },
        {
          text: 'Izdaj novo',
          handler: () => {
            void this.api
              .regenerateInboxCode(inbox.id)
              .then(async (result) => {
                this.created.set(result);
                await this.reload();
              })
              .catch((err: unknown) => this.error.set(problemDetail(err) ?? 'Nove kode ni bilo mogoče izdati.'));
          },
        },
      ],
    });
    await alert.present();
  }

  protected async remove(inbox: FileInbox): Promise<void> {
    const alert = await this.alerts.create({
      header: 'Izbriši predal?',
      // FR-094: prejete datoteke OSTANEJO. Brez tega stavka bi uporabnik razumljivo mislil, da
      // z predalom izgubi tudi to, kar je po njem prejel.
      message: `Povezava "${inbox.label}" bo prenehala delati. Datoteke, ki si jih po njej prejel, OSTANEJO na tvojem seznamu.`,
      buttons: [
        { text: 'Ne', role: 'cancel' },
        {
          text: 'Izbriši',
          role: 'destructive',
          handler: () => {
            void this.api
              .removeInbox(inbox.id)
              .then(async () => {
                await this.reload();
                this.changed.emit();
              })
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

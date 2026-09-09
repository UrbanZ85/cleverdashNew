import { Component, EventEmitter, Output, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import {
  AlertController,
  IonButton,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonText,
} from '@ionic/angular/standalone';
import { SavedLinksStore } from '../../core/saved-links/saved-links.store.js';
import type { SavedLinkGroup } from '../../core/saved-links/saved-link.model.js';

// US3: mape so uporabnikova razvrstitev, ena raven, brez gnezdenja (FR-023).
//
// Potrditev brisanja MORA povedati, koliko zapisov bo postalo nerazvrščenih (FR-022) — brez
// tega bi bilo videti, kot da se z mapo izbrišejo tudi zapisi, in uporabnik bi mapo raje
// pustil. Zato `linkCount` prihaja že v seznamu map.
//
// Vrstni red map se ureja s puščicama in ne s potegom: enak vzorec kot pri kamerah
// (features/cameras/manage/camera-manage.page.ts), map pa je malo in poteg bi se tu prepletal
// s potegom zapisov na istem zaslonu.
@Component({
  selector: 'app-group-editor',
  standalone: true,
  imports: [FormsModule, IonList, IonItem, IonInput, IonButton, IonIcon, IonLabel, IonNote, IonText],
  template: `
    <div class="groups">
      <div class="head">
        <h2>Mape</h2>
        <ion-button fill="clear" size="small" (click)="closed.emit()">Zapri</ion-button>
      </div>

      <ion-item>
        <ion-input
          label="Nova mapa"
          labelPlacement="stacked"
          placeholder="npr. Delo, Recepti, Za prebrati"
          [(ngModel)]="newName"
          (keyup.enter)="create()"
        ></ion-input>
        <ion-button slot="end" [disabled]="busy()" (click)="create()">
          <ion-icon slot="icon-only" name="add-outline" aria-label="Dodaj mapo"></ion-icon>
        </ion-button>
      </ion-item>

      @if (error(); as message) {
        <ion-text color="danger"><p class="msg">{{ message }}</p></ion-text>
      }
      @if (notice(); as message) {
        <ion-text color="success"><p class="msg">{{ message }}</p></ion-text>
      }

      @if (store.groups().length === 0) {
        <ion-note class="msg">Map še ni. Zapisi so med nerazvrščenimi, kar je veljavno stanje.</ion-note>
      } @else {
        <ion-list>
          @for (group of store.groups(); track group.id; let i = $index) {
            <ion-item>
              <ion-icon slot="start" name="folder-outline" aria-hidden="true"></ion-icon>
              <ion-input
                [value]="group.name"
                [attr.aria-label]="'Ime mape ' + group.name"
                (ionBlur)="rename(group, $any($event).target.value)"
              ></ion-input>
              <ion-note slot="end">{{ group.linkCount }}</ion-note>
              <ion-button
                slot="end"
                fill="clear"
                size="small"
                [disabled]="i === 0 || busy()"
                (click)="move(i, i - 1)"
                [attr.aria-label]="'Premakni ' + group.name + ' gor'"
              >
                <ion-icon slot="icon-only" name="arrow-up-outline"></ion-icon>
              </ion-button>
              <ion-button
                slot="end"
                fill="clear"
                size="small"
                [disabled]="i === store.groups().length - 1 || busy()"
                (click)="move(i, i + 1)"
                [attr.aria-label]="'Premakni ' + group.name + ' dol'"
              >
                <ion-icon slot="icon-only" name="arrow-down-outline"></ion-icon>
              </ion-button>
              <ion-button
                slot="end"
                fill="clear"
                size="small"
                color="danger"
                [disabled]="busy()"
                (click)="confirmDelete(group)"
                [attr.aria-label]="'Izbriši mapo ' + group.name"
              >
                <ion-icon slot="icon-only" name="trash-outline"></ion-icon>
              </ion-button>
            </ion-item>
          }
        </ion-list>
      }
    </div>
  `,
  styles: `
    .groups {
      border: 1px solid var(--cd-divider);
      border-radius: var(--cd-radius-lg);
      padding: var(--cd-space-3);
      margin-bottom: var(--cd-space-3);
      background: var(--cd-surface);
    }
    .head {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .head h2 {
      margin: 0;
      font-size: 1rem;
    }
    .msg {
      display: block;
      margin: var(--cd-space-2) 0 0;
      font-size: var(--cd-font-size-sm);
    }
  `,
})
export class GroupEditorComponent {
  protected readonly store = inject(SavedLinksStore);
  private readonly alertController = inject(AlertController);

  @Output() readonly closed = new EventEmitter<void>();

  protected newName = '';
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly notice = signal<string | null>(null);

  protected async create(): Promise<void> {
    const name = this.newName.trim();
    if (name.length === 0) return;
    await this.run(async () => {
      await this.store.createGroup(name);
      this.newName = '';
    });
  }

  /** Preimenovanje ob izgubi fokusa. Nespremenjeno ime ne pošlje zahteve — sicer bi vsak klik
   * mimo polja pomenil `PATCH`, ki bi lahko trčil v edinstvenost imena samega s seboj. */
  protected async rename(group: SavedLinkGroup, value: string): Promise<void> {
    const name = (value ?? '').trim();
    if (name.length === 0 || name === group.name) return;
    await this.run(() => this.store.patchGroup(group.id, { name }));
  }

  protected async move(from: number, to: number): Promise<void> {
    const ids = this.store.groups().map((g) => g.id);
    const [moved] = ids.splice(from, 1);
    if (!moved) return;
    ids.splice(to, 0, moved);
    await this.run(() => this.store.reorderGroups(ids));
  }

  protected async confirmDelete(group: SavedLinkGroup): Promise<void> {
    // Sporočilo pove, kaj se bo ZGODILO z zapisi, in ne le da bo mapa izbrisana (FR-022).
    const message =
      group.linkCount === 0
        ? `Mapa “${group.name}” je prazna in bo izbrisana.`
        : `Mapa “${group.name}” bo izbrisana. ${group.linkCount} ${
            group.linkCount === 1 ? 'zapis' : group.linkCount === 2 ? 'zapisa' : 'zapisov'
          } bo postalo nerazvrščenih — noben zapis se ne izgubi.`;

    const alert = await this.alertController.create({
      header: 'Izbriši mapo',
      message,
      buttons: [
        { text: 'Prekliči', role: 'cancel' },
        { text: 'Izbriši', role: 'destructive', handler: () => void this.remove(group) },
      ],
    });
    await alert.present();
  }

  private async remove(group: SavedLinkGroup): Promise<void> {
    await this.run(async () => {
      const { movedLinks } = await this.store.removeGroup(group.id);
      this.notice.set(
        movedLinks === 0
          ? `Mapa “${group.name}” je izbrisana.`
          : `Mapa “${group.name}” je izbrisana; ${movedLinks} ${
              movedLinks === 1 ? 'zapis je' : 'zapisov je'
            } zdaj med nerazvrščenimi.`,
      );
    });
  }

  /** Skupno ovojno telo: zastavica zasedenosti in sporočilo strežnika ob napaki. Podvojeno
   * `try/finally` v petih metodah bi bilo isto besedilo petkrat. */
  private async run(action: () => Promise<unknown>): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      await action();
    } catch (err) {
      // `detail` strežnika pove pravi razlog ("Mapa s tem imenom že obstaja") — splošno
      // besedilo bi ta podatek vrglo stran (člen VII).
      const detail =
        err instanceof HttpErrorResponse ? (err.error as { detail?: string } | null)?.detail : null;
      this.error.set(typeof detail === 'string' && detail.length > 0 ? detail : 'Mape ni bilo mogoče shraniti.');
    } finally {
      this.busy.set(false);
    }
  }
}

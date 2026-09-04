import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { IonItem, IonInput, IonButton, IonNote, IonBadge, IonText, IonIcon } from '@ionic/angular/standalone';
import { apiUrl } from '../../core/api/api-base.js';
import { TimeTrackingSetupService } from './time-tracking-setup.service.js';

interface RemoteSessionView {
  id: string;
  name: string;
  cookieName: string;
  cookieValueMasked: string;
  cookieDomain: string;
  cookieSize: number;
  expiresAt: string | null;
  daysUntilExpiry: number | null;
  status: 'active' | 'expiring' | 'expired' | 'unknown';
  lastVerifiedAt: string | null;
  lastVerifyError: string | null;
}

interface SessionDraft {
  name: string;
  cookieName: string;
  cookieValue: string;
  cookieDomain: string;
  expiresAt: string;
}

const STATUS_LABEL: Record<RemoteSessionView['status'], string> = {
  active: 'deluje',
  expiring: 'se izteka',
  expired: 'potekla',
  unknown: 'nepreverjena',
};

const STATUS_COLOR: Record<RemoteSessionView['status'], string> = {
  active: 'success',
  expiring: 'warning',
  expired: 'danger',
  unknown: 'medium',
};

// 002, FR-091: sejni piškotek delodajalca se ureja tukaj, brez ponovnega zagona sistema —
// glej quickstart.md §6, korak 1. Živi v features/settings/ (ne v features/time-tracking/),
// enak vzorec kot obstoječi app-location za vremensko lokacijo (001) — Nastavitve so
// skupni gostitelj, moduli prispevajo svoj razdelek.
//
// Doslej je bilo tu eno samo polje (nova vrednost piškotka) za lokacije, ki v bazi ŽE
// obstajajo. To ni zadoščalo: staro okolje je imelo štiri obvezne spremenljivke
// (`cookie_property_name`, `_value`, `_domain`, `_expires` — docs/env-reference.md §1) in
// brez imena ter domene brskalnik piškotka sploh ne pošlje, stran delodajalca pa vrne
// prijavno masko brez gumbov. Ob prvem zagonu je baza poleg tega prazna, zato je tu tudi
// USTVARJANJE seje — brez njega ni lokacije in Nastavitve so slepa ulica.
@Component({
  selector: 'app-time-tracking-settings',
  standalone: true,
  imports: [IonItem, IonInput, IonButton, IonNote, IonBadge, IonText, IonIcon, FormsModule],
  template: `
    @if (sessions().length === 0) {
      <p class="cd-section-hint">
        Seje še ni. Piškotek prekopiraj iz brskalnika, kjer si prijavljen na delodajalčevo
        stran (razhroščevalnik → Application → Cookies).
      </p>
    }

    @for (session of sessions(); track session.id) {
      <div class="session">
        <!-- Vpisana seja je pet polj, ki jih po vpisu skoraj nikoli več ne odpreš — razprta
             so potiskala razdelek Lokacije pod rob zaslona, kjer ga ni bilo videti. Zato
             zložena, s stanjem in domeno v glavi: to je edino, kar je treba videti od daleč. -->
        <button type="button" class="head" (click)="toggle(session.id)" [attr.aria-expanded]="isOpen(session.id)">
          <ion-icon [name]="isOpen(session.id) ? 'chevron-down-outline' : 'chevron-forward-outline'" aria-hidden="true"></ion-icon>
          <strong>{{ session.name }}</strong>
          <span class="sub">{{ session.cookieName }} · {{ session.cookieDomain }}</span>
          <ion-badge [color]="statusColor(session.status)">{{ statusLabel(session.status) }}</ion-badge>
        </button>

        @if (isOpen(session.id)) {
        <ion-item>
          <ion-input label="Ime seje" labelPlacement="stacked" [(ngModel)]="drafts[session.id]!.name"></ion-input>
        </ion-item>
        <ion-note class="facts">{{ nameHint }}</ion-note>
        <ion-item>
          <ion-input
            label="Ime piškotka"
            labelPlacement="stacked"
            placeholder="ItcClientID"
            [(ngModel)]="drafts[session.id]!.cookieName"
          ></ion-input>
        </ion-item>
        <ion-item>
          <ion-input
            label="Nova vrednost piškotka"
            labelPlacement="stacked"
            type="password"
            autocomplete="off"
            [placeholder]="'Trenutna: ' + session.cookieValueMasked + ' — pusti prazno, če se ne spremeni'"
            [(ngModel)]="drafts[session.id]!.cookieValue"
          ></ion-input>
        </ion-item>
        <ion-item>
          <ion-input
            label="Domena"
            labelPlacement="stacked"
            placeholder="e-racuni.com"
            [(ngModel)]="drafts[session.id]!.cookieDomain"
          ></ion-input>
        </ion-item>
        <ion-item>
          <ion-input
            label="Velja do"
            labelPlacement="stacked"
            type="datetime-local"
            [(ngModel)]="drafts[session.id]!.expiresAt"
          ></ion-input>
        </ion-item>

        <ion-note class="facts">
          Velikost piškotka: {{ session.cookieSize }} B (ime + vrednost, izpeljano — kot stolpec
          “Size” v razhroščevalniku).
          @if (session.daysUntilExpiry !== null) {
            · Poteče čez {{ session.daysUntilExpiry }} dni.
          } @else {
            · Rok veljavnosti ni vpisan — sistem ne more opozoriti pred potekom.
          }
          @if (session.lastVerifiedAt) {
            · Nazadnje preverjeno {{ formatMoment(session.lastVerifiedAt) }}.
          }
        </ion-note>
        @if (session.lastVerifyError) {
          <ion-note color="danger" class="facts">Zadnja napaka: {{ session.lastVerifyError }}</ion-note>
        }

        <div class="actions">
          <ion-button size="small" (click)="save(session)">Shrani in preizkusi</ion-button>
          <ion-button size="small" fill="outline" color="danger" (click)="remove(session)">Izbriši</ion-button>
        </div>

        @if (results()[session.id]; as result) {
          <ion-text [color]="result.ok ? 'success' : 'danger'">
            <p>{{ result.message }}</p>
          </ion-text>
        }
        }
      </div>
    }

    <!-- Obrazec za novo sejo je razprt samo, dokler seje ni: takrat je edino, kar je treba
         narediti. Ko seja obstaja, je zložen za gumbom — sicer je pod njim šest polj, ki
         niso na vrsti, razdelek Lokacije pa še niže. -->
    @if (sessions().length > 0 && !addingSession()) {
      <div class="session new">
        <ion-button size="small" fill="outline" (click)="addingSession.set(true)">Dodaj še eno sejo</ion-button>
      </div>
    } @else {
    <div class="session new">
      <div class="head static"><strong>Nova seja</strong></div>
      <ion-item>
        <ion-input label="Ime seje" labelPlacement="stacked" placeholder="Agenda — e-računi" [(ngModel)]="newSession.name"></ion-input>
      </ion-item>
      <ion-note class="facts">{{ nameHint }}</ion-note>
      <ion-item>
        <ion-input label="Ime piškotka" labelPlacement="stacked" [(ngModel)]="newSession.cookieName"></ion-input>
      </ion-item>
      <ion-item>
        <ion-input
          label="Vrednost piškotka"
          labelPlacement="stacked"
          type="password"
          autocomplete="off"
          [(ngModel)]="newSession.cookieValue"
        ></ion-input>
      </ion-item>
      <ion-item>
        <ion-input label="Domena" labelPlacement="stacked" [(ngModel)]="newSession.cookieDomain"></ion-input>
      </ion-item>
      <ion-item>
        <ion-input label="Velja do (neobvezno)" labelPlacement="stacked" type="datetime-local" [(ngModel)]="newSession.expiresAt"></ion-input>
      </ion-item>
      <div class="actions">
        <ion-button size="small" (click)="create()">Dodaj sejo</ion-button>
      </div>
      @if (createError()) {
        <ion-text color="danger"><p>{{ createError() }}</p></ion-text>
      }
    </div>
    }
  `,
  styles: `
    .session {
      padding: var(--cd-space-3) 0;
      border-top: 1px solid var(--cd-divider);
    }
    .session:first-of-type {
      border-top: 0;
    }
    .head {
      display: flex;
      align-items: center;
      gap: var(--cd-space-2);
      margin-bottom: var(--cd-space-2);
      width: 100%;
      padding: 0;
      background: none;
      border: 0;
      color: inherit;
      font: inherit;
      text-align: left;
      cursor: pointer;
    }
    .head.static {
      cursor: default;
    }
    /* Značka stanja gre skrajno desno, ime in podnapis pa se stisneta — dolga domena ne sme
       potisniti stanja iz vidnega polja. */
    .head ion-badge {
      margin-left: auto;
      flex: none;
    }
    .head .sub {
      font-size: 0.8rem;
      opacity: 0.65;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .facts {
      display: block;
      padding: var(--cd-space-2) 0;
      font-size: 0.8rem;
    }
    .actions {
      display: flex;
      gap: var(--cd-space-2);
      margin-top: var(--cd-space-2);
    }
  `,
})
export class TimeTrackingSettingsComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly setup = inject(TimeTrackingSetupService);

  readonly sessions = signal<RemoteSessionView[]>([]);
  readonly results = signal<Record<string, { ok: boolean; message: string }>>({});
  readonly createError = signal<string | null>(null);
  readonly drafts: Record<string, SessionDraft> = {};
  /** Katere vpisane seje so razprte. Prazno = vse zložene; ob prvem zagonu ni kaj skrivati,
   * ker sej sploh ni. */
  readonly openIds = signal<ReadonlySet<string>>(new Set());
  readonly addingSession = signal(false);

  // Zakaj namig obstaja: naslov strani (`https://…/Clockin-…`) je bil ob prvem nastavljanju
  // prilepljen SEM, ker je "ime seje" edino besedilno polje pred njim in ni povedalo, da je
  // le oznaka. Posledica ni bila samo neuporabna nastavitev — ime seje se v nasprotju z
  // vrednostjo piškotka (FR-092) NE maskira in gre nezaščiteno na `/api/v1/health`, ki je
  // namenoma brez avtentikacije (api: platform/health/router.ts, main.ts). Naslov s
  // sejnima žetonoma `ASsid`/`AStk` v imenu je torej razkritje, ne le nered.
  protected readonly nameHint =
    'Samo oznaka za tvoje oči, na primer „Agenda — e-računi“. Naslov strani NE spada sem — ' +
    'ta gre pri lokaciji v polje „Naslov strani“. Ime seje ni skrito in se izpiše v /health.';

  // Privzetki iz starega okolja (docs/env-reference.md §1) — edini vrednosti, ki sta bili
  // kdaj v uporabi. Vpisljivi ostaneta, ker sta last strani delodajalca, ne naša odločitev.
  newSession: SessionDraft = {
    name: '',
    cookieName: 'ItcClientID',
    cookieValue: '',
    cookieDomain: 'e-racuni.com',
    expiresAt: '',
  };

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  isOpen(id: string): boolean {
    return this.openIds().has(id);
  }

  toggle(id: string): void {
    this.openIds.update((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  statusLabel(status: RemoteSessionView['status']): string {
    return STATUS_LABEL[status];
  }

  statusColor(status: RemoteSessionView['status']): string {
    return STATUS_COLOR[status];
  }

  /** `sl-SI`, ne Angularjev `DatePipe` — enak dogovor kot v weather-tile.component.ts. */
  formatMoment(iso: string | null): string {
    if (!iso) return '';
    return new Date(iso).toLocaleString('sl-SI', { dateStyle: 'short', timeStyle: 'short' });
  }

  /** Po vsaki spremembi seje: svoj seznam IN skupno stanje nastavitve, da kontrolni seznam
   * na vrhu zavihka ne obvisi na zastareli sliki. Ob prvem izrisu to ni potrebno — stanje
   * naloži `app-time-tracking-status` sam. */
  private async reloadAll(): Promise<void> {
    await Promise.all([this.reload(), this.setup.reload()]);
  }

  private async reload(): Promise<void> {
    try {
      const sessions = await firstValueFrom(
        this.http.get<RemoteSessionView[]>(apiUrl('/time-tracking/sessions'), { withCredentials: true }),
      );
      this.sessions.set(sessions);
      for (const session of sessions) {
        this.drafts[session.id] = {
          name: session.name,
          cookieName: session.cookieName,
          // Vrednost se nikoli ne prenese nazaj (FR-092), zato je polje vedno prazno —
          // prazno pomeni "ne spreminjaj", ne "izbriši".
          cookieValue: '',
          cookieDomain: session.cookieDomain,
          expiresAt: toLocalInput(session.expiresAt),
        };
      }
    } catch {
      // FR-026 duh — prazen seznam je varno privzeto stanje.
    }
  }

  async save(session: RemoteSessionView): Promise<void> {
    const draft = this.drafts[session.id];
    if (!draft) return;

    // Samo spremenjena polja — delni popravek. Prazna vrednost piškotka ni sprememba.
    const patch: Record<string, string | null> = {};
    if (draft.name && draft.name !== session.name) patch['name'] = draft.name;
    if (draft.cookieName && draft.cookieName !== session.cookieName) patch['cookieName'] = draft.cookieName;
    if (draft.cookieValue) patch['cookieValue'] = draft.cookieValue;
    if (draft.cookieDomain && draft.cookieDomain !== session.cookieDomain) patch['cookieDomain'] = draft.cookieDomain;
    const expiresAt = toLocalInput(session.expiresAt);
    if (draft.expiresAt !== expiresAt) patch['expiresAt'] = draft.expiresAt === '' ? null : draft.expiresAt;

    if (Object.keys(patch).length === 0) {
      this.setResult(session.id, false, 'Ni sprememb za shranjevanje.');
      return;
    }

    if (looksLikeUrl(draft.name)) {
      this.setResult(session.id, false, URL_IN_NAME_ERROR);
      return;
    }

    try {
      const res = await firstValueFrom(
        this.http.put<{ verified: boolean; availableActions: string[] }>(
          apiUrl(`/time-tracking/sessions/${session.id}`),
          patch,
          { withCredentials: true },
        ),
      );
      this.setResult(
        session.id,
        res.verified,
        res.verified
          ? `Shranjeno. Seja deluje — prebrani gumbi: ${res.availableActions.join(', ')}.`
          : 'Shranjeno, a preizkusno branje ni uspelo. Preveri vrednost, ime piškotka in domeno — podrobnosti so v Diagnostiki.',
      );
      await this.reloadAll();
    } catch {
      this.setResult(session.id, false, 'Shranjevanje ni uspelo.');
    }
  }

  async remove(session: RemoteSessionView): Promise<void> {
    try {
      await firstValueFrom(this.http.delete(apiUrl(`/time-tracking/sessions/${session.id}`), { withCredentials: true }));
      await this.reloadAll();
    } catch {
      // 409: sejo uporablja lokacija — sporočilo pride iz zahteve, ne ugibamo ga tu.
      this.setResult(session.id, false, 'Brisanje ni uspelo — sejo najbrž uporablja kaka lokacija.');
    }
  }

  async create(): Promise<void> {
    this.createError.set(null);
    if (!this.newSession.name || !this.newSession.cookieValue || !this.newSession.cookieDomain) {
      this.createError.set('Ime seje, vrednost piškotka in domena so obvezni.');
      return;
    }
    if (looksLikeUrl(this.newSession.name)) {
      this.createError.set(URL_IN_NAME_ERROR);
      return;
    }
    try {
      await firstValueFrom(
        this.http.post(
          apiUrl('/time-tracking/sessions'),
          {
            name: this.newSession.name,
            cookieName: this.newSession.cookieName || 'ItcClientID',
            cookieValue: this.newSession.cookieValue,
            cookieDomain: this.newSession.cookieDomain,
            expiresAt: this.newSession.expiresAt === '' ? null : this.newSession.expiresAt,
          },
          { withCredentials: true },
        ),
      );
      this.newSession = { name: '', cookieName: 'ItcClientID', cookieValue: '', cookieDomain: 'e-racuni.com', expiresAt: '' };
      this.addingSession.set(false);
      await this.reloadAll();
    } catch {
      this.createError.set('Seje ni bilo mogoče dodati.');
    }
  }

  private setResult(id: string, ok: boolean, message: string): void {
    this.results.update((prev) => ({ ...prev, [id]: { ok, message } }));
  }
}

const URL_IN_NAME_ERROR =
  'Ime seje ni naslov strani. Vpiši oznako (npr. „Agenda — e-računi“), naslov pa pri lokaciji ' +
  'v polje „Naslov strani“ — tam ga sistem tudi pričakuje. Ime seje se ne maskira in bi žetona ' +
  'iz naslova izpisalo v /health.';

/** Namenoma ohlapno: dovolj je, da je videti kot naslov. Namen ni preverjanje pravilnosti
 * imena, ampak ujeti eno konkretno zamenjavo polj, preden se shrani. */
function looksLikeUrl(name: string): boolean {
  return /^\s*(https?:\/\/|www\.)/i.test(name) || /\/\/|\?[^\s]*=/.test(name);
}

/** ISO čas → oblika, ki jo sprejme `<input type="datetime-local">` (`YYYY-MM-DDTHH:mm`, brez
 * cone). Brskalnik prikaže lokalni čas, strežnik teče v `TZ=Europe/Ljubljana` — isti pas kot
 * uporabnik, zato pretvorba brez cone ne premakne ure. */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

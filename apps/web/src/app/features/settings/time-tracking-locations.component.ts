import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import {
  IonItem,
  IonInput,
  IonButton,
  IonNote,
  IonText,
  IonSelect,
  IonSelectOption,
  IonToggle,
  IonIcon,
  IonBadge,
} from '@ionic/angular/standalone';
import { apiUrl } from '../../core/api/api-base.js';
import { TimeTrackingSetupService } from './time-tracking-setup.service.js';

// Gumbi za začetek dela, kot jih ponuja delodajalčeva stran. Ista četverica je na strežniku
// v `apps/api/src/domain/clock-state.ts` (`START_ACTIONS`) — tam je merodajna, tu je zato, da
// je izbira spustni seznam in ne prosto besedilo: napačno prepisano ime gumba na strani ne
// obstaja in akcija bi obvisela kot zamujena.
const START_ACTIONS = ['Prijava na delo', 'Prihod na delo', 'Delo od doma', 'Delo na terenu'] as const;
type StartAction = (typeof START_ACTIONS)[number];

interface TrackingLocationView {
  id: string;
  name: string;
  url: string;
  sessionId: string;
  startAction: StartAction;
  /** Neobvezen: lokacija, ki lege ne pošilja, koordinat ne potrebuje (FR-094). */
  coordinateTemplate?: { latitude: string; longitude: string };
  sendGeolocation: boolean;
  jitterMeters: number;
  active: boolean;
}

interface SessionOption {
  id: string;
  name: string;
}

interface LocationDraft {
  name: string;
  url: string;
  sessionId: string;
  startAction: StartAction;
  latitude: string;
  longitude: string;
  sendGeolocation: boolean;
  jitterMeters: number;
  active: boolean;
}

/** RFC 9457 `detail` iz odgovora strežnika (platform/errors/problem.ts), če ga je poslal. */
function problemDetail(err: unknown): string | null {
  const problem: unknown = err instanceof HttpErrorResponse ? err.error : null;
  return problem && typeof problem === 'object' && typeof (problem as { detail?: unknown }).detail === 'string'
    ? (problem as { detail: string }).detail
    : null;
}

function emptyDraft(sessionId = ''): LocationDraft {
  return {
    name: '',
    url: '',
    sessionId,
    startAction: 'Prijava na delo',
    latitude: '',
    longitude: '',
    sendGeolocation: true,
    jitterMeters: 10,
    active: true,
  };
}

// 002, FR-090: lokacije beleženja časa. Vsaka ima SVOJ par koordinat — doma, služba, terén —
// ker se prijava zgodi z geolokacijo brskalnika in ta mora ustrezati kraju, kjer delo
// dejansko poteka. Staro okolje je imelo natanko dva para (`latitudeAgendaLJ`/`longitudeAgendaLJ`
// in `latitudeDoma`/`longitudeDoma`) kot spremenljivki okolja, torej fiksno število, ki ga
// ni bilo mogoče razširiti brez ponovnega zagona; tu jih je poljubno mnogo.
//
// Te koordinate niso vremenska lokacija iz razdelka "Viri podatkov" (001) — nikjer drugje v
// aplikaciji se ne uporabljajo in se z njo ne delijo.
//
// Naslov (`url`) je bil v starem sistemu `eracuni_url`, prav tako spremenljivka okolja. Ker
// vsebuje žeton v poti (`Clockin-…`) in se ta menja, je nastavljiv tukaj.
@Component({
  selector: 'app-time-tracking-locations',
  standalone: true,
  imports: [
    IonItem,
    IonInput,
    IonButton,
    IonNote,
    IonText,
    IonSelect,
    IonSelectOption,
    IonToggle,
    IonIcon,
    IonBadge,
    FormsModule,
  ],
  template: `
    @if (sessions().length === 0) {
      <p class="cd-section-hint">
        Najprej dodaj sejni piškotek v razdelku zgoraj — lokacija brez seje ne more prebrati
        delodajalčeve strani.
      </p>
    } @else {
      @if (locations().length === 0) {
        <p class="cd-section-hint">
          Lokacije še ni. Dodaj po eno za vsak kraj, s katerega se beleži — na primer
          “Služba”, “Doma” in “Terén”. Vsaka ima svoj gumb za začetek dela in svoj par
          koordinat, če se lokacija sploh pošilja.
        </p>
      }

      @for (location of locations(); track location.id) {
        <div class="location">
          <!-- Zložena kartica: osem polj na lokacijo je ob treh krajih (služba, doma, teren)
               več kot cel zaslon, iz česar ni bilo mogoče razbrati niti tega, koliko lokacij
               sploh obstaja. V glavi ostane, kar se prebere na pogled — ime, gumb za začetek
               dela in ali se lokacija pošilja. -->
          <button type="button" class="head" (click)="toggle(location.id)" [attr.aria-expanded]="isOpen(location.id)">
            <ion-icon [name]="isOpen(location.id) ? 'chevron-down-outline' : 'chevron-forward-outline'" aria-hidden="true"></ion-icon>
            <strong>{{ location.name }}</strong>
            <span class="sub">
              {{ location.startAction }} ·
              @if (location.sendGeolocation) {
                {{ location.coordinateTemplate?.latitude }}, {{ location.coordinateTemplate?.longitude }}
              } @else {
                brez pošiljanja lokacije
              }
            </span>
            @if (!location.active) {
              <ion-badge color="medium">neaktivna</ion-badge>
            }
          </button>

          @if (isOpen(location.id)) {
          <ion-item>
            <ion-input label="Ime lokacije" labelPlacement="stacked" [(ngModel)]="drafts[location.id]!.name"></ion-input>
          </ion-item>
          <ion-item>
            <ion-input
              label="Naslov strani"
              labelPlacement="stacked"
              type="url"
              [(ngModel)]="drafts[location.id]!.url"
            ></ion-input>
          </ion-item>
          <ion-item>
            <ion-select label="Seja" labelPlacement="stacked" [(ngModel)]="drafts[location.id]!.sessionId">
              @for (session of sessions(); track session.id) {
                <ion-select-option [value]="session.id">{{ session.name }}</ion-select-option>
              }
            </ion-select>
          </ion-item>
          <ion-item>
            <ion-select
              label="Gumb za začetek dela"
              labelPlacement="stacked"
              [(ngModel)]="drafts[location.id]!.startAction"
            >
              @for (action of startActions; track action) {
                <ion-select-option [value]="action">{{ action }}</ion-select-option>
              }
            </ion-select>
          </ion-item>
          <ion-item>
            <ion-toggle [(ngModel)]="drafts[location.id]!.sendGeolocation">Pošlji lokacijo strani</ion-toggle>
          </ion-item>
          @if (!drafts[location.id]!.sendGeolocation) {
            <ion-note class="facts">
              Brskalnik strani ne bo povedal, kje je naprava — dovoljenje za geolokacijo je
              izrecno zavrnjeno. Koordinati ostaneta shranjeni in se uporabita, ko stikalo
              spet vklopiš. Če stran gumbe pokaže šele, ko pozna lego, jih ob izklopu ne bo.
            </ion-note>
          }
          <ion-item>
            <ion-input
              label="Zemljepisna širina"
              labelPlacement="stacked"
              [disabled]="!drafts[location.id]!.sendGeolocation"
              [(ngModel)]="drafts[location.id]!.latitude"
            ></ion-input>
          </ion-item>
          <ion-item>
            <ion-input
              label="Zemljepisna dolžina"
              labelPlacement="stacked"
              [disabled]="!drafts[location.id]!.sendGeolocation"
              [(ngModel)]="drafts[location.id]!.longitude"
            ></ion-input>
          </ion-item>
          <ion-item>
            <ion-input
              label="Raztros (m)"
              labelPlacement="stacked"
              type="number"
              [(ngModel)]="drafts[location.id]!.jitterMeters"
            ></ion-input>
          </ion-item>
          <ion-item>
            <ion-toggle [(ngModel)]="drafts[location.id]!.active">Aktivna</ion-toggle>
          </ion-item>

          <div class="actions">
            <ion-button size="small" (click)="save(location)">Shrani</ion-button>
            <ion-button size="small" fill="outline" (click)="testRead(location)">Preizkusi branje</ion-button>
            <ion-button size="small" fill="outline" color="danger" (click)="remove(location)">Izbriši</ion-button>
          </div>

          @if (results()[location.id]; as result) {
            <ion-text [color]="result.ok ? 'success' : 'danger'">
              <p>{{ result.message }}</p>
            </ion-text>
          }
          }
        </div>
      }

      <!-- Enako kot pri sejah: razprt samo, dokler lokacije ni — takrat je to edini
           preostali korak do delujočega beleženja. -->
      @if (locations().length > 0 && !addingLocation()) {
        <div class="location new">
          <ion-button size="small" fill="outline" (click)="addingLocation.set(true)">Dodaj še eno lokacijo</ion-button>
        </div>
      } @else {
      <div class="location new">
        <div class="head static"><strong>Nova lokacija</strong></div>
        <ion-item>
          <ion-input label="Ime lokacije" labelPlacement="stacked" placeholder="Služba" [(ngModel)]="newLocation.name"></ion-input>
        </ion-item>
        <ion-item>
          <ion-input
            label="Naslov strani"
            labelPlacement="stacked"
            type="url"
            placeholder="https://e-racuni.com/S6a/Clockin-…"
            [(ngModel)]="newLocation.url"
          ></ion-input>
        </ion-item>
        <ion-item>
          <ion-select label="Seja" labelPlacement="stacked" [(ngModel)]="newLocation.sessionId">
            @for (session of sessions(); track session.id) {
              <ion-select-option [value]="session.id">{{ session.name }}</ion-select-option>
            }
          </ion-select>
        </ion-item>
        <ion-item>
          <ion-select label="Gumb za začetek dela" labelPlacement="stacked" [(ngModel)]="newLocation.startAction">
            @for (action of startActions; track action) {
              <ion-select-option [value]="action">{{ action }}</ion-select-option>
            }
          </ion-select>
        </ion-item>
        <ion-item>
          <ion-toggle [(ngModel)]="newLocation.sendGeolocation">Pošlji lokacijo strani</ion-toggle>
        </ion-item>
        @if (newLocation.sendGeolocation) {
          <ion-item>
            <ion-input label="Zemljepisna širina" labelPlacement="stacked" placeholder="46.0629_6" [(ngModel)]="newLocation.latitude"></ion-input>
          </ion-item>
          <ion-item>
            <ion-input label="Zemljepisna dolžina" labelPlacement="stacked" placeholder="14.5602_9" [(ngModel)]="newLocation.longitude"></ion-input>
          </ion-item>
          <ion-note class="facts">
            Znak <code>_</code> v koordinati pomeni mesto, kamor se ob vsaki prijavi vstavi
            naključna števka — tako dva vpisa nista na isti točki do zadnje decimalke. Brez
            njega je koordinata vedno enaka.
          </ion-note>
        } @else {
          <ion-note class="facts">
            Brez pošiljanja lokacije koordinat ni treba vpisati. Če jih boš pozneje potreboval,
            ju vpiši hkrati z vklopom stikala.
          </ion-note>
        }
        <div class="actions">
          <ion-button size="small" (click)="create()">Dodaj lokacijo</ion-button>
        </div>
        @if (createError()) {
          <ion-text color="danger"><p>{{ createError() }}</p></ion-text>
        }
      </div>
      }
    }
  `,
  styles: `
    .location {
      padding: var(--cd-space-3) 0;
      border-top: 1px solid var(--cd-divider);
    }
    .location:first-of-type {
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
      flex-wrap: wrap;
      gap: var(--cd-space-2);
      margin-top: var(--cd-space-2);
    }
  `,
})
export class TimeTrackingLocationsComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly setup = inject(TimeTrackingSetupService);

  readonly locations = signal<TrackingLocationView[]>([]);
  readonly sessions = signal<SessionOption[]>([]);
  readonly results = signal<Record<string, { ok: boolean; message: string }>>({});
  readonly createError = signal<string | null>(null);
  readonly drafts: Record<string, LocationDraft> = {};
  readonly openIds = signal<ReadonlySet<string>>(new Set());
  readonly addingLocation = signal(false);
  protected readonly startActions = START_ACTIONS;

  newLocation: LocationDraft = emptyDraft();

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

  /** Po spremembi lokacije se osveži tudi skupno stanje nastavitve — prav lokacija je tisto,
   * česar manjkanje kontrolni seznam na vrhu zavihka javlja. */
  private async reloadAll(): Promise<void> {
    await Promise.all([this.reload(), this.setup.reload()]);
  }

  private async reload(): Promise<void> {
    try {
      const [locations, sessions] = await Promise.all([
        firstValueFrom(this.http.get<TrackingLocationView[]>(apiUrl('/time-tracking/locations'), { withCredentials: true })),
        firstValueFrom(this.http.get<SessionOption[]>(apiUrl('/time-tracking/sessions'), { withCredentials: true })),
      ]);
      this.locations.set(locations);
      this.sessions.set(sessions);
      for (const location of locations) {
        this.drafts[location.id] = {
          name: location.name,
          url: location.url,
          sessionId: location.sessionId,
          startAction: location.startAction ?? 'Prijava na delo',
          latitude: location.coordinateTemplate?.latitude ?? '',
          longitude: location.coordinateTemplate?.longitude ?? '',
          sendGeolocation: location.sendGeolocation ?? true,
          jitterMeters: location.jitterMeters,
          active: location.active,
        };
      }
      // Nova lokacija privzeto na prvo sejo — v praksi je ena sama in izbira je odveč.
      if (!this.newLocation.sessionId && sessions[0]) this.newLocation.sessionId = sessions[0].id;
    } catch {
      // FR-026 duh — prazen seznam je varno privzeto stanje.
    }
  }

  async save(location: TrackingLocationView): Promise<void> {
    const draft = this.drafts[location.id];
    if (!draft) return;

    const patch: Record<string, unknown> = {};
    if (draft.name && draft.name !== location.name) patch['name'] = draft.name;
    if (draft.url && draft.url !== location.url) patch['url'] = draft.url;
    if (draft.sessionId && draft.sessionId !== location.sessionId) patch['sessionId'] = draft.sessionId;
    if (draft.startAction !== location.startAction) patch['startAction'] = draft.startAction;
    if (draft.sendGeolocation !== location.sendGeolocation) patch['sendGeolocation'] = draft.sendGeolocation;
    // Koordinati gresta v popravek samo, kadar sta izpolnjeni: prazen par bi na strežniku
    // padel skozi obvezno preverjanje, lokacija brez pošiljanja lege pa ju ne potrebuje.
    if (
      draft.latitude &&
      draft.longitude &&
      (draft.latitude !== location.coordinateTemplate?.latitude ||
        draft.longitude !== location.coordinateTemplate?.longitude)
    ) {
      patch['coordinateTemplate'] = { latitude: draft.latitude, longitude: draft.longitude };
    }
    if (Number(draft.jitterMeters) !== location.jitterMeters) patch['jitterMeters'] = Number(draft.jitterMeters);
    if (draft.active !== location.active) patch['active'] = draft.active;

    if (Object.keys(patch).length === 0) {
      this.setResult(location.id, false, 'Ni sprememb za shranjevanje.');
      return;
    }

    try {
      await firstValueFrom(
        this.http.put(apiUrl(`/time-tracking/locations/${location.id}`), patch, { withCredentials: true }),
      );
      this.setResult(location.id, true, 'Shranjeno.');
      await this.reloadAll();
    } catch (err) {
      // Strežnik pove, KAJ manjka (npr. vklop pošiljanja lokacije brez koordinat, FR-094);
      // splošno "preveri naslov in koordinati" bi to pojasnilo zavrglo.
      this.setResult(
        location.id,
        false,
        problemDetail(err) ?? 'Shranjevanje ni uspelo — preveri naslov in koordinati.',
      );
    }
  }

  /** Cela veriga naenkrat: piškotek → naslov → koordinati → gumbi na strani. Brez tega je
   * prvi zagon ugibanje (quickstart.md §6, korak 2 to zahteva izrecno). */
  async testRead(location: TrackingLocationView): Promise<void> {
    this.setResult(location.id, true, 'Berem …');
    try {
      const res = await firstValueFrom(
        this.http.post<{ ok: boolean; availableActions: string[]; diagnostics: { hint?: string; message?: string } }>(
          apiUrl('/time-tracking/diagnostics/test-read'),
          { locationId: location.id, includeScreenshot: false },
          { withCredentials: true },
        ),
      );
      this.setResult(
        location.id,
        res.ok,
        res.ok
          ? `Deluje. Gumbi na strani: ${res.availableActions.join(', ')}.`
          : `Branje ni uspelo. ${res.diagnostics.hint ?? res.diagnostics.message ?? ''}`.trim(),
      );
    } catch {
      this.setResult(location.id, false, 'Preizkusnega branja ni bilo mogoče izvesti.');
    }
  }

  async remove(location: TrackingLocationView): Promise<void> {
    try {
      await firstValueFrom(
        this.http.delete(apiUrl(`/time-tracking/locations/${location.id}`), { withCredentials: true }),
      );
      await this.reloadAll();
    } catch {
      this.setResult(location.id, false, 'Brisanje ni uspelo — lokacijo najbrž uporablja kak profil.');
    }
  }

  async create(): Promise<void> {
    this.createError.set(null);
    const draft = this.newLocation;
    if (!draft.name || !draft.url || !draft.sessionId) {
      this.createError.set('Ime, naslov in seja so obvezni.');
      return;
    }
    if (draft.sendGeolocation && (!draft.latitude || !draft.longitude)) {
      this.createError.set('Koordinati sta obvezni, dokler je pošiljanje lokacije vklopljeno.');
      return;
    }
    try {
      await firstValueFrom(
        this.http.post(
          apiUrl('/time-tracking/locations'),
          {
            name: draft.name,
            url: draft.url,
            sessionId: draft.sessionId,
            startAction: draft.startAction,
            ...(draft.sendGeolocation
              ? { coordinateTemplate: { latitude: draft.latitude, longitude: draft.longitude } }
              : {}),
            sendGeolocation: draft.sendGeolocation,
            jitterMeters: Number(draft.jitterMeters) || 10,
            active: draft.active,
          },
          { withCredentials: true },
        ),
      );
      this.newLocation = emptyDraft(draft.sessionId);
      await this.reloadAll();
    } catch (err) {
      this.createError.set(
        problemDetail(err) ?? 'Lokacije ni bilo mogoče dodati — ime mora biti enolično, naslov pa veljaven URL.',
      );
    }
  }

  private setResult(id: string, ok: boolean, message: string): void {
    this.results.update((prev) => ({ ...prev, [id]: { ok, message } }));
  }
}

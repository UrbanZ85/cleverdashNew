import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { IonContent, IonList, IonItem, IonLabel, IonNote } from '@ionic/angular/standalone';
import { PageHeaderComponent } from '../../../shared/layout/page-header.component.js';
import { apiUrl } from '../../../core/api/api-base.js';

interface HistoryRecord {
  id: string;
  localDate: string;
  profileName: string;
  locationName: string;
  actionName: string;
  scheduledAt: string;
  completedAt: string | null;
  finalOutcome: string;
  source: string;
  stateBefore: string | null;
  stateAfter: string | null;
  attemptSummary: { count: number };
  failureReason?: string | null;
}

interface HistoryResponse {
  items: HistoryRecord[];
  page: number;
  pageSize: number;
  total: number;
}

interface AttemptView {
  id: string;
  attemptNumber: number;
  outcome: string;
  clockStateBefore: string;
  clockStateAfter: string;
  availableActionsBefore: string[];
  availableActionsAfter: string[];
  durationMs: number;
  errorMessage?: string | null;
  /** Naslov endpointa, ki posnetek postreže, ali `null`. Pot na disku to NI (router.ts). */
  screenshotUrl?: string | null;
}

const ZONE = 'Europe/Ljubljana';

/** Izid celega zapisa. Kode ostanejo vidne ob prevodu — v Diagnostiki in dnevnikih nastopajo
 * v angleščini, zato mora biti povezava med enim in drugim očitna. */
const OUTCOME_LABELS: Record<string, string> = {
  succeeded: 'uspelo',
  failed: 'neuspelo',
  already_done: 'že opravljeno',
  missed: 'zamujeno',
  skipped: 'preskočeno',
  cancelled: 'preklicano',
};

const ATTEMPT_LABELS: Record<string, string> = {
  verified: 'potrjeno',
  not_verified: 'ni potrjeno',
  action_unavailable: 'gumba ni bilo',
  unexpected_state: 'nepričakovano stanje',
  browser_error: 'napaka brskalnika',
  session_expired: 'seja je potekla',
  timeout: 'časovna omejitev',
};

// US9 (P9): filtrirljiva, razširljiva zgodovina — FR-051/FR-050. Vsak zapis se lahko
// razširi do posameznih poskusov (FR-032).
//
// Zakaj je tu toliko podrobnosti: US9 AS1 zahteva prebrano stanje pred in po, AS3 pa posnetek
// zaslona ob napaki. Prej je poskus povedal samo `not_verified`, kar je za uporabnika prazna
// beseda — vse ostalo (stanje pred/po, razpoložljivi gumbi, sporočilo napake, posnetek) je bilo
// ves čas v bazi, a ni prišlo do zaslona. Prav ta razlika odloči, ali je uporabnik sposoben
// ugotoviti, da akcija pri delodajalcu ni bila zabeležena.
@Component({
  selector: 'app-time-tracking-history-page',
  standalone: true,
  imports: [PageHeaderComponent, IonContent, IonList, IonItem, IonLabel, IonNote],
  template: `
    <app-page-header
      title="Zgodovina"
      subtitle="Beleženje časa"
      backRoute="/time-tracking"
      backLabel="Danes"
    ></app-page-header>
    <ion-content class="ion-padding">
      @if (records().length === 0) {
        <p>Ni zapisov za zadnjih 7 dni.</p>
      } @else {
        <ion-list>
          @for (record of records(); track record.id) {
            <ion-item button (click)="toggleExpand(record.id)">
              <ion-label>
                <h2>
                  {{ record.localDate }} — {{ record.actionName }}
                  <span class="outcome">{{ outcomeLabel(record.finalOutcome) }}</span>
                </h2>
                <p>
                  Načrtovano {{ time(record.scheduledAt) }}, izvedeno {{ time(record.completedAt) }} —
                  {{ record.profileName }}, {{ record.locationName }}
                </p>
                <p>
                  Stanje: {{ chain(record.stateBefore, record.stateAfter) }} — vir: {{ record.source }},
                  poskusov: {{ record.attemptSummary.count }}
                </p>
                @if (record.failureReason) {
                  <p class="reason">{{ record.failureReason }}</p>
                }
              </ion-label>
            </ion-item>

            @if (expandedId() === record.id) {
              @for (attempt of attemptsByRecord()[record.id] ?? []; track attempt.id) {
                <ion-item class="attempt">
                  <ion-label>
                    <p class="attempt-head">
                      Poskus {{ attempt.attemptNumber }}: {{ attemptLabel(attempt.outcome) }}
                      <span class="code">({{ attempt.outcome }}, {{ seconds(attempt.durationMs) }})</span>
                    </p>
                    <p>
                      Stanje: {{ chain(attempt.clockStateBefore, attempt.clockStateAfter) }}
                      @if (attempt.clockStateBefore === attempt.clockStateAfter) {
                        <strong>— nespremenjeno</strong>
                      }
                    </p>
                    @if (explain(attempt); as text) {
                      <p class="reason">{{ text }}</p>
                    }
                    @if (attempt.availableActionsBefore.length > 0) {
                      <p class="code">Gumbi pred: {{ attempt.availableActionsBefore.join(', ') }}</p>
                    }
                    @if (attempt.availableActionsAfter.length > 0) {
                      <p class="code">Gumbi po: {{ attempt.availableActionsAfter.join(', ') }}</p>
                    }
                    @if (attempt.errorMessage) {
                      <p class="reason">{{ attempt.errorMessage }}</p>
                    }
                    @if (attempt.screenshotUrl; as url) {
                      @if (missingShots()[attempt.id]) {
                        <ion-note class="code">
                          Posnetek zaslona ni več na voljo — datoteke se hranijo omejeno obdobje,
                          zapis o poskusu pa ostane.
                        </ion-note>
                      } @else {
                        <!-- Dokaz, kaj je stran RES pokazala po kliku. Nativni Android bere API
                             z drugega izvora, zato tam slika morda ne bo naložena; v brskalniku,
                             kjer se ta zaslon uporablja za razčiščevanje, je pot relativna. -->
                        <a [href]="shotUrl(url)" target="_blank" rel="noopener">
                          <img
                            class="shot"
                            [src]="shotUrl(url)"
                            [alt]="'Posnetek zaslona, poskus ' + attempt.attemptNumber"
                            loading="lazy"
                            (error)="markShotMissing(attempt.id)"
                          />
                        </a>
                      }
                    }
                  </ion-label>
                </ion-item>
              }
              @if ((attemptsByRecord()[record.id] ?? []).length === 0) {
                <ion-item class="attempt">
                  <ion-label>
                    <p class="code">Za ta zapis ni zabeleženih poskusov (ročna ali API akcija).</p>
                  </ion-label>
                </ion-item>
              }
            }
          }
        </ion-list>
      }
    </ion-content>
  `,
  styles: `
    .outcome {
      margin-left: var(--cd-space-2);
      font-weight: 600;
    }
    .attempt {
      --padding-start: var(--cd-space-4);
    }
    .attempt-head {
      font-weight: 600;
    }
    .code {
      font-size: var(--cd-font-size-xs);
      color: var(--cd-text-muted);
    }
    .reason {
      white-space: normal;
    }
    .shot {
      max-width: min(100%, 22rem);
      margin-top: var(--cd-space-2);
      border: 1px solid var(--cd-divider);
      border-radius: var(--cd-radius-sm);
    }
  `,
})
export class HistoryPage implements OnInit {
  private readonly http = inject(HttpClient);

  readonly records = signal<HistoryRecord[]>([]);
  readonly expandedId = signal<string | null>(null);
  readonly attemptsByRecord = signal<Record<string, AttemptView[]>>({});
  /** Poskusi, katerih posnetek je bil počiščen (FR-053) — slika se ne naloži, zato namesto
   * zlomljene ikone izpišemo, kaj se je zgodilo. */
  readonly missingShots = signal<Record<string, boolean>>({});

  async ngOnInit(): Promise<void> {
    try {
      const res = await firstValueFrom(
        this.http.get<HistoryResponse>(apiUrl('/time-tracking/history'), { withCredentials: true }),
      );
      this.records.set(res.items);
    } catch {
      // FR-026 duh — prazen seznam je varno privzeto stanje.
    }
  }

  async toggleExpand(id: string): Promise<void> {
    if (this.expandedId() === id) {
      this.expandedId.set(null);
      return;
    }
    this.expandedId.set(id);
    if (this.attemptsByRecord()[id]) return;
    try {
      const attempts = await firstValueFrom(
        this.http.get<AttemptView[]>(apiUrl(`/time-tracking/history/${id}/attempts`), { withCredentials: true }),
      );
      this.attemptsByRecord.update((prev) => ({ ...prev, [id]: attempts }));
    } catch {
      // Prehodna napaka — uporabnik lahko poskusi znova z novim klikom.
    }
  }

  outcomeLabel(outcome: string): string {
    return OUTCOME_LABELS[outcome] ?? outcome;
  }

  attemptLabel(outcome: string): string {
    return ATTEMPT_LABELS[outcome] ?? outcome;
  }

  /** `PREJ → POTEM`, z vidno vrzeljo, kadar stanja ne poznamo. */
  chain(before: string | null, after: string | null): string {
    return `${before ?? 'neznano'} → ${after ?? 'neznano'}`;
  }

  time(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleTimeString('sl-SI', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: ZONE,
    });
  }

  seconds(ms: number): string {
    return `${(ms / 1000).toFixed(1)} s`;
  }

  /**
   * Kaj `not_verified` pomeni v tem konkretnem poskusu. Sama koda pove samo, da potrditve ni
   * bilo; uporabnika pa zanima, ali je akcija pri delodajalcu zabeležena ali ne — in to je
   * razvidno iz tega, ali se je stanje sploh premaknilo.
   */
  explain(attempt: AttemptView): string | null {
    if (attempt.outcome !== 'not_verified') return null;
    if (attempt.clockStateBefore === attempt.clockStateAfter) {
      return 'Klik se je zgodil, stanje strani pa se po ponovnem branju ni premaknilo — akcija pri delodajalcu ni bila zabeležena.';
    }
    return 'Stanje po kliku ni tisto, ki ga ta akcija pričakuje — zabeleženo je bilo nekaj drugega, kot je bilo načrtovano.';
  }

  shotUrl(path: string): string {
    return apiUrl(path);
  }

  markShotMissing(attemptId: string): void {
    this.missingShots.update((prev) => ({ ...prev, [attemptId]: true }));
  }
}

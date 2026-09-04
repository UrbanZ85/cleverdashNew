import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import {
  IonContent,
  IonList,
  IonItem,
  IonLabel,
  IonButton,
  IonSpinner,
  IonRefresher,
  IonRefresherContent,
} from '@ionic/angular/standalone';
import { PageHeaderComponent } from '../../../shared/layout/page-header.component.js';
import { apiUrl } from '../../../core/api/api-base.js';
import { ActionResultComponent, type ActionResultView } from './action-result.component.js';

interface StateResponse {
  state: string;
  availableActions: string[];
  readAt: string;
  fromCache: boolean;
  locationId?: string;
  locationName?: string;
}

interface ActionApiResponse {
  outcome: string;
  actionName: string;
  verified: boolean;
  stateAfter?: string;
  failureReason?: string;
}

interface PlannedActionView {
  id: string;
  actionName: string;
  baseLocalTime: string;
  state: string;
  attemptCount: number;
  failureReason?: string | null;
}

// US1 (P1, MVP): privzeti zaslon modula "Beleženje časa" — trenutno stanje, razpoložljive
// akcije kot gumbi za ročni pritisk, izid v nekaj sekundah (SC-006). Zaslon namenoma NE
// pozna urnika/profilov (US2) — samo trenutno stanje in ročni gumbi.
@Component({
  selector: 'app-time-tracking-today-page',
  standalone: true,
  imports: [
    PageHeaderComponent,
    IonContent,
    IonList,
    IonItem,
    IonLabel,
    IonButton,
    IonSpinner,
    IonRefresher,
    IonRefresherContent,
    ActionResultComponent,
    RouterLink,
  ],
  template: `
    <app-page-header title="Beleženje časa" subtitle="Danes">
      <ion-button slot="end" routerLink="/time-tracking/schedule">Urnik</ion-button>
      <ion-button slot="end" routerLink="/time-tracking/calendar">Koledar</ion-button>
      <ion-button slot="end" routerLink="/time-tracking/history">Zgodovina</ion-button>
      <ion-button slot="end" routerLink="/time-tracking/diagnostics">Diagnostika</ion-button>
    </app-page-header>
    <ion-content class="ion-padding">
      <ion-refresher slot="fixed" (ionRefresh)="onRefresh($event)">
        <ion-refresher-content></ion-refresher-content>
      </ion-refresher>

      @if (loading()) {
        <ion-spinner></ion-spinner>
      } @else {
        <p>Trenutno stanje: <strong>{{ stateLabel() }}</strong></p>

        @if (lastResult(); as result) {
          <app-action-result [result]="result"></app-action-result>
        }

        @if (availableActions().length === 0) {
          <p>Ni razpoložljivih akcij. Preveri Diagnostiko, če se to ne spremeni.</p>
        } @else {
          <ion-list>
            @for (action of availableActions(); track action) {
              <ion-item>
                <ion-button [disabled]="executing()" (click)="performAction(action)">{{ action }}</ion-button>
              </ion-item>
            }
          </ion-list>
        }

        @if (plannedToday().length > 0) {
          <h3>Načrtovano danes</h3>
          <ion-list>
            @for (planned of plannedToday(); track planned.id) {
              <ion-item [class.planned-failed]="planned.state === 'failed'">
                <ion-label>
                  <h2>{{ planned.actionName }} ({{ planned.baseLocalTime.slice(0, 5) }})</h2>
                  <p>Stanje: {{ planned.state }} — poskusov: {{ planned.attemptCount }}</p>
                  @if (planned.state === 'failed' && planned.failureReason) {
                    <p class="planned-failure-reason">{{ planned.failureReason }}</p>
                  }
                </ion-label>
              </ion-item>
            }
          </ion-list>
        }
      }
    </ion-content>
  `,
  styles: `
    .planned-failed { --background: var(--ion-color-danger-tint, #fbdada); }
    .planned-failure-reason { color: var(--ion-color-danger, #c00); }
  `,
})
export class TodayPage implements OnInit {
  private readonly http = inject(HttpClient);

  readonly loading = signal(true);
  readonly executing = signal(false);
  readonly availableActions = signal<string[]>([]);
  readonly clockState = signal<string>('UNKNOWN');
  readonly lastResult = signal<ActionResultView | null>(null);
  readonly plannedToday = signal<PlannedActionView[]>([]);

  private static readonly STATE_LABELS: Record<string, string> = {
    OFF_DUTY: 'nisi na delu',
    ON_DUTY: 'na delu',
    ON_BREAK: 'na malici',
    UNKNOWN: 'ni znano (preveri Diagnostiko)',
  };

  stateLabel(): string {
    return TodayPage.STATE_LABELS[this.clockState()] ?? this.clockState();
  }

  async ngOnInit(): Promise<void> {
    await Promise.all([this.loadState(false), this.loadPlannedToday()]);
  }

  // US3, T068: prikaz stanja `failed` (in ostalih) za danes načrtovane akcije — polna
  // razširitev do poskusov pride z US9 (zgodovina); tukaj je dovolj strnjen pregled.
  private async loadPlannedToday(): Promise<void> {
    try {
      const planned = await firstValueFrom(
        this.http.get<PlannedActionView[]>(apiUrl('/time-tracking/planned-actions'), { withCredentials: true }),
      );
      this.plannedToday.set(planned);
    } catch {
      // FR-026 duh — prazen seznam je varno privzeto stanje.
    }
  }

  async onRefresh(event: CustomEvent): Promise<void> {
    await Promise.all([this.loadState(true), this.loadPlannedToday()]);
    (event.target as unknown as { complete: () => void }).complete();
  }

  private async loadState(refresh: boolean): Promise<void> {
    this.loading.set(true);
    try {
      const res = await firstValueFrom(
        this.http.get<StateResponse>(apiUrl(`/time-tracking/state${refresh ? '?refresh=true' : ''}`), {
          withCredentials: true,
        }),
      );
      this.clockState.set(res.state);
      this.availableActions.set(res.availableActions);
    } catch {
      // FR-026 duh: prehodna napaka ne sme sesuti zaslona — pusti prejšnje stanje.
    } finally {
      this.loading.set(false);
    }
  }

  async performAction(actionName: string): Promise<void> {
    this.executing.set(true);
    try {
      const res = await firstValueFrom(
        this.http.post<ActionApiResponse>(
          apiUrl('/time-tracking/actions'),
          { actionName },
          { withCredentials: true },
        ),
      );
      this.lastResult.set(res);
      await Promise.all([this.loadState(true), this.loadPlannedToday()]);
    } catch (err) {
      this.lastResult.set({
        outcome: 'failed',
        actionName,
        verified: false,
        failureReason: err instanceof Error ? err.message : 'Akcija ni uspela.',
      });
    } finally {
      this.executing.set(false);
    }
  }
}

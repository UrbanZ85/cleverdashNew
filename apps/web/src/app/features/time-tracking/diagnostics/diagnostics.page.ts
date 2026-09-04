import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { IonButton, IonContent, IonList, IonItem, IonLabel } from '@ionic/angular/standalone';
import { PageHeaderComponent } from '../../../shared/layout/page-header.component.js';
import { apiUrl } from '../../../core/api/api-base.js';

interface HealthResponse {
  status: string;
  schedulerLastTickAgeSeconds: number | null;
  browser: string;
  remoteSessions: Array<{ name: string; status: string; daysUntilExpiry: number | null }>;
  failedActionsLast24h: number;
  missedActionsLast24h: number;
}

interface TestReadResponse {
  ok: boolean;
  state: string;
  availableActions: string[];
  sessionValid: boolean;
  /** FR-094: s čim je bilo branje izvedeno — brez tega je "gumbov ni" videti enako v obeh
   * primerih, s poslano lego in brez nje. */
  geolocationSent?: boolean;
  diagnostics: { reason: string; message?: string; hint?: string };
}

// US8 (P8, FR-064): diagnostični zaslon prikaže zdravstvene podatke berljivo in ponudi
// takojšen preizkus branja stanja (dry-run, brez klika).
@Component({
  selector: 'app-time-tracking-diagnostics-page',
  standalone: true,
  imports: [PageHeaderComponent, IonButton, IonContent, IonList, IonItem, IonLabel],
  template: `
    <app-page-header
      title="Diagnostika"
      subtitle="Beleženje časa"
      backRoute="/time-tracking"
      backLabel="Danes"
    ></app-page-header>
    <ion-content class="ion-padding">
      @if (health(); as h) {
        <ion-list>
          <ion-item>
            <ion-label>
              <h2>Splošno stanje: {{ h.status }}</h2>
              <p>Zadnji tik schedulerja: {{ h.schedulerLastTickAgeSeconds ?? 'ni znano' }} s nazaj</p>
              <p>Brskalnik: {{ h.browser }}</p>
              <p>Neuspele akcije zadnjih 24 ur: {{ h.failedActionsLast24h }}, zamujene: {{ h.missedActionsLast24h }}</p>
            </ion-label>
          </ion-item>
          @for (session of h.remoteSessions; track session.name) {
            <ion-item [class.session-warning]="session.daysUntilExpiry !== null && session.daysUntilExpiry <= 7">
              <ion-label>
                <h2>Seja "{{ session.name }}" — {{ session.status }}</h2>
                <p>
                  {{
                    session.daysUntilExpiry === null
                      ? 'rok veljavnosti ni znan'
                      : 'poteče čez ' + session.daysUntilExpiry + ' dni'
                  }}
                </p>
              </ion-label>
            </ion-item>
          }
        </ion-list>
      }

      <ion-button expand="block" [disabled]="testing()" (click)="runTestRead()">Preizkusi branje stanja zdaj</ion-button>

      @if (testResult(); as result) {
        <ion-item [class.session-warning]="!result.ok">
          <ion-label>
            <h2>{{ result.ok ? 'Branje uspešno' : 'Branje ni uspelo' }}</h2>
            <p>Stanje: {{ result.state }}, razlog: {{ result.diagnostics.reason }}</p>
            @if (result.geolocationSent !== undefined) {
              <p>Lokacija poslana strani: {{ result.geolocationSent ? 'da' : 'ne' }}</p>
            }
            @if (result.diagnostics.hint) {
              <p>{{ result.diagnostics.hint }}</p>
            }
          </ion-label>
        </ion-item>
      }
    </ion-content>
  `,
  styles: `
    .session-warning { --background: var(--ion-color-warning-tint, #fff3cd); }
  `,
})
export class DiagnosticsPage implements OnInit {
  private readonly http = inject(HttpClient);

  readonly health = signal<HealthResponse | null>(null);
  readonly testing = signal(false);
  readonly testResult = signal<TestReadResponse | null>(null);

  async ngOnInit(): Promise<void> {
    try {
      const health = await firstValueFrom(this.http.get<HealthResponse>(apiUrl('/health'), { withCredentials: true }));
      this.health.set(health);
    } catch {
      // FR-026 duh — brez podatkov je varno privzeto stanje.
    }
  }

  async runTestRead(): Promise<void> {
    this.testing.set(true);
    try {
      const result = await firstValueFrom(
        this.http.post<TestReadResponse>(apiUrl('/time-tracking/diagnostics/test-read'), {}, { withCredentials: true }),
      );
      this.testResult.set(result);
    } catch (err) {
      // Neuspela ZAHTEVA ni diagnoza brskalnika. Prej je vsaka napaka — tudi 404 "lokacija ni
      // najdena", ki je normalno stanje pred prvo nastavitvijo — prikazala
      // `browser_launch_failed` in s tem obtožila Chrome za manjkajočo nastavitev. Zdaj se
      // izpiše, kar je strežnik dejansko odgovoril (RFC 9457 `detail`, člen VI: napaka mora
      // povedati vzrok, ne prvega verjetnega krivca).
      const problem: unknown = err instanceof HttpErrorResponse ? err.error : null;
      const detail =
        problem && typeof problem === 'object' && typeof (problem as { detail?: unknown }).detail === 'string'
          ? (problem as { detail: string }).detail
          : null;
      const status = err instanceof HttpErrorResponse ? err.status : 0;
      this.testResult.set({
        ok: false,
        state: 'UNKNOWN',
        availableActions: [],
        sessionValid: false,
        diagnostics: {
          reason: status === 0 ? 'strežnik ni dosegljiv' : `zahteva zavrnjena (HTTP ${status})`,
          hint: detail ?? 'Preveri, ali strežnik teče, in poskusi znova.',
        },
      });
    } finally {
      this.testing.set(false);
    }
  }
}

import { Component, input, output } from '@angular/core';
import { IonChip, IonIcon, IonLabel, IonNote } from '@ionic/angular/standalone';
import { coverageNotice, formatMoment, percentOf, type UsageSnapshot } from './analytics.model.js';

// Statistika uporabe (US2, US3).
//
// OPOZORILO O POKRITOSTI JE NAD ŠTEVILKAMI in ne pod njimi (FR-038). Prazno obdobje je neločljivo
// od "nihče se ni prijavljal", če ni povedano, da meritev za tisti čas ni — in to je napačen sklep
// s posledicami za račune ljudi. Zato stoji tam, kjer ga ni mogoče spregledati.

@Component({
  selector: 'app-analytics-usage-panel',
  standalone: true,
  imports: [IonChip, IonLabel, IonNote, IonIcon],
  template: `
    <div class="chips">
      @for (option of options; track option) {
        <ion-chip
          [outline]="option !== days()"
          [color]="option === days() ? 'primary' : undefined"
          (click)="daysChange.emit(option)"
        >
          <ion-label>{{ option }} dni</ion-label>
        </ion-chip>
      }
    </div>

    @if (data(); as snap) {
      @if (notice(snap.coverage); as text) {
        <div class="coverage">
          <ion-icon name="alert-circle-outline" aria-hidden="true"></ion-icon>
          <span>{{ text }}</span>
        </div>
      }

      <section class="cards">
        <article class="card">
          <h3>Prijav v obdobju</h3>
          <p class="big">{{ snap.logins.total }}</p>
          <ion-note>{{ snap.window.fromDay }} – {{ snap.window.toDay }}</ion-note>
        </article>
        <article class="card">
          <h3>Aktivnih oseb</h3>
          <p class="big">{{ snap.logins.activeUsers }}</p>
          <ion-note>{{ snap.logins.inactiveUsers }} se v tem obdobju ni prijavilo.</ion-note>
        </article>
      </section>

      <h3 class="section-title">Zavihki po uporabi</h3>
      <table class="cd-table">
        <thead>
          <tr><th>Zavihek</th><th class="num">Ogledov</th><th class="num">Oseb</th><th class="bar"></th></tr>
        </thead>
        <tbody>
          @for (t of snap.tabs; track t.tabId) {
            <!-- Zavihek z nič ogledi OSTANE na lestvici: neuporabljen zavihek je ravno tisti
                 podatek, zaradi katerega ta tabela obstaja. -->
            <tr [class.zero]="t.views === 0">
              <td>{{ t.title }}</td>
              <td class="num">{{ t.views }}</td>
              <td class="num">{{ t.users }}</td>
              <td class="bar"><span class="fill" [style.width.%]="pct(t.views, maxViews(snap))"></span></td>
            </tr>
          }
        </tbody>
      </table>

      <h3 class="section-title">Po osebi</h3>
      <table class="cd-table">
        <thead>
          <tr><th>Oseba</th><th class="num">Prijav</th><th>Zadnja prijava</th><th>Zadnja aktivnost</th></tr>
        </thead>
        <tbody>
          @for (u of snap.byUser; track u.userId) {
            <tr>
              <td>
                <span class="name">{{ u.displayName }}</span>
                @if (u.maskedEmail) {
                  <span class="cd-muted email">{{ u.maskedEmail }}</span>
                }
                <span class="cd-muted breakdown">{{ tabBreakdown(u, snap) }}</span>
              </td>
              <td class="num">{{ u.logins }}</td>
              <td>{{ moment(u.lastLoginAt) }}</td>
              <td>{{ moment(u.lastActiveAt) }}</td>
            </tr>
          }
        </tbody>
      </table>

      <ion-note class="foot">
        Beleži se število ogledov na zavihek na dan — ne posamezni kliki, ne poti, ne naslovi IP.
        Meritve se same pobrišejo po {{ snap.coverage.retentionDays }} dneh.
      </ion-note>
    }
  `,
  styles: [
    `
      .chips { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 12px; }
      .coverage {
        display: flex; gap: 8px; align-items: flex-start;
        background: var(--ion-color-warning-tint, #fff3cd);
        border-radius: 10px; padding: 10px 14px; margin-bottom: 16px;
      }
      .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
      .card { border: 1px solid var(--cd-divider); border-radius: 10px; padding: 12px 14px; }
      .card h3 { margin: 0 0 4px; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.03em; opacity: 0.7; }
      .big { margin: 0 0 4px; font-size: 1.5rem; font-weight: 600; }
      .section-title { margin: 20px 0 8px; }
      .cd-table { width: 100%; border-collapse: collapse; }
      .cd-table th, .cd-table td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--cd-divider); vertical-align: top; }
      .num { text-align: right; white-space: nowrap; }
      .bar { width: 30%; }
      .fill { display: block; height: 8px; border-radius: 4px; background: var(--ion-color-primary); min-width: 1px; }
      .zero { opacity: 0.55; }
      .name { display: block; }
      .email, .breakdown { display: block; font-size: 0.78rem; }
      .foot { display: block; margin: 16px 0 24px; }
    `,
  ],
})
export class AnalyticsUsagePanelComponent {
  readonly data = input<UsageSnapshot | null>(null);
  readonly days = input<number>(30);
  readonly daysChange = output<number>();

  protected readonly options = [7, 30, 90];
  protected pct = percentOf;
  protected moment = formatMoment;
  protected notice = coverageNotice;

  /** Najbolj obiskan zavihek je merilo za stolpce. Brez ogledov je 0 in vsi stolpci so prazni. */
  protected maxViews(snap: UsageSnapshot): number {
    return snap.tabs.reduce((max, t) => Math.max(max, t.views), 0);
  }

  protected tabBreakdown(user: UsageSnapshot['byUser'][number], snap: UsageSnapshot): string {
    const parts = snap.tabs
      .map((t) => ({ title: t.title, views: user.tabs[t.tabId] ?? 0 }))
      .filter((p) => p.views > 0)
      .sort((a, b) => b.views - a.views)
      .map((p) => `${p.title}: ${p.views}`);
    return parts.length > 0 ? parts.join(' · ') : 'brez ogledov v tem obdobju';
  }
}

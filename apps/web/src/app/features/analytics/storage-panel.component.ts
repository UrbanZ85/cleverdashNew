import { Component, input } from '@angular/core';
import { IonBadge, IonIcon, IonNote } from '@ionic/angular/standalone';
import {
  findingLabel,
  formatBytes,
  formatMoment,
  percentOf,
  type StorageSnapshot,
} from './analytics.model.js';

// Pregled porabe prostora (US1, US4).
//
// BREZ GRAFOV (research.md §12): to je lestvica, ne časovna vrsta, in lestvica je najbolj berljiva
// kot tabela z vodoravnim stolpcem iz CSS-a. `chart.js` je sicer v projektu, a ga uporablja modul
// 011 — njegova ovojnica bi bila uvoz med moduloma (člen I), lasten izvod pa strošek brez koristi.
//
// ZASEDENOST NOSILCA JE SVOJA ŠKATLA in ne del vsote (FR-015): vsota zabeleženih velikosti in
// zasedenost datotečnega sistema nista isto število, ker so na nosilcu tudi baza in dnevniki, vsota
// pa ne pozna ne indeksov ne stiskanja. Postavljeni druga ob drugo z besedilom, ki to pove.

@Component({
  selector: 'app-analytics-storage-panel',
  standalone: true,
  imports: [IonBadge, IonIcon, IonNote],
  template: `
    @if (data(); as snap) {
      <section class="cards">
        <article class="card">
          <h3>Skupna poraba vsebine</h3>
          <p class="big">{{ bytes(snap.totalBytes) }}</p>
          <ion-note>Vsota zabeleženih velikosti slik, posnetkov in datotek.</ion-note>
        </article>

        <article class="card">
          <h3>Nosilec za datoteke</h3>
          @if (snap.volume; as vol) {
            <p class="big">{{ bytes(vol.freeBytes) }} prosto</p>
            <ion-note>od {{ bytes(vol.totalBytes) }} — to <strong>ni</strong> isto kot poraba levo.</ion-note>
          } @else {
            <p class="big muted">ni podatka</p>
            <ion-note>{{ snap.volumeUnavailableReason }}</ion-note>
          }
        </article>
      </section>

      <!-- Razhajanja so NAD tabelami: če se disk in baza ne ujemata, so številke pod tem
           vprašljive, in bralec mora to izvedeti prej, ne po tem, ko si jih je zapomnil. -->
      <section class="integrity" [class.ok]="snap.integrity.clean">
        @if (snap.integrity.clean) {
          <p>
            <ion-icon name="checkmark-circle-outline" aria-hidden="true"></ion-icon>
            Razhajanj med diskom in bazo ni.
          </p>
        } @else {
          <p class="warn">
            <ion-icon name="alert-circle-outline" aria-hidden="true"></ion-icon>
            Disk in baza se razhajata:
          </p>
          <ul>
            @for (f of snap.integrity.findings; track f.kind) {
              <li>{{ label(f.kind) }} — {{ f.recordCount }} × ({{ bytes(f.bytes) }})</li>
            }
          </ul>
          <ion-note>Analitika ničesar ne popravi in ne pobriše; to je delo modula Deljenje datotek.</ion-note>
        }
      </section>

      <h3 class="section-title">Po vrsti vsebine</h3>
      <table class="cd-table">
        <thead>
          <tr><th>Vir</th><th class="num">Zapisov</th><th class="num">Prostor</th><th class="bar"></th></tr>
        </thead>
        <tbody>
          @for (s of snap.sources; track s.id) {
            <tr [class.absent]="!s.present">
              <td>
                {{ s.label }}
                @if (!s.present) {
                  <ion-badge color="medium">ni v tej namestitvi</ion-badge>
                }
              </td>
              <td class="num">{{ s.recordCount }}</td>
              <td class="num">{{ bytes(s.totalBytes) }}</td>
              <td class="bar"><span class="fill" [style.width.%]="pct(s.totalBytes, snap.totalBytes)"></span></td>
            </tr>
          }
        </tbody>
      </table>

      <h3 class="section-title">Po osebi</h3>
      <table class="cd-table">
        <thead>
          <tr><th>Oseba</th><th class="num">Skupaj</th><th class="bar"></th></tr>
        </thead>
        <tbody>
          @for (u of snap.byUser; track u.userId ?? 'unknown') {
            <tr>
              <td>
                <span class="name">{{ u.displayName }}</span>
                @if (u.maskedEmail) {
                  <span class="cd-muted email">{{ u.maskedEmail }}</span>
                }
                <span class="cd-muted breakdown">{{ breakdown(u, snap) }}</span>
              </td>
              <td class="num">{{ bytes(u.totalBytes) }}</td>
              <td class="bar"><span class="fill" [style.width.%]="pct(u.totalBytes, snap.totalBytes)"></span></td>
            </tr>
          }
        </tbody>
      </table>

      <ion-note class="foot">
        Izračunano {{ moment(snap.computedAt) }}. Velja do {{ moment(snap.cachedUntil) }}.
      </ion-note>
    }
  `,
  styles: [
    `
      .cards {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 12px;
        margin-bottom: 16px;
      }
      .card {
        border: 1px solid var(--cd-divider);
        border-radius: 10px;
        padding: 12px 14px;
      }
      .card h3 { margin: 0 0 4px; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.03em; opacity: 0.7; }
      .big { margin: 0 0 4px; font-size: 1.5rem; font-weight: 600; }
      .big.muted { opacity: 0.5; font-size: 1.1rem; }
      .integrity { border-radius: 10px; padding: 10px 14px; margin-bottom: 16px; background: var(--ion-color-warning-tint, #fff3cd); }
      .integrity.ok { background: transparent; padding-left: 0; }
      .integrity p { margin: 0; display: flex; align-items: center; gap: 6px; }
      .integrity ul { margin: 6px 0 4px 20px; }
      .section-title { margin: 20px 0 8px; }
      .cd-table { width: 100%; border-collapse: collapse; }
      .cd-table th, .cd-table td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--cd-divider); vertical-align: top; }
      .num { text-align: right; white-space: nowrap; }
      .bar { width: 30%; }
      .fill { display: block; height: 8px; border-radius: 4px; background: var(--ion-color-primary); min-width: 1px; }
      .absent { opacity: 0.55; }
      .name { display: block; }
      .email, .breakdown { display: block; font-size: 0.78rem; }
      .foot { display: block; margin: 16px 0 24px; }
    `,
  ],
})
export class AnalyticsStoragePanelComponent {
  readonly data = input<StorageSnapshot | null>(null);

  protected bytes = formatBytes;
  protected pct = percentOf;
  protected moment = formatMoment;
  protected label = findingLabel;

  /** Razbitje po virih v eni vrstici — samo tisti, ki pri tej osebi niso nič. */
  protected breakdown(user: StorageSnapshot['byUser'][number], snap: StorageSnapshot): string {
    const parts = snap.sources
      .map((s) => ({ label: s.label, bytes: user.perSource[s.id] ?? 0, count: user.counts[s.id] ?? 0 }))
      .filter((p) => p.bytes > 0 || p.count > 0)
      .map((p) => (p.bytes > 0 ? `${p.label}: ${formatBytes(p.bytes)}` : `${p.label}: ${p.count}`));
    return parts.length > 0 ? parts.join(' · ') : 'brez vsebine';
  }
}

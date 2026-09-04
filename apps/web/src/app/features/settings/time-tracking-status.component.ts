import { Component, OnInit, inject } from '@angular/core';
import { IonIcon, IonNote } from '@ionic/angular/standalone';
import { TimeTrackingSetupService } from './time-tracking-setup.service.js';

/** Kontrolni seznam na vrhu zavihka "Beleženje časa": kaj je nastavljeno in kaj še manjka.
 *
 * Zavihek ima tri razdelke obrazcev in noben od njih ne pove, ali je celota uporabna. Ta
 * pas to pove v dveh vrsticah, PREDEN se je treba spustiti čez obrazce — vrstni red je
 * hkrati vrstni red nastavljanja (seja, potem lokacija), ker lokacija brez seje ne more
 * brati strani. */
@Component({
  selector: 'app-time-tracking-status',
  standalone: true,
  imports: [IonIcon, IonNote],
  template: `
    @if (setup.loaded()) {
      <div class="steps">
        <div class="step" [class.done]="setup.hasSession()">
          <ion-icon
            [name]="setup.hasSession() ? 'checkmark-circle-outline' : 'alert-circle-outline'"
            aria-hidden="true"
          ></ion-icon>
          <div class="text">
            <strong>Sejni piškotek</strong>
            <span>{{ sessionDetail() }}</span>
          </div>
        </div>

        <div class="step" [class.done]="setup.hasLocation()">
          <ion-icon
            [name]="setup.hasLocation() ? 'checkmark-circle-outline' : 'alert-circle-outline'"
            aria-hidden="true"
          ></ion-icon>
          <div class="text">
            <strong>Lokacija</strong>
            <span>{{ locationDetail() }}</span>
          </div>
        </div>
      </div>

      @if (!setup.ready()) {
        <ion-note class="summary">{{ nextStep() }}</ion-note>
      }
    }
  `,
  styles: `
    .steps {
      display: grid;
      gap: var(--cd-space-2);
      margin-bottom: var(--cd-space-3);
    }
    .step {
      display: flex;
      align-items: flex-start;
      gap: var(--cd-space-2);
    }
    .step ion-icon {
      flex: none;
      font-size: 1.25rem;
      margin-top: 0.1rem;
      color: var(--ion-color-warning);
    }
    .step.done ion-icon {
      color: var(--ion-color-success);
    }
    .text {
      display: flex;
      flex-direction: column;
      line-height: 1.35;
    }
    .text span {
      font-size: 0.85rem;
      opacity: 0.75;
    }
    .summary {
      display: block;
      font-size: 0.85rem;
    }
  `,
})
export class TimeTrackingStatusComponent implements OnInit {
  protected readonly setup = inject(TimeTrackingSetupService);

  async ngOnInit(): Promise<void> {
    await this.setup.reload();
  }

  protected sessionDetail(): string {
    const sessions = this.setup.sessions();
    if (sessions.length === 0) return 'Ni vpisana — brez nje stran vrne prijavno masko brez gumbov.';
    const names = sessions.map((s) => s.name).join(', ');
    return sessions.length === 1 ? names : `${sessions.length} seje: ${names}`;
  }

  protected locationDetail(): string {
    const active = this.setup.locations().filter((l) => l.active);
    if (active.length === 0) return 'Ni nastavljena — beleženje ne ve, katero stran naj odpre.';
    return active.map((l) => `${l.name} — ${hostOf(l.url) ?? l.url}`).join(' · ');
  }

  protected nextStep(): string {
    if (!this.setup.hasSession()) return 'Naslednji korak: dodaj sejni piškotek v razdelku Sejni piškotek spodaj.';
    return 'Naslednji korak: dodaj lokacijo v razdelku Lokacije spodaj — seja sama za beleženje ne zadošča.';
  }
}

/** Gostitelj brez `www.` — isto skrajšanje kot v meniju (api: modules/time-tracking/tab-detail.ts). */
function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

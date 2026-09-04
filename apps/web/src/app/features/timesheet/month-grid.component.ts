import { Component, input, output } from '@angular/core';
import { formatMinutes, KIND_LABELS, type PreviewDay, type PreviewWeek } from './timesheet.model.js';

// Mreža meseca. Riše natanko to, kar je vrnil `POST /timesheet/preview` — kateri dan je
// vikend, kateri sodi v mesec in koliko ur nosi teden, ve strežnik. Odjemalec te logike NE
// podvaja; brez tega bi ista koledarska pravila obstajala dvakrat in se sčasoma razšla.
@Component({
  selector: 'app-timesheet-month-grid',
  standalone: true,
  template: `
    <div class="grid" role="group" aria-label="Dnevi v mesecu">
      <div class="head">
        @for (label of WEEKDAYS; track label) {
          <span>{{ label }}</span>
        }
        <span class="sum-head">teden</span>
      </div>

      @for (week of weeks(); track week.days[0]!.date) {
        <div class="week">
          @for (day of week.days; track day.date) {
            <button
              type="button"
              class="day"
              [class]="'day kind-' + day.kind"
              [disabled]="day.kind === 'pad' || day.kind === 'weekend'"
              [attr.aria-label]="ariaLabel(day)"
              (click)="dayPicked.emit(day)"
            >
              <span class="num">{{ day.dayOfMonth }}</span>
              @if (day.kind === 'off' || day.kind === 'sick' || day.kind === 'holiday') {
                <span class="mark">{{ mark(day.kind) }}</span>
              }
            </button>
          }
          <span class="sum">{{ formatMinutes(week.totals.work) }}</span>
        </div>
      }
    </div>

    <div class="legend">
      <span class="chip kind-work">Delo</span>
      <span class="chip kind-off">Dopust</span>
      <span class="chip kind-sick">Bolniška</span>
      <span class="chip kind-holiday">Praznik</span>
      <span class="chip kind-weekend">Vikend</span>
    </div>
  `,
  styles: `
    .grid {
      display: flex;
      flex-direction: column;
      gap: var(--cd-space-1);
    }
    .head,
    .week {
      display: grid;
      grid-template-columns: repeat(7, 1fr) 3.5rem;
      gap: var(--cd-space-1);
      align-items: center;
    }
    .head {
      font-size: var(--cd-font-size-xs);
      color: var(--cd-text-muted);
      text-align: center;
    }
    .sum-head,
    .sum {
      text-align: right;
      font-size: var(--cd-font-size-xs);
      color: var(--cd-text-muted);
      font-variant-numeric: tabular-nums;
    }
    .day {
      position: relative;
      aspect-ratio: 1;
      min-height: 2.25rem;
      border: 1px solid var(--cd-divider);
      border-radius: var(--cd-radius-sm);
      background: var(--cd-surface);
      color: inherit;
      font-size: var(--cd-font-size-sm);
      cursor: pointer;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      line-height: 1;
    }
    .day:disabled {
      cursor: default;
    }
    .mark {
      font-size: 0.625rem;
      font-weight: 700;
      letter-spacing: 0.04em;
    }
    .kind-pad {
      opacity: 0.25;
    }
    .kind-weekend {
      background: var(--cd-surface-sunken);
      color: var(--cd-text-muted);
    }
    .kind-off {
      background: rgba(56, 128, 255, 0.16);
      border-color: rgba(56, 128, 255, 0.5);
    }
    .kind-sick {
      background: rgba(235, 68, 90, 0.16);
      border-color: rgba(235, 68, 90, 0.5);
    }
    .kind-holiday {
      background: rgba(255, 196, 9, 0.2);
      border-color: rgba(255, 196, 9, 0.6);
    }
    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: var(--cd-space-2);
      margin-top: var(--cd-space-3);
      font-size: var(--cd-font-size-xs);
    }
    .chip {
      padding: 0.125rem var(--cd-space-2);
      border: 1px solid var(--cd-divider);
      border-radius: var(--cd-radius-sm);
    }
  `,
})
export class MonthGridComponent {
  readonly weeks = input.required<PreviewWeek[]>();
  /** Klik na delovni dan — stran odloči, katera vrsta pride na vrsto (`nextKind`). */
  readonly dayPicked = output<PreviewDay>();

  protected readonly WEEKDAYS = ['po', 'to', 'sr', 'če', 'pe', 'so', 'ne'];
  protected readonly formatMinutes = formatMinutes;

  protected mark(kind: 'off' | 'sick' | 'holiday'): string {
    return KIND_LABELS[kind].slice(0, 3).toUpperCase();
  }

  protected ariaLabel(day: PreviewDay): string {
    if (day.kind === 'pad') return `${day.date}, ni v mesecu`;
    if (day.kind === 'weekend') return `${day.date}, vikend`;
    return `${day.date}, ${KIND_LABELS[day.kind as 'work' | 'off' | 'sick' | 'holiday']}`;
  }
}

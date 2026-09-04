import { Component, input, output } from '@angular/core';

/** Ena celica mreže. Prazna (`inMonth: false`) je dopolnilo do polnega tedna — mreža je vedno
 * cel teden široka, sicer se stolpci dnevov med meseci premikajo. */
export interface CalendarCell {
  date: string;
  dayOfMonth: number;
  inMonth: boolean;
  isToday: boolean;
  status: string;
  reason: string;
  /** Ure akcij tega dne (`HH:MM`). */
  times: string[];
  /** `true` = iz DEJANSKEGA načrta (PlannedAction), `false` = pričakovanje iz urnika. Načrt
   * obstaja samo za danes in jutri (research.md §3), za naprej je to napoved — razlika mora
   * biti vidna, sicer je videti, kot da so vsi dnevi že načrtovani. */
  planned: boolean;
  /** Kratko ime lokacije, na kateri se ta dan beleži (`null`, kadar se ne dela). Iz načrta,
   * če obstaja, sicer iz urnika, ki dan pokriva. */
  locationLabel: string | null;
  selected: boolean;
  inRange: boolean;
}

export const STATUS_LABELS: Record<string, string> = {
  workday: 'delovni dan',
  weekend: 'vikend',
  holiday: 'praznik',
  vacation: 'dopust',
  sick: 'bolniška',
  other: 'odsotnost',
  forced: 'izredni delovni dan',
  unknown: 'brez urnika',
};

/** Oznaka v celici za dneve, ko se ne dela — ura ni nobene, status pa mora biti viden na
 * pogled, brez klika. */
const STATUS_MARKS: Record<string, string> = {
  holiday: 'PRAZ',
  vacation: 'DOP',
  sick: 'BOL',
  other: 'ODS',
  forced: 'IZR',
};

// Mreža meseca za beleženje časa. Vzporednica evidenci (timesheet/month-grid.component.ts) —
// isti razpored, isti razred `kind-*` za barvo statusa — vsebina celice pa je druga: tu so v
// njej URE akcij tega dne, ne število opravljenih ur.
@Component({
  selector: 'app-time-tracking-calendar-grid',
  standalone: true,
  template: `
    <div class="grid" role="group" aria-label="Dnevi v mesecu">
      <div class="head">
        @for (label of WEEKDAYS; track label) {
          <span>{{ label }}</span>
        }
      </div>

      @for (week of weeks(); track week[0]!.date) {
        <div class="week">
          @for (cell of week; track cell.date) {
            <button
              type="button"
              [class]="cellClass(cell)"
              [disabled]="!cell.inMonth"
              [attr.aria-pressed]="cell.selected || cell.inRange"
              [attr.aria-label]="ariaLabel(cell)"
              (click)="dayPicked.emit(cell)"
            >
              <span class="num">{{ cell.dayOfMonth }}</span>
              @if (mark(cell); as text) {
                <span class="mark">{{ text }}</span>
              }
              @if (cell.times.length > 0) {
                <span class="times">
                  @for (time of cell.times.slice(0, 2); track time) {
                    <span class="time">{{ time }}</span>
                  }
                  @if (cell.times.length > 2) {
                    <span class="time more">+{{ cell.times.length - 2 }}</span>
                  }
                </span>
              }
              @if (cell.locationLabel; as location) {
                <span class="location" [title]="location">{{ location }}</span>
              }
            </button>
          }
        </div>
      }
    </div>

    <div class="legend">
      <span class="chip kind-workday">Delovni dan</span>
      <span class="chip kind-vacation">Dopust</span>
      <span class="chip kind-sick">Bolniška</span>
      <span class="chip kind-other">Odsotnost</span>
      <span class="chip kind-holiday">Praznik</span>
      <span class="chip kind-forced">Izredni delovni dan</span>
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
      grid-template-columns: repeat(7, 1fr);
      gap: var(--cd-space-1);
      align-items: stretch;
    }
    .head {
      font-size: var(--cd-font-size-xs);
      color: var(--cd-text-muted);
      text-align: center;
    }
    .day {
      position: relative;
      min-height: 4.25rem;
      padding: 0.25rem 0.125rem;
      border: 1px solid var(--cd-divider);
      border-radius: var(--cd-radius-sm);
      background: var(--cd-surface);
      color: inherit;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.125rem;
      overflow: hidden;
      text-align: center;
    }
    .day:disabled {
      cursor: default;
      opacity: 0.25;
    }
    .num {
      font-size: var(--cd-font-size-sm);
      font-variant-numeric: tabular-nums;
      line-height: 1;
    }
    .times {
      display: flex;
      flex-direction: column;
      gap: 0.0625rem;
    }
    .time {
      font-size: 0.625rem;
      line-height: 1.2;
      font-variant-numeric: tabular-nums;
      opacity: 0.75;
    }
    /* Napovedane ure (še brez načrta) so pisane poševno — načrt za danes/jutri je dejstvo,
       vse naprej je izpeljano iz urnika in se lahko še spremeni. */
    .expected .time {
      font-style: italic;
      opacity: 0.55;
    }
    /* Značka lokacije: kje se ta dan beleži. Brez nje sta dan iz pisarne in dan od doma v
       mreži videti enaka, čeprav pritisneta drug gumb. */
    .location {
      max-width: 100%;
      padding: 0 0.25rem;
      border-radius: 999px;
      background: var(--cd-surface-sunken);
      font-size: 0.5625rem;
      line-height: 1.4;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .mark {
      font-size: 0.625rem;
      font-weight: 700;
      letter-spacing: 0.04em;
    }
    .today {
      outline: 2px solid var(--ion-color-primary);
      outline-offset: -2px;
    }
    .selected,
    .in-range {
      box-shadow: inset 0 0 0 2px var(--ion-color-primary);
    }
    .kind-weekend {
      background: var(--cd-surface-sunken);
      color: var(--cd-text-muted);
    }
    .kind-vacation {
      background: rgba(56, 128, 255, 0.16);
      border-color: rgba(56, 128, 255, 0.5);
    }
    .kind-sick {
      background: rgba(235, 68, 90, 0.16);
      border-color: rgba(235, 68, 90, 0.5);
    }
    .kind-other {
      background: rgba(146, 148, 156, 0.2);
      border-color: rgba(146, 148, 156, 0.55);
    }
    .kind-holiday {
      background: rgba(255, 196, 9, 0.2);
      border-color: rgba(255, 196, 9, 0.6);
    }
    .kind-forced {
      background: rgba(45, 211, 111, 0.18);
      border-color: rgba(45, 211, 111, 0.55);
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
export class CalendarGridComponent {
  readonly weeks = input.required<CalendarCell[][]>();
  readonly dayPicked = output<CalendarCell>();

  protected readonly WEEKDAYS = ['po', 'to', 'sr', 'če', 'pe', 'so', 'ne'];

  protected cellClass(cell: CalendarCell): string {
    return [
      'day',
      `kind-${cell.status}`,
      cell.planned ? 'actual' : 'expected',
      cell.isToday ? 'today' : '',
      cell.selected ? 'selected' : '',
      cell.inRange ? 'in-range' : '',
    ]
      .filter(Boolean)
      .join(' ');
  }

  /**
   * Oznaka statusa se na nedelovnem dnevu izriše VEDNO, tudi kadar ima dan še kakšno uro —
   * npr. akcija, ki se je zjutraj že izvedla, preden je bila bolniška vnesena. Prej je vsaka
   * ura oznako pogoltnila in vnesen dopust je bil v mreži videti kot navaden delovni dan
   * (FR-015: status mora biti viden za VSAK dan).
   *
   * Pri vsiljenem delovnem dnevu je obratno: ure so glavna vsebina in `IZR` samo pojasnilo,
   * zakaj jih dan sploh ima — zato tam ostane oznaka le, dokler ur ni.
   */
  protected mark(cell: CalendarCell): string | null {
    const mark = STATUS_MARKS[cell.status];
    if (!mark) return null;
    if (cell.status === 'forced' && cell.times.length > 0) return null;
    return mark;
  }

  protected ariaLabel(cell: CalendarCell): string {
    const status = STATUS_LABELS[cell.status] ?? cell.status;
    const times = cell.times.length > 0 ? `, akcije: ${cell.times.join(', ')}` : '';
    const location = cell.locationLabel ? `, lokacija: ${cell.locationLabel}` : '';
    return `${cell.date}, ${status}${times}${location}`;
  }
}

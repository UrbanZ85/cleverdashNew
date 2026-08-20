import { Component, input } from '@angular/core';

// FR-026: ob nedosegljivosti vira se prikaže zadnji znani podatek z oznako starosti —
// nikoli prazen zaslon ali tehnično sporočilo. Ta značka je edino mesto, ki to oznako izriše.
@Component({
  selector: 'app-staleness-badge',
  standalone: true,
  template: `<p class="staleness-badge">Zadnji znani podatek — star {{ formattedAge() }}</p>`,
  styles: `
    .staleness-badge {
      opacity: 0.7;
      font-size: 0.85rem;
      margin: 0.25rem 0;
    }
  `,
})
export class StalenessBadgeComponent {
  readonly ageSeconds = input.required<number>();

  formattedAge(): string {
    const s = this.ageSeconds();
    if (s < 60) return `${s} s`;
    if (s < 3600) return `${Math.round(s / 60)} min`;
    return `${Math.round(s / 3600)} h`;
  }
}

import { Component, input } from '@angular/core';

// FR-027, SC-009: navedba vira je funkcionalna zahteva, ne oblikovna podrobnost. Ta
// komponenta je edino mesto, ki jo izriše — nova ploščica z ARSO podatki jo samo uvozi.
@Component({
  selector: 'app-attribution',
  standalone: true,
  template: `
    <a class="attribution" [href]="url()" target="_blank" rel="noopener">{{ text() }}</a>
  `,
  styles: `
    .attribution {
      font-size: 0.75rem;
      opacity: 0.7;
      text-decoration: none;
    }
    .attribution:hover {
      text-decoration: underline;
    }
  `,
})
export class AttributionComponent {
  readonly text = input.required<string>();
  readonly url = input.required<string>();
}

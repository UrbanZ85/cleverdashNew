import { Component, ErrorHandler, inject, signal } from '@angular/core';
import { TileCardComponent } from '../../shared/layout/tile-card.component.js';

// FR-026: izpad ene ploščice ne sme vplivati na druge. Angular nima vgrajene "error
// boundary" komponente (za razliko od nekaterih drugih ogrodij) — enakovreden učinek
// dosežemo s komponentno omejenim `ErrorHandler`, ki prestreže napake samo v svojem
// podrevesu (vsebini, ki jo ta gostitelj oklepa), preden bi lahko podrle preostanek strani.
class TileErrorHandler implements ErrorHandler {
  readonly broken = signal(false);

  handleError(error: unknown): void {
    console.error('Napaka v ploščici — izolirana, ostale ploščice delujejo naprej:', error);
    this.broken.set(true);
  }
}

@Component({
  selector: 'app-tile-host',
  standalone: true,
  imports: [TileCardComponent],
  providers: [{ provide: ErrorHandler, useFactory: () => new TileErrorHandler() }],
  template: `
    @if (handler.broken()) {
      <app-tile-card title="Ploščica ne deluje" icon="alert-circle-outline">
        <p class="cd-muted">Ta ploščica trenutno ne deluje. Ostale ploščice delujejo naprej.</p>
      </app-tile-card>
    } @else {
      <ng-content></ng-content>
    }
  `,
  styles: `
    /* Gostitelj mora zapolniti celico v mreži, sicer se ploščica ob napaki skrči. */
    :host {
      display: block;
      height: 100%;
    }
  `,
})
export class TileHostComponent {
  protected readonly handler = inject(ErrorHandler) as TileErrorHandler;
}

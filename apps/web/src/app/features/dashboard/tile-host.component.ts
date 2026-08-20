import { Component, ErrorHandler, inject, signal } from '@angular/core';
import { IonCard, IonCardContent } from '@ionic/angular/standalone';

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
  imports: [IonCard, IonCardContent],
  providers: [{ provide: ErrorHandler, useFactory: () => new TileErrorHandler() }],
  template: `
    @if (handler.broken()) {
      <ion-card>
        <ion-card-content>Ta ploščica trenutno ne deluje. Ostale ploščice delujejo naprej.</ion-card-content>
      </ion-card>
    } @else {
      <ng-content></ng-content>
    }
  `,
})
export class TileHostComponent {
  protected readonly handler = inject(ErrorHandler) as TileErrorHandler;
}

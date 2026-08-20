import { Component, output } from '@angular/core';
import { IonButton } from '@ionic/angular/standalone';

// Robni primer iz spec.md: "zadnji znani podatek ne obstaja (prvi zagon ob izpadu)" →
// sporočilo, da podatka še ni, in gumb za ponovni poskus — nikoli prazna ploščica.
@Component({
  selector: 'app-no-data',
  standalone: true,
  imports: [IonButton],
  template: `
    <p>Podatka še ni na voljo.</p>
    <ion-button size="small" (click)="retry.emit()">Poskusi znova</ion-button>
  `,
})
export class NoDataComponent {
  readonly retry = output<void>();
}

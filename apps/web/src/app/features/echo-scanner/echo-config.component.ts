import { Component, effect, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonInput, IonItem, IonNote } from '@ionic/angular/standalone';
import type { ScannerConfigForm } from '../../core/scanners/scanner-config-form.js';

// Obrazec testnega tipa `echo` (016, FR-046): eno številsko polje in oznaka. Izpolni
// `ScannerConfigForm`; čarovnik ga vstavi z `NgComponentOutlet` prek registra (scanner-ui.ts).
// Hkrati je PREDLOGA za obrazec bodočega tipa (docs/adding-a-scanner-type.md).

@Component({
  selector: 'app-echo-config',
  standalone: true,
  imports: [FormsModule, IonItem, IonInput, IonNote],
  template: `
    <ion-item>
      <ion-input label="Število rezultatov" labelPlacement="stacked" type="number" inputmode="numeric" min="1" max="20" [(ngModel)]="items" name="items" (ionInput)="sync()"></ion-input>
    </ion-item>
    <ion-item>
      <ion-input label="Oznaka" labelPlacement="stacked" [(ngModel)]="label" name="label" maxlength="40" placeholder="Echo" (ionInput)="sync()"></ion-input>
    </ion-item>
    <ion-note class="cd-section-hint">Testni tip: prvi zagon doda rezultate, tretji enega poceni, četrti enega umakne. Podatki so izmišljeni.</ion-note>
  `,
})
export class EchoConfigComponent implements ScannerConfigForm {
  readonly initial = input<Record<string, unknown> | null>(null);
  readonly config = signal<Record<string, unknown>>({ items: 3, label: 'Echo' });

  items: number | string = 3;
  label = 'Echo';

  constructor() {
    effect(() => {
      const initial = this.initial();
      if (!initial) return;
      if (typeof initial['items'] === 'number') this.items = initial['items'];
      if (typeof initial['label'] === 'string') this.label = initial['label'];
      this.sync();
    });
  }

  sync(): void {
    const items = Number(this.items);
    this.config.set({ items: Number.isFinite(items) ? items : this.items, label: this.label.trim() || 'Echo' });
  }

  validate(): string | null {
    const items = Number(this.items);
    if (!Number.isInteger(items)) return 'Število rezultatov mora biti celo število.';
    if (items < 1) return 'Vsaj en rezultat.';
    if (items > 20) return 'Največ 20 rezultatov.';
    if (this.label.trim().length > 40) return 'Oznaka ima lahko največ 40 znakov.';
    return null;
  }
}

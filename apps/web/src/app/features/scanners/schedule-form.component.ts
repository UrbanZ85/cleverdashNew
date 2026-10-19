import { Component, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonButton, IonInput, IonItem, IonSelect, IonSelectOption } from '@ionic/angular/standalone';
import type { SchedulePreset, SchedulePresetId } from '../../core/scanners/scanners.model.js';

// Skupni obrazec urnika (016, FR-014, FR-015): prednastavitev ali izraz po meri s časovnim pasom.
// Uporabljata ga čarovnik (urnik skenerja) in administracija (urnik tipa). Cron izraza NE
// preverja sam — strežnik vrne slovenski razlog (`validateCron`), ki ga stran pokaže; dve
// preverjanji bi se sčasoma razšli.

export interface ScheduleFormValue {
  preset: SchedulePresetId;
  cronExpression: string;
  timezone: string;
}

@Component({
  selector: 'app-schedule-form',
  standalone: true,
  imports: [FormsModule, IonItem, IonInput, IonSelect, IonSelectOption, IonButton],
  template: `
    <ion-item>
      <ion-select label="Urnik" labelPlacement="stacked" interface="popover" [value]="value().preset" [disabled]="disabled()" (ionChange)="onPreset($any($event).detail.value)" okText="V redu" cancelText="Prekliči">
        @for (p of presets(); track p.id) {
          <ion-select-option [value]="p.id">{{ p.label }}</ion-select-option>
        }
        <ion-select-option value="custom">Po meri (cron izraz)</ion-select-option>
      </ion-select>
    </ion-item>
    @if (value().preset === 'custom' || customOpen()) {
      <ion-item>
        <ion-input label="Cron izraz (minuta ura dan mesec dan-v-tednu)" labelPlacement="stacked" [(ngModel)]="cronDraft" name="cron" placeholder="0 6,18 * * *" [disabled]="disabled()"></ion-input>
        @if (immediate()) {
          <ion-button slot="end" size="small" [disabled]="disabled()" (click)="emit({ cronExpression: cronDraft, preset: 'custom' })">Shrani</ion-button>
        }
      </ion-item>
    }
    <ion-item>
      <ion-input label="Časovni pas" labelPlacement="stacked" [(ngModel)]="tzDraft" name="tz" placeholder="Europe/Ljubljana" [disabled]="disabled()" (ionBlur)="onTimezoneBlur()"></ion-input>
      @if (immediate()) {
        <ion-button slot="end" size="small" [disabled]="disabled()" (click)="emit({ timezone: tzDraft })">Shrani</ion-button>
      }
    </ion-item>
  `,
})
export class ScheduleFormComponent {
  /** Prednastavitve z izrazi (s strežnika, `GET /scanners/types`). */
  readonly presets = input.required<SchedulePreset[]>();
  readonly value = input.required<ScheduleFormValue>();
  readonly disabled = input(false);
  /** `true` = vsaka sprememba se takoj sporoči (administracija shranjuje sproti); `false` =
   * sporoči se ob spremembi polja (čarovnik shrani na koncu). */
  readonly immediate = input(false);
  /** Delni vnos: samo polja, ki jih je uporabnik spremenil. */
  readonly valueChange = output<Partial<ScheduleFormValue>>();

  readonly customOpen = signal(false);
  cronDraft = '';
  tzDraft = 'Europe/Ljubljana';

  ngOnInit(): void {
    this.cronDraft = this.value().cronExpression;
    this.tzDraft = this.value().timezone;
  }

  onPreset(preset: SchedulePresetId): void {
    if (preset === 'custom') {
      this.customOpen.set(true);
      if (!this.immediate()) this.emit({ preset: 'custom', cronExpression: this.cronDraft });
      return;
    }
    this.customOpen.set(false);
    this.emit({ preset });
  }

  onTimezoneBlur(): void {
    if (!this.immediate() && this.tzDraft !== this.value().timezone) this.emit({ timezone: this.tzDraft });
  }

  /** Čarovnik pokliče pred shranjevanjem, da dobi trenutni izraz po meri. */
  currentDraft(): ScheduleFormValue {
    return { preset: this.customOpen() || this.value().preset === 'custom' ? 'custom' : this.value().preset, cronExpression: this.cronDraft, timezone: this.tzDraft };
  }

  emit(partial: Partial<ScheduleFormValue>): void {
    this.valueChange.emit(partial);
  }
}

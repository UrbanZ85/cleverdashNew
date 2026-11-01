import { Component, forwardRef, input, output, signal } from '@angular/core';
import { NG_VALUE_ACCESSOR, type ControlValueAccessor } from '@angular/forms';
import { IonButton, IonDatetime, IonIcon, IonInput, IonModal, IonNote } from '@ionic/angular/standalone';
import { completeTime, formatTimeInput, isValidTime } from './time-field.util.js';

// Polje za uro `HH:MM` (ControlValueAccessor: deluje z `[(ngModel)]` kot `<ion-input type="time">`).
// Na telefonu `type="time"` pogosto ne pokaže tipkovnice ali izbirnika, zato je to besedilno polje s številsko
// tipkovnico (`inputmode="numeric"`), ki med tipkanjem oblikuje `1730` → `17:30` in ob zapustitvi dopolni
// `9` → `09:00`. Vrednost modela je `HH:MM` ali prazen niz (nepopoln ali neveljaven vnos ne uide kot ura).

@Component({
  selector: 'app-time-field',
  standalone: true,
  imports: [IonButton, IonDatetime, IonIcon, IonInput, IonModal, IonNote],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => TimeFieldComponent), multi: true }],
  template: `
    <ion-input
      [label]="label()"
      [labelPlacement]="label() ? 'stacked' : undefined"
      [attr.aria-label]="label() ? null : ariaLabel()"
      type="text"
      inputmode="numeric"
      enterkeyhint="done"
      autocomplete="off"
      maxlength="5"
      placeholder="HH:MM"
      [value]="text()"
      [disabled]="disabled()"
      (ionInput)="onInput($any($event))"
      (ionBlur)="onBlur()"
    >
      <ion-button slot="end" fill="clear" type="button" aria-label="Izberi uro" [disabled]="disabled()" (click)="openPicker()">
        <ion-icon slot="icon-only" name="time-outline"></ion-icon>
      </ion-button>
    </ion-input>
    <ion-modal [isOpen]="pickerOpen()" (didDismiss)="pickerOpen.set(false)" class="time-modal">
      <ng-template>
        <ion-datetime
          presentation="time"
          hourCycle="h23"
          [value]="pickerValue()"
          [showDefaultButtons]="true"
          doneText="V redu"
          cancelText="Prekliči"
          (ionChange)="onPick($any($event))"
          (ionCancel)="pickerOpen.set(false)"
        ></ion-datetime>
      </ng-template>
    </ion-modal>
    @if (invalid()) {
      <ion-note color="danger" class="err">Vpiši uro kot HH:MM (npr. 17:30).</ion-note>
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .err {
        display: block;
        font-size: var(--cd-font-size-xs);
        padding: 2px var(--cd-space-3);
      }
    `,
  ],
})
export class TimeFieldComponent implements ControlValueAccessor {
  readonly label = input<string>('');
  readonly ariaLabel = input<string>('Ura');
  /** Sproži se po tem, ko je model posodobljen (zamenjava za `(ionChange)` pri `ion-input`). */
  readonly valueChange = output<string>();

  readonly text = signal('');
  readonly disabled = signal(false);
  readonly invalid = signal(false);
  readonly pickerOpen = signal(false);

  private onChangeFn: (value: string) => void = () => undefined;
  private onTouchedFn: () => void = () => undefined;
  private last = '';

  writeValue(value: unknown): void {
    // Strežnik lahko vrne HH:MM:SS; polje kaže HH:MM.
    const v = typeof value === 'string' ? value.slice(0, 5) : '';
    this.text.set(v);
    this.last = isValidTime(v) ? v : '';
    this.invalid.set(false);
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChangeFn = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouchedFn = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }

  onInput(event: CustomEvent<{ value?: string | null }>): void {
    const formatted = formatTimeInput(String(event.detail.value ?? ''));
    this.text.set(formatted);
    // Vrni oblikovano besedilo v polje, tudi kadar se signal ni spremenil (ionic bi sicer pustil tipkano).
    const target = event.target as { value?: string } | null;
    if (target) target.value = formatted;
    this.invalid.set(false);
    this.emit(isValidTime(formatted) ? formatted : '');
  }

  /** ISO vrednost za `ion-datetime` (samo ura je pomembna); prazno polje začne ob 12:00. */
  pickerValue(): string {
    const t = isValidTime(this.text()) ? this.text() : '12:00';
    return `2000-01-01T${t}:00`;
  }

  openPicker(): void {
    if (!this.disabled()) this.pickerOpen.set(true);
  }

  onPick(event: CustomEvent<{ value?: string | string[] | null }>): void {
    const raw = event.detail.value;
    const iso = Array.isArray(raw) ? raw[0] : raw;
    const m = iso ? /T(\d{2}:\d{2})/.exec(iso) : null;
    if (m?.[1] && isValidTime(m[1])) {
      this.text.set(m[1]);
      this.invalid.set(false);
      this.emit(m[1]);
    }
    this.pickerOpen.set(false);
    this.onTouchedFn();
  }

  onBlur(): void {
    const raw = this.text();
    if (raw === '') {
      this.invalid.set(false);
    } else {
      const done = isValidTime(raw) ? raw : completeTime(raw);
      this.text.set(done);
      this.invalid.set(done === '');
      this.emit(done);
    }
    this.onTouchedFn();
  }

  private emit(value: string): void {
    if (value === this.last) return;
    this.last = value;
    this.onChangeFn(value);
    this.valueChange.emit(value);
  }
}

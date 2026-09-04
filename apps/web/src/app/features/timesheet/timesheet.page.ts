import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Capacitor } from '@capacitor/core';
import {
  IonContent,
  IonItem,
  IonInput,
  IonSelect,
  IonSelectOption,
  IonButton,
  IonNote,
  IonText,
  IonSpinner,
} from '@ionic/angular/standalone';
import { PageHeaderComponent } from '../../shared/layout/page-header.component.js';
import { CurrentUserService } from '../../core/user/current-user.service.js';
import { MonthGridComponent } from './month-grid.component.js';
import { TimesheetApi } from './timesheet.api.js';
import {
  applyKind,
  currentYearMonth,
  formatHm,
  formatMinutes,
  nextKind,
  MONTH_NAMES,
  type PreviewDay,
  type TimesheetForm,
  type TimesheetPreview,
} from './timesheet.model.js';

// Zavihek "Evidenca delovnega časa" (register: platform/tabs/registry.ts, id `timesheet`).
// Prenos samostojne aplikacije Kaja_EDC: obrazec pošlje mesec, ime, tedenske ure, delovni čas
// in dneve odsotnosti, strežnik pa vrne .xlsx po predlogi delodajalca.
//
// Vsak vnos se najprej pokaže v predogledu (`POST /timesheet/preview`) in šele nato prenese —
// uporabnik vidi seštevke, preden datoteko odda naprej.
@Component({
  selector: 'app-timesheet-page',
  standalone: true,
  imports: [
    FormsModule,
    PageHeaderComponent,
    MonthGridComponent,
    IonContent,
    IonItem,
    IonInput,
    IonSelect,
    IonSelectOption,
    IonButton,
    IonNote,
    IonText,
    IonSpinner,
  ],
  template: `
    <app-page-header title="Evidenca delovnega časa"></app-page-header>
    <ion-content class="ion-padding">
      <section>
        <h2>Mesec</h2>
        <ion-item>
          <ion-select label="Mesec" labelPlacement="stacked" [(ngModel)]="month" (ionChange)="refresh()">
            @for (name of MONTH_NAMES; track name; let i = $index) {
              <ion-select-option [value]="i + 1">{{ name }}</ion-select-option>
            }
          </ion-select>
        </ion-item>
        <ion-item>
          <ion-select label="Leto" labelPlacement="stacked" [(ngModel)]="year" (ionChange)="refresh()">
            @for (option of yearOptions; track option) {
              <ion-select-option [value]="option">{{ option }}</ion-select-option>
            }
          </ion-select>
        </ion-item>
      </section>

      <section>
        <h2>Podatki na dokumentu</h2>
        <ion-item>
          <ion-input
            label="Ime in priimek"
            labelPlacement="stacked"
            [(ngModel)]="fullName"
            (ionBlur)="refresh()"
          ></ion-input>
        </ion-item>
        <ion-item>
          <ion-input
            label="Tedenske delovne ure"
            labelPlacement="stacked"
            type="number"
            [(ngModel)]="weeklyWorkHours"
            (ionBlur)="refresh()"
          ></ion-input>
        </ion-item>
      </section>

      <section>
        <h2>Delovni čas</h2>
        <ion-note class="hint">Velja za vsak delovni dan v mesecu; odsotnosti se odštejejo spodaj.</ion-note>
        <ion-item>
          <ion-input label="Prihod" labelPlacement="stacked" type="time" [(ngModel)]="arrival" (ionChange)="refresh()"></ion-input>
        </ion-item>
        <ion-item>
          <ion-input label="Odhod" labelPlacement="stacked" type="time" [(ngModel)]="departure" (ionChange)="refresh()"></ion-input>
        </ion-item>
        <ion-item>
          <ion-input label="Malica od" labelPlacement="stacked" type="time" [(ngModel)]="breakStart" (ionChange)="refresh()"></ion-input>
        </ion-item>
        <ion-item>
          <ion-input label="Malica do" labelPlacement="stacked" type="time" [(ngModel)]="breakEnd" (ionChange)="refresh()"></ion-input>
        </ion-item>
        <ion-button expand="block" fill="outline" [disabled]="savingDefaults()" (click)="saveDefaults()">
          {{ savingDefaults() ? 'Shranjujem ...' : 'Shrani kot privzeto' }}
        </ion-button>
        @if (defaultsSaved()) {
          <ion-text color="success"><p>Privzetki so shranjeni — naslednji mesec bodo že izpolnjeni.</p></ion-text>
        }
      </section>

      <section>
        <h2>Dnevi</h2>
        <ion-note class="hint">
          Klik na delovni dan ga zavrti med: delo → dopust → bolniška → praznik. Sobote in nedelje
          niso delovni dnevi in se ne dajo označiti.
        </ion-note>
        @if (preview(); as data) {
          <app-timesheet-month-grid [weeks]="data.weeks" (dayPicked)="cycleDay($event)"></app-timesheet-month-grid>

          <dl class="totals">
            <div><dt>Redne ure</dt><dd>{{ formatMinutes(data.totals.work) }}</dd></div>
            <div><dt>Dopust</dt><dd>{{ formatMinutes(data.totals.off) }}</dd></div>
            <div><dt>Bolniška</dt><dd>{{ formatMinutes(data.totals.sick) }}</dd></div>
            <div><dt>Prazniki</dt><dd>{{ formatMinutes(data.totals.holiday) }}</dd></div>
            <div><dt>Mesečna obveza</dt><dd>{{ data.nominalMonthHours }}:00</dd></div>
          </dl>
        } @else if (!error()) {
          <ion-spinner aria-label="Nalagam predogled"></ion-spinner>
        }
      </section>

      @if (error()) {
        <ion-text color="danger"><p>{{ error() }}</p></ion-text>
      }

      @if (isAndroid) {
        <ion-note class="hint">
          V aplikaciji za Android se datoteka ne shrani sama — evidenco prenesi v brskalniku.
        </ion-note>
      }

      <ion-button expand="block" [disabled]="downloading() || !preview()" (click)="download()">
        {{ downloading() ? 'Pripravljam ...' : 'Prenesi evidenco (.xlsx)' }}
      </ion-button>
    </ion-content>
  `,
  styles: `
    section {
      margin-bottom: var(--cd-space-5);
    }
    h2 {
      font-size: var(--cd-font-size-md);
      font-weight: 650;
      margin: 0 0 var(--cd-space-2);
    }
    .hint {
      display: block;
      font-size: var(--cd-font-size-xs);
      color: var(--cd-text-muted);
      margin-bottom: var(--cd-space-2);
    }
    .totals {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr));
      gap: var(--cd-space-2);
      margin: var(--cd-space-4) 0 0;
    }
    .totals div {
      border: 1px solid var(--cd-divider);
      border-radius: var(--cd-radius-sm);
      padding: var(--cd-space-2);
    }
    .totals dt {
      font-size: var(--cd-font-size-xs);
      color: var(--cd-text-muted);
    }
    .totals dd {
      margin: 0;
      font-size: var(--cd-font-size-lg);
      font-variant-numeric: tabular-nums;
    }
  `,
})
export class TimesheetPage implements OnInit {
  private readonly api = inject(TimesheetApi);
  private readonly currentUser = inject(CurrentUserService);

  protected readonly MONTH_NAMES = MONTH_NAMES;
  protected readonly formatMinutes = formatMinutes;
  protected readonly isAndroid = Capacitor.getPlatform() === 'android';

  year = currentYearMonth().year;
  month = currentYearMonth().month;
  fullName = '';
  weeklyWorkHours = 40;
  arrival = '09:00';
  departure = '17:00';
  breakStart = '12:30';
  breakEnd = '13:00';

  private sickDays: number[] = [];
  private holidays: number[] = [];
  private offDays: number[] = [];

  protected readonly yearOptions = [this.year - 2, this.year - 1, this.year, this.year + 1];
  protected readonly preview = signal<TimesheetPreview | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly downloading = signal(false);
  protected readonly savingDefaults = signal(false);
  protected readonly defaultsSaved = signal(false);

  async ngOnInit(): Promise<void> {
    await this.loadDefaults();
    await this.refresh();
  }

  private formValue(): TimesheetForm {
    return {
      year: Number(this.year),
      month: Number(this.month),
      fullName: this.fullName,
      weeklyWorkHours: Number(this.weeklyWorkHours),
      arrival: this.arrival,
      departure: this.departure,
      breakStart: this.breakStart,
      breakEnd: this.breakEnd,
      sickDays: this.sickDays,
      holidays: this.holidays,
      offDays: this.offDays,
    };
  }

  private async loadDefaults(): Promise<void> {
    try {
      const defaults = await this.api.readDefaults();
      this.weeklyWorkHours = defaults.weeklyWorkHours;
      this.arrival = formatHm(defaults.schedule.arrival);
      this.departure = formatHm(defaults.schedule.departure);
      this.breakStart = formatHm(defaults.schedule.breakStart);
      this.breakEnd = formatHm(defaults.schedule.breakEnd);
      // Ime predlaga prijavljeni uporabnik, dokler ga uporabnik ne shrani — evidenca se lahko
      // izpolnjuje tudi za koga drugega, zato je to predlog in ne strežniški privzetek.
      if (defaults.fullName) {
        this.fullName = defaults.fullName;
      } else {
        await this.currentUser.ensureLoaded();
        this.fullName = this.currentUser.user()?.displayName ?? '';
      }
    } catch {
      // Brez privzetkov se dela z vrednostmi iz obrazca — evidenca je še vedno mogoča.
    }
  }

  protected async refresh(): Promise<void> {
    this.defaultsSaved.set(false);
    try {
      this.preview.set(await this.api.preview(this.formValue()));
      this.error.set(null);
    } catch (err) {
      this.error.set(await this.messageOf(err, 'Predogleda ni bilo mogoče izračunati.'));
    }
  }

  protected async cycleDay(day: PreviewDay): Promise<void> {
    const next = applyKind(this.formValue(), day.dayOfMonth, nextKind(day.kind));
    this.sickDays = next.sickDays;
    this.holidays = next.holidays;
    this.offDays = next.offDays;
    await this.refresh();
  }

  protected async saveDefaults(): Promise<void> {
    this.savingDefaults.set(true);
    this.defaultsSaved.set(false);
    try {
      await this.api.saveDefaults(this.formValue());
      this.defaultsSaved.set(true);
      this.error.set(null);
    } catch (err) {
      this.error.set(await this.messageOf(err, 'Privzetkov ni bilo mogoče shraniti.'));
    } finally {
      this.savingDefaults.set(false);
    }
  }

  protected async download(): Promise<void> {
    this.downloading.set(true);
    try {
      const blob = await this.api.workbook(this.formValue());
      const fileName = this.preview()?.fileName ?? 'evidenca.xlsx';
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);
      this.error.set(null);
    } catch (err) {
      this.error.set(await this.messageOf(err, 'Evidence ni bilo mogoče pripraviti.'));
    } finally {
      this.downloading.set(false);
    }
  }

  /**
   * Strežnik vrača `application/problem+json`; njegov `detail` je pisan za uporabnika (FR-026).
   * Pri zahtevi z `responseType: 'blob'` pride tudi telo NAPAKE kot `Blob`, ne kot razčlenjen
   * JSON — brez tega bi bilo prav pri prenosu datoteke vsako sporočilo strežnika izgubljeno.
   */
  private async messageOf(err: unknown, fallback: string): Promise<string> {
    const payload = (err as { error?: unknown } | null)?.error;
    if (payload instanceof Blob) {
      try {
        const parsed = JSON.parse(await payload.text()) as { detail?: string };
        if (parsed.detail) return parsed.detail;
      } catch {
        /* odgovor ni problem+json */
      }
    }
    const detail = (payload as { detail?: string } | null)?.detail;
    return typeof detail === 'string' && detail.length > 0 ? detail : fallback;
  }
}

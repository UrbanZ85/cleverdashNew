import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { apiUrl } from '../../core/api/api-base.js';
import {
  parseHm,
  toRequestBody,
  type StoredDefaults,
  type TimesheetForm,
  type TimesheetPreview,
} from './timesheet.model.js';

// Odjemalec modula "Evidenca delovnega časa". Uvaža samo iz `core/` in iz lastne mape —
// nikoli iz druge funkcionalnosti pod `features/` (člen I).

@Injectable({ providedIn: 'root' })
export class TimesheetApi {
  private readonly http = inject(HttpClient);

  preview(form: TimesheetForm): Promise<TimesheetPreview> {
    return firstValueFrom(
      this.http.post<TimesheetPreview>(apiUrl('/timesheet/preview'), toRequestBody(form), {
        withCredentials: true,
      }),
    );
  }

  workbook(form: TimesheetForm): Promise<Blob> {
    return firstValueFrom(
      this.http.post(apiUrl('/timesheet/workbook'), toRequestBody(form), {
        responseType: 'blob',
        withCredentials: true,
      }),
    );
  }

  readDefaults(): Promise<StoredDefaults> {
    return firstValueFrom(
      this.http.get<StoredDefaults>(apiUrl('/timesheet/defaults'), { withCredentials: true }),
    );
  }

  saveDefaults(form: TimesheetForm): Promise<StoredDefaults> {
    return firstValueFrom(
      this.http.put<StoredDefaults>(
        apiUrl('/timesheet/defaults'),
        {
          fullName: form.fullName.trim() || null,
          weeklyWorkHours: form.weeklyWorkHours,
          schedule: {
            arrival: parseHm(form.arrival),
            departure: parseHm(form.departure),
            breakStart: parseHm(form.breakStart),
            breakEnd: parseHm(form.breakEnd),
          },
        },
        { withCredentials: true },
      ),
    );
  }
}

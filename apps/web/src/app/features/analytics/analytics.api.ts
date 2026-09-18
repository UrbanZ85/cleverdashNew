import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { apiUrl } from '../../core/api/api-base.js';
import type { StorageSnapshot, UsageSnapshot } from './analytics.model.js';

// Odjemalec za `/analytics/*`. Nobene logike: vsaka številka, ki jo zaslon pokaže, pride tako, kot
// jo pošlje strežnik (SC-005) — seštevanja na odjemalcu ni, sicer bi se vmesnik in klic lahko
// razšla in bi bila pogodba samo videti izpolnjena.

@Injectable({ providedIn: 'root' })
export class AnalyticsApi {
  private readonly http = inject(HttpClient);

  storage(fresh = false): Promise<StorageSnapshot> {
    const query = fresh ? '?fresh=true' : '';
    return firstValueFrom(
      this.http.get<StorageSnapshot>(apiUrl(`/analytics/storage${query}`), { withCredentials: true }),
    );
  }

  usage(days: number): Promise<UsageSnapshot> {
    return firstValueFrom(
      this.http.get<UsageSnapshot>(apiUrl(`/analytics/usage?days=${days}`), { withCredentials: true }),
    );
  }
}

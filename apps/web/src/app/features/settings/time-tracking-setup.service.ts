import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { apiUrl } from '../../core/api/api-base.js';

export interface SetupSession {
  id: string;
  name: string;
  status: 'active' | 'expiring' | 'expired' | 'unknown';
}

export interface SetupLocation {
  id: string;
  name: string;
  url: string;
  sessionId: string;
  active: boolean;
}

// Beleženje časa potrebuje DVOJE: sejni piškotek IN lokacijo. Doslej tega ni povedalo nič —
// Nastavitve so bili trije razdelki obrazcev drug pod drugim, vsak s svojim stanjem, in
// lokacija je bila pod dolgim obrazcem za sejo, kjer je ni bilo videti. Posledica v praksi:
// seja vpisana, lokacije ni, Diagnostika vrne 404 "Lokacija ni najdena" in videti je kot
// okvara brskalnika, čeprav zahteva do portala sploh ne pride
// (modules/time-tracking/services/location-resolver.service.ts).
//
// Ta storitev je EN vir resnice o tem, kaj od obojega že obstaja: značka v naslovu razdelka
// in kontrolni seznam na vrhu zavihka berejo isto stanje, razdelka za sejo in lokacije pa ga
// po vsaki spremembi osvežita. Brez nje bi vsak od njih štel po svoje in bi se razhajali.
@Injectable({ providedIn: 'root' })
export class TimeTrackingSetupService {
  private readonly http = inject(HttpClient);

  readonly sessions = signal<SetupSession[]>([]);
  readonly locations = signal<SetupLocation[]>([]);
  /** Dokler prvo branje ne uspe, se stanje NE trdi — prazen seznam ob napaki omrežja ni
   * isto kot "ni nastavljeno" in bi lagal ravno tam, kjer naj bi pomagal. */
  readonly loaded = signal(false);

  readonly hasSession = computed(() => this.sessions().length > 0);
  readonly hasLocation = computed(() => this.locations().some((l) => l.active));
  readonly ready = computed(() => this.hasSession() && this.hasLocation());

  async reload(): Promise<void> {
    try {
      const [sessions, locations] = await Promise.all([
        firstValueFrom(this.http.get<SetupSession[]>(apiUrl('/time-tracking/sessions'), { withCredentials: true })),
        firstValueFrom(this.http.get<SetupLocation[]>(apiUrl('/time-tracking/locations'), { withCredentials: true })),
      ]);
      this.sessions.set(sessions);
      this.locations.set(locations);
      this.loaded.set(true);
    } catch {
      // FR-026 duh: ob napaki ostane prejšnje znano stanje, `loaded` pa nedotaknjen.
    }
  }
}

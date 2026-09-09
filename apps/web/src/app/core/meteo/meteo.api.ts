import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { apiUrl } from '../api/api-base.js';
import type { MeteoHistory, MeteoStationList } from './meteo.model.js';

export type * from './meteo.model.js';

// Odjemalec za `/meteo/*`. Vsi trije odjemalci gredo skozenj: zavihek z grafi, ploščica na
// nadzorni plošči in zaslon z nastavitvami (seznam postaj).
//
// Člen VIII: ARSO se nikoli ne kliče iz brskalnika — vse teče prek našega strežnika, ki ima
// predpomnilnik. Ta razred zato pozna samo naše poti.
@Injectable({ providedIn: 'root' })
export class MeteoApi {
  private readonly http = inject(HttpClient);
  private readonly opts = { withCredentials: true } as const;

  /**
   * Meritve izbrane postaje.
   *
   * `raw` doda posamezne meritve (10- ali 30-minutne): zavihek jih potrebuje za gladko črto,
   * ploščici pa zadostujejo urne vrednosti in njen odgovor je s tem desetkrat manjši.
   */
  history(options: { hours?: number; station?: string | null; raw?: boolean } = {}): Promise<MeteoHistory> {
    const params = new URLSearchParams();
    if (options.hours) params.set('hours', String(options.hours));
    if (options.station) params.set('station', options.station);
    if (options.raw) params.set('raw', 'true');
    const suffix = params.size > 0 ? `?${params.toString()}` : '';
    return firstValueFrom(this.http.get<MeteoHistory>(apiUrl(`/meteo/history${suffix}`), this.opts));
  }

  /** Seznam vseh ARSO samodejnih postaj za izbiro v nastavitvah. */
  stations(): Promise<MeteoStationList> {
    return firstValueFrom(this.http.get<MeteoStationList>(apiUrl('/meteo/stations'), this.opts));
  }
}

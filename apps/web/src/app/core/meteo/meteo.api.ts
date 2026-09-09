import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { apiUrl } from '../api/api-base.js';
import type { MeteoHistory, MeteoSelection, MeteoStationList } from './meteo.model.js';

export type * from './meteo.model.js';

// Odjemalec za `/meteo/*`. Vsi trije odjemalci gredo skozenj: zavihek z grafi, ploščica na
// nadzorni plošči in zaslon z nastavitvami (seznam postaj).
//
// Člen VIII: ponudnika meritev se nikoli ne kliče iz brskalnika — vse teče prek našega
// strežnika, ki ima predpomnilnik in ki edini pozna posebnosti posameznega vira (Neverin
// zahteva glavo `Origin`, ARSO vrača HTML). Ta razred zato pozna samo naše poti.
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

  /**
   * Postaje za izbiro v nastavitvah — obeh ponudnikov v enem seznamu.
   *
   * Filtriranje je NEOBVEZNO in privzeto se prenese vse: postaj je ~1440 in to je ob
   * stiskanju nekaj deset kilobajtov, ki se prenesejo enkrat ob odprtju nastavitev, iskanje
   * po njih pa je s tem takojšnje in brez klica na vsak vtipkan znak. `provider` in `q` sta
   * tu zato, ker ju zahteva člen III (kar zmore vmesnik, mora zmoči tudi klic), in za
   * odjemalce, ki celega seznama nočejo.
   */
  stations(options: { provider?: string; q?: string; limit?: number } = {}): Promise<MeteoStationList> {
    const params = new URLSearchParams();
    if (options.provider) params.set('provider', options.provider);
    if (options.q) params.set('q', options.q);
    if (options.limit) params.set('limit', String(options.limit));
    const suffix = params.size > 0 ? `?${params.toString()}` : '';
    return firstValueFrom(this.http.get<MeteoStationList>(apiUrl(`/meteo/stations${suffix}`), this.opts));
  }

  /**
   * Izbrane postaje z imeni — preklopnik na zavihku.
   *
   * Zakaj ne bere iz `/settings`: tam so samo sklici (`neverin:sveta-marina`), čipi pa
   * potrebujejo IMENA. Brez tega bi moral zavihek prenesti seznam vseh postaj, da izriše tri
   * čipe.
   */
  selection(): Promise<MeteoSelection> {
    return firstValueFrom(this.http.get<MeteoSelection>(apiUrl('/meteo/selection'), this.opts));
  }
}

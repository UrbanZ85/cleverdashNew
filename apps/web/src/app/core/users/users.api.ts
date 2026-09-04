import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { apiUrl } from '../api/api-base.js';

// Imenik uporabnikov za izbiro osebe.
//
// Živi v `core/`, ne v `features/todos/`: izbira osebe ni pojem opravil in jo bo potreboval
// vsak naslednji zavihek, ki bo kaj delil. Uvoz med funkcionalnostmi pod `features/` je
// prepovedan (člen I, eslint.config.js), zato bi bila kopija edina druga možnost.
//
// Strežniška stran je prav tako v skupni plasti: `platform/users/router.ts`, ne v modulu.

export interface DirectoryUser {
  id: string;
  displayName: string;
  initials: string;
  /** ZAMASKIRANA e-pošta (`j…k@agenda.si`) — cel naslov strežnik ne vrne nikoli (FR-072).
   * Namenjena je izključno razločevanju soimenjakov v izbirniku. */
  emailHint: string;
}

@Injectable({ providedIn: 'root' })
export class UsersApi {
  private readonly http = inject(HttpClient);

  list(params: { query?: string; excludeSelf?: boolean } = {}): Promise<DirectoryUser[]> {
    const search = new URLSearchParams();
    if (params.query?.trim()) search.set('query', params.query.trim());
    if (params.excludeSelf === false) search.set('excludeSelf', 'false');
    const suffix = search.size > 0 ? `?${search.toString()}` : '';

    return firstValueFrom(
      this.http.get<{ users: DirectoryUser[] }>(apiUrl(`/users${suffix}`), { withCredentials: true }),
    ).then((res) => res.users);
  }
}

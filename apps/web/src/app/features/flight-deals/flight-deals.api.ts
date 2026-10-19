import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { apiUrl } from '../../core/api/api-base.js';
import type {
  Airport,
  Country,
  FlightSearch,
  Limits,
  Offer,
  OfferDetail,
  OfferList,
  OfferSort,
  Overview,
  ProviderPublic,
  SearchInput,
  SearchPreview,
} from './flight-deals.model.js';

// Odjemalec modula Leti. Uvaža samo iz `core/` in lastne mape (člen I). Vsaka mutacija iskanja vrne
// CELO novo iskanje; vse metode so Promise prek `firstValueFrom` (vzorec 010/013). Administracija
// (urnik, zagoni, outbox) je od 016 v jedru skenerjev: core/scanners/scanners.api.ts.

@Injectable({ providedIn: 'root' })
export class FlightDealsApi {
  private readonly http = inject(HttpClient);
  private readonly opts = { withCredentials: true } as const;

  private path(suffix = ''): string {
    return apiUrl(`/flight-deals${suffix}`);
  }

  overview(limit = 20): Promise<Overview> {
    return firstValueFrom(this.http.get<Overview>(this.path(`/overview?limit=${limit}`), this.opts));
  }

  listSearches(): Promise<{ searches: FlightSearch[]; limits: Limits }> {
    return firstValueFrom(this.http.get<{ searches: FlightSearch[]; limits: Limits }>(this.path('/searches'), this.opts));
  }

  getSearch(id: string): Promise<FlightSearch> {
    return firstValueFrom(this.http.get<FlightSearch>(this.path(`/searches/${id}`), this.opts));
  }

  createSearch(input: SearchInput): Promise<FlightSearch> {
    return firstValueFrom(this.http.post<FlightSearch>(this.path('/searches'), input, this.opts));
  }

  /** Izpuščeno polje = "ne spreminjaj". */
  updateSearch(id: string, patch: Partial<SearchInput>): Promise<FlightSearch> {
    return firstValueFrom(this.http.patch<FlightSearch>(this.path(`/searches/${id}`), patch, this.opts));
  }

  deleteSearch(id: string): Promise<{ deleted: boolean }> {
    return firstValueFrom(this.http.delete<{ deleted: boolean }>(this.path(`/searches/${id}`), this.opts));
  }

  preview(input: SearchInput): Promise<SearchPreview> {
    return firstValueFrom(this.http.post<SearchPreview>(this.path('/searches/preview'), input, this.opts));
  }

  setRecipient(searchId: string, userId: string, notify = true): Promise<FlightSearch> {
    return firstValueFrom(this.http.put<FlightSearch>(this.path(`/searches/${searchId}/recipients/${userId}`), { notify }, this.opts));
  }

  removeRecipient(searchId: string, userId: string): Promise<FlightSearch> {
    return firstValueFrom(this.http.delete<FlightSearch>(this.path(`/searches/${searchId}/recipients/${userId}`), this.opts));
  }

  listOffers(params: { scope?: 'all' | 'own' | 'shared'; searchId?: string; changed?: boolean; sort?: OfferSort; includeUnavailable?: boolean; limit?: number } = {}): Promise<OfferList> {
    const search = new URLSearchParams();
    if (params.scope) search.set('scope', params.scope);
    if (params.searchId) search.set('searchId', params.searchId);
    if (params.changed !== undefined) search.set('changed', String(params.changed));
    if (params.sort) search.set('sort', params.sort);
    if (params.includeUnavailable) search.set('includeUnavailable', 'true');
    if (params.limit) search.set('limit', String(params.limit));
    const suffix = search.size > 0 ? `?${search.toString()}` : '';
    return firstValueFrom(this.http.get<OfferList>(this.path(`/offers${suffix}`), this.opts));
  }

  getOffer(id: string): Promise<OfferDetail> {
    return firstValueFrom(this.http.get<OfferDetail>(this.path(`/offers/${id}`), this.opts));
  }

  searchOffers(searchId: string, sort: OfferSort = 'price', limit = 100): Promise<OfferList> {
    return firstValueFrom(this.http.get<OfferList>(this.path(`/searches/${searchId}/offers?sort=${sort}&limit=${limit}`), this.opts));
  }

  airports(params: { q?: string; near?: string; radiusKm?: number; limit?: number }): Promise<{ airports: Airport[]; total: number }> {
    const search = new URLSearchParams();
    if (params.q?.trim()) search.set('q', params.q.trim());
    if (params.near) search.set('near', params.near);
    if (params.radiusKm) search.set('radiusKm', String(params.radiusKm));
    if (params.limit) search.set('limit', String(params.limit));
    return firstValueFrom(this.http.get<{ airports: Airport[]; total: number }>(this.path(`/airports?${search.toString()}`), this.opts));
  }

  countries(): Promise<Country[]> {
    return firstValueFrom(this.http.get<{ countries: Country[] }>(this.path('/countries'), this.opts)).then((r) => r.countries);
  }

  providers(): Promise<ProviderPublic[]> {
    return firstValueFrom(this.http.get<{ providers: ProviderPublic[] }>(this.path('/providers'), this.opts)).then((r) => r.providers);
  }
}

export type { Offer };

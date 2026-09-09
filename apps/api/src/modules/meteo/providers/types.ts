import type { Fetcher } from '../../../platform/cache/service.js';
import type { loadEnv } from '../../../platform/config/env.js';
import type { MeteoProviderId } from '../../../domain/meteo-station-ref.js';
import type { ParsedStationHistory, ProviderStation } from '../domain/measurement.js';

// Kaj mora znati ponudnik meritev, da ga zavihek zna pokazati.
//
// Zakaj vmesnik in ne dve veji `if (provider === 'arso')` v routerju: veje bi bile štiri
// (zgodovina, seznam, navedba vira, naslov strani) na treh mestih, in tretji ponudnik bi
// pomenil dvanajst novih. Tu je ponudnik ena datoteka, ki jo je treba dodati, in ena vrstica
// v `index.ts` — enak dogovor kot pri registru zavihkov (člen I).
//
// Ponudnik NIKOLI ne prenaša sam. Vrne OPIS prenosa (`SourceRequest`), prenese pa router prek
// `platform/cache/service.ts` — člen VIII zahteva, da gre vsak zunanji klic skozi skupni
// predpomnilnik, in tega pravila ni mogoče uveljaviti, če vsak ponudnik kliče po svoje.
// Razčlenjevanje je zato čista funkcija nad nizom (člen IX): testira se brez omrežja.

export type Env = ReturnType<typeof loadEnv>;

/** Opis enega prenosa: kam, pod katerim ključem in za kako dolgo. */
export interface SourceRequest {
  /** Ključ predpomnilnika. Ključa se po UPORABNIKU nikoli ne veže — vsebina je javna in
   * enaka za vse, zato si dva uporabnika z isto postajo delita en prenos (člen VIII). */
  key: string;
  sourceUrl: string;
  ttlSeconds: number;
  fetcher: Fetcher;
}

export interface ProviderAttribution {
  /** Besedilo navedbe, kot se izpiše ("Vir: ARSO"). */
  text: string;
  /** Naslov ponudnika. */
  url: string;
}

export interface StationProvider {
  readonly id: MeteoProviderId;
  /** Ime ponudnika za vmesnik ("ARSO", "Neverin"). */
  readonly label: string;
  readonly attribution: ProviderAttribution;

  /**
   * Naslov strani, ki jo o tej postaji odpre ČLOVEK.
   *
   * Ni nujno naslov, s katerega strežnik bere: pri Neverinu so meritve na `core.neverin.hr`
   * (JSON za njihovo stran), človeku pa je treba ponuditi `www.neverin.hr/postaja/<oznaka>/`.
   * Pri ARSO sta oba naslova ista stran.
   */
  stationPageUrl(env: Env, stationId: string): string;

  /**
   * Prenos zgodovine ene postaje — VEDNO celotnega okna, ki ga vir hrani (dva dneva).
   *
   * Okna prikaza (`?hours=`) tu namenoma NI, čeprav ga Neverin zna rezati na viru. Dva
   * razloga, oba nastopita tiho: vsote padavin za 24 in 48 ur se računajo iz CELOTNE serije
   * tudi ob 6-urnem grafu, zato bi krajši prenos vrnil premajhne vsote brez sledu o tem; in
   * ključ predpomnilnika bi moral vsebovati okno, kar pomeni tri prenose iste postaje za tri
   * možna okna namesto enega (člen VIII). Rezanje na okno je stvar `withinHours`.
   */
  historyRequest(env: Env, stationId: string): SourceRequest;
  parseHistory(body: string): ParsedStationHistory;

  /** Prenos seznama vseh postaj tega ponudnika. */
  stationsRequest(env: Env): SourceRequest;
  parseStations(body: string): ProviderStation[];
}

import type { Env } from '../../../platform/config/env.js';
import type { SearchInput } from '../domain/rule-input.js';
import type { Windows } from '../domain/date-window.js';
import type { ProviderQuery } from '../domain/query-plan.js';
import type { AirportLookup } from '../domain/rule-matcher.js';
import type { NormalizedOffer, ProviderId, ProviderOutcome } from '../domain/types.js';

// Kaj mora znati vir letalskih podatkov, da ga modul zna vprašati (FR-016, FR-017).
//
// Isti dogovor kot `modules/meteo/providers/types.ts`: vir NIKOLI ne prenaša sam. Vrne OPIS
// zahteve (`request`), prenese pa `provider-runner.service.ts` prek `platform/cache` — člen VIII
// zahteva, da gre vsak zunanji klic skozi skupni predpomnilnik in semafor, in tega ni mogoče
// uveljaviti, če vsak vir kliče po svoje. Razčlenitev (`parse`) je čista funkcija nad telesom
// odgovora (člen IX) in se testira brez omrežja.
//
// Nov vir je nova datoteka in ena vrstica v `index.ts`.

export interface ProviderQueryContext {
  rule: SearchInput & { id: string };
  windows: Windows;
  airports: AirportLookup;
}

export interface ProviderRequest {
  url: string;
  /** Glave za zahtevo — ŽETON JE TU, nikoli v URL (člen IV: URL pristane v ExternalCache.sourceUrl
   * in v dnevniku). */
  headers: Record<string, string>;
  /** Rezervni gostitelj za ISTO pot, kadar primarni vrne 403/5xx ali ne odgovori (Ryanair: `services-api`). */
  fallbackUrl?: string;
}

export interface ProviderResult {
  outcome: ProviderOutcome;
  offers: NormalizedOffer[];
  /** Vrstice, zavržene kot nepopolne (cena brez valute, brez časa odhoda …). */
  incompleteCount: number;
  /** Slovensko, za uporabnika — gre v `lastCheck.message`. */
  message: string | null;
}

export interface FlightProvider {
  readonly id: ProviderId;
  /** Ime za vmesnik in dopis. */
  readonly label: string;
  /** `false` = neuradni vir (FR-020); vmesnik ga označi. */
  readonly official: boolean;
  /** Slovensko opozorilo za vmesnik, npr. o starosti podatkov; `null` = brez. */
  readonly notice: string | null;
  /** Največ zagonov na dan, v katerih sme biti vir vprašan; `null` = brez meje. */
  readonly dailyRunLimit: number | null;
  /** Gostitelji, s katerih sme biti povezava do rezervacije (domain/booking-url.ts). */
  readonly bookingHosts: readonly string[];
  /** Največ hkratnih zahtev na ta vir in najmanjši razmik med njimi (vljudnost, člen VIII). */
  readonly maxConcurrency: number;
  readonly minGapMs: number;
  /** `true` = vir ne gre po omrežju in mimo predpomnilnika (samo testni vir). */
  readonly local: boolean;

  isEnabled(env: Env): boolean;
  /** Razbije okno iskanja na poizvedbe; prazno, kadar vir takega iskanja ne podpira. */
  buildQueries(ctx: ProviderQueryContext): ProviderQuery[];
  request(query: ProviderQuery, env: Env): ProviderRequest;
  parse(body: unknown, query: ProviderQuery, airports: AirportLookup, now: Date, env: Env): ProviderResult;
  /** Samo pri `local: true`: telo, kot bi ga vrnil vir. */
  localBody?(query: ProviderQuery, now: Date): unknown;
}

export function unsupportedResult(message: string): ProviderResult {
  return { outcome: 'unsupported', offers: [], incompleteCount: 0, message };
}

/** Pomožnik: izid iz seznama ponudb — `noFlights`, kadar je prazen, `incomplete`, kadar je bilo
 * zavrženih več kot polovica vrstic ali je odgovor očitno odrezan. */
export function resultFromOffers(offers: NormalizedOffer[], incompleteCount: number, truncated: boolean): ProviderResult {
  if (truncated) {
    return {
      outcome: 'incomplete',
      offers,
      incompleteCount,
      message: 'Vir je vrnil največje dovoljeno število vrstic — del ponudb manjka. Zoži iskanje.',
    };
  }
  if (offers.length === 0 && incompleteCount > 0) {
    return { outcome: 'incomplete', offers, incompleteCount, message: 'Vir je vrnil samo nepopolne podatke.' };
  }
  if (offers.length === 0) return { outcome: 'noFlights', offers, incompleteCount, message: null };
  return { outcome: 'ok', offers, incompleteCount, message: null };
}

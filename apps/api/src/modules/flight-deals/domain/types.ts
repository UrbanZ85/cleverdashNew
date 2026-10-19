// Skupni nabori vrednosti modula Leti (015). Čista datoteka brez uvozov (člen IX): uvažajo jo
// modeli, domena, storitve in usmerjevalniki, zato tu ne sme biti ničesar, kar bi potegnilo
// mongoose ali express.

export const PROVIDER_IDS = ['travelpayouts', 'ryanair', 'wizzair', 'easyjet', 'fake'] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

/** Izid ENE poizvedbe na vir (FR-017). `disabled` = vir ni vklopljen v tej namestitvi. */
export const PROVIDER_OUTCOMES = [
  'ok',
  'noFlights',
  'unsupported',
  'unreachable',
  'rateLimited',
  'incomplete',
  'disabled',
] as const;
export type ProviderOutcome = (typeof PROVIDER_OUTCOMES)[number];

// 016: nabor je del pogodbe 015 in ostane tu; jedro skenerjev ima še `CHANGED` (platform/scanner/types.ts),
// ki ga leti ne izdajo. Stanja zagonov, dopisov in prednastavitve urnika so od 016 v jedru.
export const CHANGE_TYPES = ['NEW', 'PRICE_DOWN', 'PRICE_UP', 'UNCHANGED', 'UNAVAILABLE'] as const;
export type ChangeType = (typeof CHANGE_TYPES)[number];

export const MATCH_STATUSES = ['active', 'unavailable', 'stale'] as const;
export type MatchStatus = (typeof MATCH_STATUSES)[number];

export const DATE_MODES = ['fixed', 'range', 'rolling'] as const;
export type DateMode = (typeof DATE_MODES)[number];

export const DESTINATION_MODES = ['any', 'countries', 'airports'] as const;
export type DestinationMode = (typeof DESTINATION_MODES)[number];

export const BAGGAGE_OPTIONS = ['any', 'cabin', 'checked'] as const;
export type BaggageOption = (typeof BAGGAGE_OPTIONS)[number];

export const AVAILABILITIES = ['available', 'unavailable'] as const;
export type Availability = (typeof AVAILABILITIES)[number];

export interface Money {
  amount: number;
  currency: string;
}

/** Vgrajen zapis letališča (assets/airports.json, data-model.md). */
export interface Airport {
  iata: string;
  name: string;
  city: string;
  /** Druga imena: OurAirports `keywords` in slovenski eksonimi (Trst, Benetke, Gradec …) — za iskanje. */
  aliases: string[];
  /** ISO 3166-1 alpha-2. */
  country: string;
  /** Angleško ime iz vira; slovensko da `Intl.DisplayNames`. */
  countryName: string;
  lat: number;
  lon: number;
  /** IANA cona — v njej se presojajo ure odhoda/povratka (FR-011). */
  tz: string;
}

/** En segment potovanja v enotni obliki (FR-016). Časi so UTC instanti. */
export interface NormalizedSegment {
  departureAt: Date;
  arrivalAt: Date | null;
  flightNumbers: string[];
  stops: number;
}

/**
 * Ponudba, kot jo vrne vir po normalizaciji — brez identitete in brez primerjave s prejšnjim
 * stanjem; oboje doda `reconcile.service.ts`.
 */
export interface NormalizedOffer {
  providerId: ProviderId;
  airline: string;
  airlineName: string | null;
  origin: string;
  destination: string;
  outbound: NormalizedSegment;
  inbound: NormalizedSegment | null;
  price: Money;
  /** Kaj vir pravi, da cena vključuje (FR-013); `null`, kadar vir tega ne pove. */
  priceIncludes: string | null;
  passengers: { adults: number; children: number };
  fare: { type: string | null; baggage: string | null };
  bookingUrl: string | null;
  /** Prejšnja cena, kot jo navede VIR sam (Ryanair `previousPrice`); `null`, kadar vir tega ne da. Ne vpliva
   * na našo primerjavo (FR-030: NOVO brez izmišljene prejšnje cene) — prikaže se ločeno kot podatek vira. */
  providerPreviousPrice: Money | null;
  /** Čas podatka pri viru (pri predpomnjenih virih starejši od časa preverjanja). */
  dataAt: Date;
}

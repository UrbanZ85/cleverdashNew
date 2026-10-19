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

export const CHANGE_TYPES = ['NEW', 'PRICE_DOWN', 'PRICE_UP', 'UNCHANGED', 'UNAVAILABLE'] as const;
export type ChangeType = (typeof CHANGE_TYPES)[number];

export const RUN_STATUSES = ['queued', 'running', 'succeeded', 'partial', 'failed', 'cancelled', 'interrupted'] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export const RUN_TRIGGERS = ['schedule', 'manual'] as const;
export type RunTrigger = (typeof RUN_TRIGGERS)[number];

export const NOTIFICATION_STATUSES = ['pending', 'sending', 'sent', 'failed', 'suppressed'] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

export const SUPPRESSED_REASONS = ['smtp-not-configured', 'no-email', 'user-missing', 'no-items'] as const;
export type SuppressedReason = (typeof SUPPRESSED_REASONS)[number];

export const MATCH_STATUSES = ['active', 'unavailable', 'stale'] as const;
export type MatchStatus = (typeof MATCH_STATUSES)[number];

export const DATE_MODES = ['fixed', 'range', 'rolling'] as const;
export type DateMode = (typeof DATE_MODES)[number];

export const DESTINATION_MODES = ['any', 'countries', 'airports'] as const;
export type DestinationMode = (typeof DESTINATION_MODES)[number];

export const BAGGAGE_OPTIONS = ['any', 'cabin', 'checked'] as const;
export type BaggageOption = (typeof BAGGAGE_OPTIONS)[number];

export const SCHEDULE_PRESET_IDS = ['hourly', 'daily-06', 'daily-06-18', 'every-6h', 'monday-08', 'custom'] as const; // 016: 'hourly' dodan; nabor se seli v platform/scanner/types.ts (T045)
export type SchedulePresetId = (typeof SCHEDULE_PRESET_IDS)[number];

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

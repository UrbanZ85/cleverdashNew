import { DateTime } from 'luxon';
import type { Env } from '../../../platform/config/env.js';
import type { ProviderQuery } from '../domain/query-plan.js';
import type { AirportLookup } from '../domain/rule-matcher.js';
import type { NormalizedOffer } from '../domain/types.js';
import { resultFromOffers, type FlightProvider, type ProviderQueryContext, type ProviderResult } from './types.js';

// Neuradni Ryanairov iskalnik cen `farfnd/v4` (research.md §5). OPT-IN: `FLIGHT_RYANAIR_ENABLED`
// je privzeto `false`, ker Ryanairovi pogoji dovoljujejo samo zasebno nekomercialno rabo in
// `robots.txt` prepoveduje `/api`. Vklop je zavestna odločitev lastnika namestitve — isti dogovor
// kot pri Neverinu (011).
//
// Varovala, ki jih nalagata FR-020 in člen XII in ki jih runner uveljavlja iz lastnosti spodaj:
//  - največ `dailyRunLimit` zagonov na dan, v katerih je vir vprašan;
//  - ena hkratna zahteva in 500 ms premora (kot `@2bad/ryanair`);
//  - glava `User-Agent` navaja aplikacijo, brez posnemanja brskalnika in brez piškotkov;
//  - ob 403/429/izzivu je izid `unreachable`/`rateLimited` in NIČ se ne poskuša obiti —
//    v tej datoteki ni nobene kode za to, in to ni pomanjkljivost.
//
// Odgovor: `{ fares: [{ outbound: { departureAirport{iataCode}, arrivalAirport{iataCode},
// departureDate "2026-11-19T08:00:00" (LOKALNO, brez odmika), arrivalDate, price{value,
// currencyCode}, flightNumber }, inbound?, summary: { price, tripDurationDays } }], size, nextPage }`.
// Cena je za `adultPaxCount` odraslih; pošljemo 1 in pomnožimo, kar pri ponudbi piše.

export const RYANAIR_ID = 'ryanair' as const;

// Namizni brskalnik, ne lasten niz: Ryanair "očitne ne-brskalniške odjemalce" blokira s 403 (ugotovitev
// obeh odprtokodnih odjemalcev, research.md §5). To ni prikrivanje — brez piškotkov, brez prstnega odtisa,
// brez `client-version`; vir sam pove, kdaj ne želi odgovoriti, in takrat se nehamo (člen XII).
const DESKTOP_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

interface RyAirport {
  iataCode?: unknown;
}
interface RyLeg {
  departureAirport?: RyAirport;
  arrivalAirport?: RyAirport;
  departureDate?: unknown;
  arrivalDate?: unknown;
  price?: { value?: unknown; currencyCode?: unknown } | null;
  previousPrice?: { value?: unknown; currencyCode?: unknown } | null;
  flightNumber?: unknown;
}
interface RyFare {
  outbound?: RyLeg;
  inbound?: RyLeg;
  summary?: { price?: { value?: unknown; currencyCode?: unknown } | null } | null;
}
interface RyBody {
  fares?: unknown;
  size?: unknown;
  nextPage?: unknown;
}

function asString(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;
}
function asNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function parseLocal(s: string, tz: string): Date | null {
  const dt = DateTime.fromISO(s, { zone: tz });
  return dt.isValid ? dt.toJSDate() : null;
}

export const ryanairProvider: FlightProvider = {
  id: RYANAIR_ID,
  label: 'Ryanair (neuradni iskalnik cen)',
  official: false,
  notice:
    'Neuradni vir: Ryanair javnega vmesnika nima, njegovi pogoji dovoljujejo samo zasebno rabo. Vir je vprašan največ dvakrat dnevno in ga lahko lastnik namestitve kadar koli izklopi.',
  dailyRunLimit: 2,
  bookingHosts: ['ryanair.com'],
  maxConcurrency: 1,
  minGapMs: 500,
  local: false,

  isEnabled(env: Env): boolean {
    return env.FLIGHT_RYANAIR_ENABLED;
  },

  buildQueries(ctx: ProviderQueryContext): ProviderQuery[] {
    const { rule, windows } = ctx;
    if (windows.empty) return [];
    // Vir "kamor koli" in državo podpira neposredno; pri več državah je ena poizvedba na državo,
    // kar nosi `destination` kot `country:XX` v ključu — runner to loči (glej request()).
    const targets: Array<string | null> =
      rule.destination.mode === 'airports'
        ? rule.destination.airports
        : rule.destination.mode === 'countries'
          ? rule.destination.countries.map((c) => `country:${c}`)
          : [null];
    return rule.departureAirports.flatMap((origin) =>
      targets.map((destination) => ({
        providerId: RYANAIR_ID,
        origin,
        destination,
        outbound: { ...windows.outbound },
        inbound: windows.inbound ? { ...windows.inbound } : null,
        direct: true,
        currency: rule.price.currency,
        adults: rule.passengers.adults,
        children: rule.passengers.childrenAges.length,
        minNights: windows.nights?.min ?? null,
        maxNights: windows.nights?.max ?? null,
        // `priceValueTo` je cena na osebo pri viru; smiselna samo v valuti vira.
        priceCapPerPerson: rule.price.maxPerPerson !== null ? Math.ceil(rule.price.maxPerPerson) : null,
      })),
    );
  },

  request(query: ProviderQuery, env: Env) {
    const roundTrip = query.inbound !== null;
    // BREZ vodeče poševnice: `new URL('/farfnd', 'https://www.ryanair.com/api/')` bi `/api` zavrgel.
    const url = new URL(`farfnd/v4/${roundTrip ? 'roundTripFares' : 'oneWayFares'}`, `${env.FLIGHT_RYANAIR_URL.replace(/\/+$/, '')}/`);
    url.searchParams.set('departureAirportIataCode', query.origin);
    url.searchParams.set('outboundDepartureDateFrom', query.outbound.from);
    url.searchParams.set('outboundDepartureDateTo', query.outbound.to);
    // Vir ure zahteva tudi, kadar klicatelja ne zanimajo (ryanair-mcp, `quirks.go`); pravila o urah
    // presoja rule-matcher v coni letališča, tu gre cel dan.
    url.searchParams.set('outboundDepartureTimeFrom', '00:00');
    url.searchParams.set('outboundDepartureTimeTo', '23:59');
    if (roundTrip && query.inbound) {
      url.searchParams.set('inboundDepartureDateFrom', query.inbound.from);
      url.searchParams.set('inboundDepartureDateTo', query.inbound.to);
      url.searchParams.set('inboundDepartureTimeFrom', '00:00');
      url.searchParams.set('inboundDepartureTimeTo', '23:59');
      if (query.minNights !== null && query.minNights > 0) url.searchParams.set('durationFrom', String(query.minNights));
      if (query.maxNights !== null && query.maxNights > 0) url.searchParams.set('durationTo', String(query.maxNights));
    }
    if (query.priceCapPerPerson !== null) url.searchParams.set('priceValueTo', String(query.priceCapPerPerson));
    if (query.destination?.startsWith('country:')) {
      url.searchParams.set('arrivalCountryCode', query.destination.slice('country:'.length).toLowerCase());
    } else if (query.destination) {
      url.searchParams.set('arrivalAirportIataCode', query.destination);
    }
    url.searchParams.set('market', 'en-gb');
    url.searchParams.set('language', 'en');
    url.searchParams.set('currency', query.currency);
    url.searchParams.set('adultPaxCount', '1');
    // Brez `limit`: vir parametrov strani ne upošteva (ryanair-mcp, preverjeno 2026-06). Odrezan odgovor
    // se prepozna po `nextPage` v `parse`.
    // Rezervni gostitelj ima ISTO pot brez `/api` predpone (`services-api.ryanair.com/farfnd/v4/...`).
    const fallback = env.FLIGHT_RYANAIR_FALLBACK_URL
      ? new URL(`farfnd/v4/${roundTrip ? 'roundTripFares' : 'oneWayFares'}${url.search}`, `${env.FLIGHT_RYANAIR_FALLBACK_URL.replace(/\/+$/, '')}/`)
      : null;
    return {
      url: url.toString(),
      fallbackUrl: fallback ? fallback.toString() : undefined,
      headers: {
        Accept: 'application/json',
        'Accept-Language': 'en-GB,en;q=0.8',
        'User-Agent': DESKTOP_USER_AGENT,
      },
    };
  },

  parse(body: unknown, query: ProviderQuery, airports: AirportLookup, now: Date, _env: Env): ProviderResult {
    const parsed = (typeof body === 'string' ? safeJson(body) : body) as RyBody | null;
    if (!parsed || !Array.isArray(parsed.fares)) {
      return { outcome: 'unreachable', offers: [], incompleteCount: 0, message: 'Vir ni vrnil veljavnega odgovora.' };
    }
    const fares = parsed.fares as RyFare[];
    const people = query.adults + query.children;
    const offers: NormalizedOffer[] = [];
    let incomplete = 0;

    for (const fare of fares) {
      const out = fare.outbound;
      const origin = asString(out?.departureAirport?.iataCode)?.toUpperCase();
      const destination = asString(out?.arrivalAirport?.iataCode)?.toUpperCase();
      const originAirport = origin ? airports(origin) : null;
      const destAirport = destination ? airports(destination) : null;
      const priceValue = asNumber(fare.summary?.price?.value) ?? asNumber(out?.price?.value);
      const currency = (asString(fare.summary?.price?.currencyCode) ?? asString(out?.price?.currencyCode) ?? query.currency).toUpperCase();
      const depRaw = asString(out?.departureDate);
      if (!origin || !destination || !originAirport || !destAirport || priceValue === null || priceValue <= 0 || !depRaw) {
        incomplete += 1;
        continue;
      }
      const departureAt = parseLocal(depRaw, originAirport.tz);
      if (!departureAt) {
        incomplete += 1;
        continue;
      }
      const arrRaw = asString(out?.arrivalDate);
      const arrivalAt = arrRaw ? parseLocal(arrRaw, destAirport.tz) : null;
      const flightNumber = asString(out?.flightNumber);
      // Vir sam navede prejšnjo ceno (na nogo, na osebo) — prenese se kot podatek vira, ne kot naša primerjava.
      const prevOut = asNumber(out?.previousPrice?.value);
      const prevIn = asNumber(fare.inbound?.previousPrice?.value);
      const providerPrevious =
        prevOut !== null && (!query.inbound || prevIn !== null)
          ? { amount: Math.round((prevOut + (prevIn ?? 0)) * people * 100) / 100, currency }
          : null;

      let inbound: NormalizedOffer['inbound'] = null;
      if (query.inbound) {
        const inb = fare.inbound;
        const inDepRaw = asString(inb?.departureDate);
        const inDep = inDepRaw ? parseLocal(inDepRaw, destAirport.tz) : null;
        if (!inDep) {
          incomplete += 1;
          continue;
        }
        const inArrRaw = asString(inb?.arrivalDate);
        inbound = {
          departureAt: inDep,
          arrivalAt: inArrRaw ? parseLocal(inArrRaw, originAirport.tz) : null,
          flightNumbers: asString(inb?.flightNumber) ? [asString(inb?.flightNumber)!.replace(/\s+/g, '')] : [],
          stops: 0,
        };
      }

      offers.push({
        providerId: RYANAIR_ID,
        airline: 'FR',
        airlineName: 'Ryanair',
        origin,
        destination,
        outbound: {
          departureAt,
          arrivalAt,
          flightNumbers: flightNumber ? [flightNumber.replace(/\s+/g, '')] : [],
          stops: 0,
        },
        inbound,
        price: { amount: Math.round(priceValue * people * 100) / 100, currency },
        priceIncludes:
          people > 1
            ? `Osnovna vozovnica na osebo pri viru (${priceValue} ${currency}) × ${people} potnikov; otroci šteti kot odrasli. Brez prtljage in izbire sedeža.`
            : 'Osnovna vozovnica za eno osebo; brez prtljage in izbire sedeža.',
        passengers: { adults: query.adults, children: query.children },
        fare: { type: 'basic', baggage: 'samo majhna ročna torba' },
        bookingUrl: bookingLink(origin, destination, departureAt, originAirport.tz, inbound?.departureAt ?? null, destAirport.tz, query),
        providerPreviousPrice: providerPrevious,
        dataAt: now,
      });
    }

    // `oneWayFares`: `nextPage != null` pomeni odrezan odgovor in noben kurzor ne deluje → `incomplete`.
    // `roundTripFares`: `nextPage` je VEDNO 1, tudi pri popolnem odgovoru (ryanair-mcp, 98/98) → se ignorira.
    const truncated = query.inbound === null && parsed.nextPage !== null && parsed.nextPage !== undefined;
    return resultFromOffers(offers, incomplete, truncated);
  },
};

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Povezava do izbire letov, kot jo sestavlja `@2bad/ryanair` — na domeno vira. */
function bookingLink(
  origin: string,
  destination: string,
  departureAt: Date,
  originTz: string,
  returnAt: Date | null,
  destTz: string,
  query: ProviderQuery,
): string {
  const dateOut = DateTime.fromJSDate(departureAt, { zone: 'utc' }).setZone(originTz).toFormat('yyyy-LL-dd');
  const dateIn = returnAt ? DateTime.fromJSDate(returnAt, { zone: 'utc' }).setZone(destTz).toFormat('yyyy-LL-dd') : '';
  const url = new URL('https://www.ryanair.com/gb/en/trip/flights/select');
  url.searchParams.set('adults', String(query.adults));
  url.searchParams.set('teens', '0');
  url.searchParams.set('children', String(query.children));
  url.searchParams.set('infants', '0');
  url.searchParams.set('dateOut', dateOut);
  url.searchParams.set('dateIn', dateIn);
  url.searchParams.set('isConnectedFlight', 'false');
  url.searchParams.set('discount', '0');
  url.searchParams.set('isReturn', returnAt ? 'true' : 'false');
  url.searchParams.set('promoCode', '');
  url.searchParams.set('originIata', origin);
  url.searchParams.set('destinationIata', destination);
  return url.toString();
}

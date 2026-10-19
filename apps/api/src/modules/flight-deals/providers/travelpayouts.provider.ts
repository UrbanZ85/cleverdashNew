import { DateTime } from 'luxon';
import type { Env } from '../../../platform/config/env.js';
import { airlineName } from '../domain/airlines.js';
import { monthPairs, type DateRange } from '../domain/date-window.js';
import type { ProviderQuery } from '../domain/query-plan.js';
import type { AirportLookup } from '../domain/rule-matcher.js';
import { sanitizeBookingUrl } from '../domain/booking-url.js';
import type { NormalizedOffer } from '../domain/types.js';
import { resultFromOffers, type FlightProvider, type ProviderQueryContext, type ProviderResult } from './types.js';

// Travelpayouts / Aviasales Data API v3 — produkcijski vir MVP-ja (research.md §3, §4).
//
// Kar je treba vedeti, preden kdo spreminja preslikavo (vse preverjeno 17. 10. 2026 v
// dokumentaciji vira):
//  - podatki so PREDPOMNJENI iz tujih iskanj, do 48 ur stari; `dataAt` pride iz `search_date` v
//    povezavi, kadar je, sicer je enak času preverjanja;
//  - `departure_at` je ISO z LOKALNIM odmikom (`2023-07-28T07:00:00+02:00`) — razčleni se z
//    odmikom, ne kot UTC (FR-011);
//  - cena je za ENEGA odraslega; vir sestave potnikov ne pozna, zato se pomnoži in to pri
//    ponudbi piše (`priceIncludes`, FR-013);
//  - `destination` izpuščen = "kamor koli"; filtra po državi vir nima, zato se pri načinu
//    `countries` vpraša brez cilja in filtrira lokalno (rule-matcher.ts);
//  - `limit` je največ 1000; če jih pride toliko, je odgovor odrezan → `incomplete`;
//  - `one_way=false` pri povratnem, sicer vrne eno vozovnico na datum;
//  - žeton gre v glavo `X-Access-Token`, nikoli v URL (člen IV);
//  - omejitev 600 zahtev na minuto, 429 ob preseganju — runner 429 ne ponavlja v istem zagonu.

export const TRAVELPAYOUTS_ID = 'travelpayouts' as const;
const MAX_LIMIT = 1000;

interface TpRow {
  origin?: unknown;
  destination?: unknown;
  origin_airport?: unknown;
  destination_airport?: unknown;
  price?: unknown;
  airline?: unknown;
  flight_number?: unknown;
  departure_at?: unknown;
  return_at?: unknown;
  transfers?: unknown;
  return_transfers?: unknown;
  duration_to?: unknown;
  duration_back?: unknown;
  link?: unknown;
  currency?: unknown;
}

interface TpBody {
  success?: unknown;
  data?: unknown;
  error?: unknown;
  currency?: unknown;
}

function asString(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;
}

function asNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** `search_date=11052023` (ddMMyyyy) iz povezave → opoldne po Ljubljani tistega dne. */
export function dataAtFromLink(link: string | null, fallback: Date): Date {
  const m = link ? /search_date=(\d{2})(\d{2})(\d{4})/.exec(link) : null;
  if (!m) return fallback;
  const dt = DateTime.fromObject(
    { day: Number(m[1]), month: Number(m[2]), year: Number(m[3]), hour: 12 },
    { zone: 'Europe/Ljubljana' },
  );
  return dt.isValid && dt.toJSDate() <= fallback ? dt.toJSDate() : fallback;
}

export const travelpayoutsProvider: FlightProvider = {
  id: TRAVELPAYOUTS_ID,
  label: 'Travelpayouts (Aviasales)',
  official: true,
  notice: 'Cene so iz predpomnilnika tujih iskanj in so lahko do 48 ur stare; pred rezervacijo jih preveri pri viru.',
  dailyRunLimit: null,
  bookingHosts: ['aviasales.com', 'aviasales.ru'],
  maxConcurrency: 2,
  minGapMs: 0,
  local: false,

  isEnabled(env: Env): boolean {
    return Boolean(env.FLIGHT_TRAVELPAYOUTS_TOKEN && env.FLIGHT_TRAVELPAYOUTS_TOKEN.trim().length > 0);
  },

  buildQueries(ctx: ProviderQueryContext): ProviderQuery[] {
    const { rule, windows } = ctx;
    if (windows.empty) return [];
    const destinations: Array<string | null> =
      rule.destination.mode === 'airports' ? rule.destination.airports : [null];
    const out: ProviderQuery[] = [];
    const pairs = monthPairs(windows);
    for (const origin of rule.departureAirports) {
      for (const destination of destinations) {
        for (const pair of pairs) {
          out.push({
            providerId: TRAVELPAYOUTS_ID,
            origin,
            destination,
            // Okni poizvedbe sta CELA MESECA odhoda in povratka (en par na poizvedbo); filtriranje na
            // dejansko okno iskanja opravi rule-matcher. Cel mesec v ključu pomeni, da se poizvedbe
            // iskanj z različnimi okni, a istim parom mesecev, zlijejo (SC-007).
            outbound: monthRange(pair.outbound),
            inbound: pair.inbound ? monthRange(pair.inbound) : null,
            direct: rule.maxStops === 0,
            currency: rule.price.currency,
            adults: rule.passengers.adults,
            children: rule.passengers.childrenAges.length,
            minNights: windows.nights?.min ?? null,
            maxNights: windows.nights?.max ?? null,
            priceCapPerPerson: null,
          });
        }
      }
    }
    return out;
  },

  request(query: ProviderQuery, env: Env) {
    const url = new URL('/aviasales/v3/prices_for_dates', env.FLIGHT_TRAVELPAYOUTS_URL);
    url.searchParams.set('origin', query.origin);
    if (query.destination) url.searchParams.set('destination', query.destination);
    url.searchParams.set('departure_at', query.outbound.from.slice(0, 7));
    if (query.inbound) {
      // Mesec povratka iz para (buildQueries); vir vrne SAMO povratke v tem mesecu, zato ima vsak
      // mesec odhoda svoj par za vsak možen mesec povratka.
      url.searchParams.set('return_at', query.inbound.from.slice(0, 7));
      url.searchParams.set('one_way', 'false');
    } else {
      url.searchParams.set('one_way', 'true');
    }
    url.searchParams.set('direct', query.direct ? 'true' : 'false');
    url.searchParams.set('currency', query.currency.toLowerCase());
    url.searchParams.set('sorting', 'price');
    url.searchParams.set('unique', 'false');
    url.searchParams.set('limit', String(MAX_LIMIT));
    url.searchParams.set('page', '1');
    return {
      url: url.toString(),
      headers: {
        'X-Access-Token': env.FLIGHT_TRAVELPAYOUTS_TOKEN ?? '',
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
      },
    };
  },

  parse(body: unknown, query: ProviderQuery, airports: AirportLookup, now: Date, env: Env): ProviderResult {
    const parsed = (typeof body === 'string' ? safeJson(body) : body) as TpBody | null;
    if (!parsed || parsed.success !== true || !Array.isArray(parsed.data)) {
      const reason = asString(parsed?.error) ?? 'vir ni vrnil veljavnega odgovora';
      return { outcome: 'unreachable', offers: [], incompleteCount: 0, message: `Vir ni odgovoril pravilno: ${reason}.` };
    }
    const rows = parsed.data as TpRow[];
    const people = query.adults + query.children;
    const offers: NormalizedOffer[] = [];
    let incomplete = 0;

    for (const row of rows) {
      const origin = asString(row.origin_airport) ?? asString(row.origin);
      const destination = asString(row.destination_airport) ?? asString(row.destination);
      const priceOne = asNumber(row.price);
      const currency = (asString(row.currency) ?? asString(parsed.currency) ?? query.currency).toUpperCase();
      const departureAt = asString(row.departure_at);
      const airline = asString(row.airline);
      if (!origin || !destination || priceOne === null || priceOne <= 0 || !departureAt || !airline) {
        incomplete += 1;
        continue;
      }
      const dep = DateTime.fromISO(departureAt, { setZone: true });
      if (!dep.isValid) {
        incomplete += 1;
        continue;
      }
      const originAirport = airports(origin);
      if (!originAirport || !airports(destination)) {
        incomplete += 1;
        continue;
      }
      const durationTo = asNumber(row.duration_to);
      const flightNumber = asString(row.flight_number);
      const transfers = asNumber(row.transfers) ?? 0;

      let inbound: NormalizedOffer['inbound'] = null;
      const returnAt = asString(row.return_at);
      if (query.inbound) {
        if (!returnAt) {
          incomplete += 1;
          continue;
        }
        const ret = DateTime.fromISO(returnAt, { setZone: true });
        if (!ret.isValid) {
          incomplete += 1;
          continue;
        }
        const durationBack = asNumber(row.duration_back);
        inbound = {
          departureAt: ret.toJSDate(),
          arrivalAt: durationBack !== null ? ret.plus({ minutes: durationBack }).toJSDate() : null,
          flightNumbers: [],
          stops: asNumber(row.return_transfers) ?? 0,
        };
      }

      const link = asString(row.link);
      const bookingUrl = withMarker(link ? buildBookingUrl(link, query) : null, env.FLIGHT_TRAVELPAYOUTS_MARKER || undefined);
      offers.push({
        providerId: TRAVELPAYOUTS_ID,
        airline: airline.toUpperCase(),
        airlineName: airlineName(airline),
        origin: origin.toUpperCase(),
        destination: destination.toUpperCase(),
        outbound: {
          departureAt: dep.toJSDate(),
          arrivalAt: durationTo !== null ? dep.plus({ minutes: durationTo }).toJSDate() : null,
          flightNumbers: flightNumber ? [`${airline.toUpperCase()}${flightNumber}`] : [],
          stops: transfers,
        },
        inbound,
        price: { amount: Math.round(priceOne * people * 100) / 100, currency },
        priceIncludes:
          people > 1
            ? `Cena na osebo pri viru (${formatAmount(priceOne)} ${currency}) × ${people} potnikov; otroci šteti kot odrasli. Prtljaga ni vključena.`
            : 'Cena za eno osebo pri viru; prtljaga ni vključena.',
        passengers: { adults: query.adults, children: query.children },
        fare: { type: null, baggage: null },
        bookingUrl,
        providerPreviousPrice: null,
        dataAt: dataAtFromLink(link, now),
      });
    }

    return resultFromOffers(offers, incomplete, rows.length >= MAX_LIMIT);
  },
};

/** `yyyy-LL` → prvi in zadnji dan meseca. */
function monthRange(month: string): DateRange {
  const start = DateTime.fromFormat(month, 'yyyy-LL', { zone: 'utc' });
  return { from: start.toFormat('yyyy-LL-dd'), to: start.endOf('month').toFormat('yyyy-LL-dd') };
}

function formatAmount(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace('.', ',');
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** `https://www.aviasales.com` + `link`; partnerska oznaka se doda, kadar je nastavljena. */
function buildBookingUrl(link: string, _query: ProviderQuery): string | null {
  const base = link.startsWith('http') ? link : `https://www.aviasales.com${link.startsWith('/') ? '' : '/'}${link}`;
  return sanitizeBookingUrl(base, travelpayoutsProvider.bookingHosts);
}

/** Doda `marker` partnerja k povezavi (research.md §4: nepotrjeno, preveri spike). */
export function withMarker(url: string | null, marker: string | undefined): string | null {
  if (!url || !marker) return url;
  try {
    const u = new URL(url);
    u.searchParams.set('marker', marker);
    return u.toString();
  } catch {
    return url;
  }
}

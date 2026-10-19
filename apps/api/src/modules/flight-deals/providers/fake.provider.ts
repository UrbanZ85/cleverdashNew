import { DateTime } from 'luxon';
import type { Env } from '../../../platform/config/env.js';
import type { ProviderQuery } from '../domain/query-plan.js';
import type { AirportLookup } from '../domain/rule-matcher.js';
import type { NormalizedOffer } from '../domain/types.js';
import { resultFromOffers, type FlightProvider, type ProviderQueryContext, type ProviderResult } from './types.js';

// TESTNI vir z IZMIŠLJENIMI podatki (FR-022). Samo za razvoj in avtomatizirane teste:
// `FLIGHT_FAKE_PROVIDER_ENABLED` je privzeto `false`, v produkciji ga `loadEnv` ZAVRNE
// (platform/config/env.ts), da izmišljena ponudba nikoli ne pride v dopis (FR-039).
//
// Scenarij po zaporednih zagonih (quickstart.md §5) za LJU → STN, petek → nedelja, 2 nočitvi:
//   zagon 1: 120 € (NOVO)   zagon 2: 89 € (POCENITEV)   zagon 3+: 110 € (PODRAŽITEV, nato enako)
// Poleg tega: let v petek ob 14:30 (za test "po 15:00" — NE ustreza), in LJU → BGY, ki od tretjega
// zagona IZGINE (test UNAVAILABLE ob uspešnem odgovoru).
//
// Vir je `local`: runner ga ne kliče po omrežju in ne gre skozi predpomnilnik — scenarij se mora
// premakniti ob VSAKEM zagonu, predpomnilnik (TTL 3600 s) pa bi ga zamrznil.

export const FAKE_ID = 'fake' as const;

let runIndex = 0;

/** Kliče `run-executor` ob začetku vsakega zagona, kadar je vir vklopljen. */
export function advanceFakeProviderRun(): number {
  runIndex += 1;
  return runIndex;
}

export function resetFakeProviderForTests(): void {
  runIndex = 0;
}

export function fakeProviderRunIndex(): number {
  return runIndex;
}

const PRICE_SCENARIO = [120, 89, 110];

function priceForRun(run: number): number {
  return PRICE_SCENARIO[Math.min(Math.max(run, 1), PRICE_SCENARIO.length) - 1]!;
}

/** Prvi petek, ki je vsaj 7 dni po `now`, po coni LJU. */
export function nextFridayAfter(now: Date, tz = 'Europe/Ljubljana'): DateTime {
  let d = DateTime.fromJSDate(now, { zone: 'utc' }).setZone(tz).startOf('day').plus({ days: 7 });
  while (d.weekday !== 5) d = d.plus({ days: 1 });
  return d;
}

interface FakeBody {
  run: number;
  offers: Array<{
    origin: string;
    destination: string;
    airline: string;
    departureLocal: string;
    returnLocal: string | null;
    pricePerPerson: number;
    flight: string;
  }>;
}

export const fakeProvider: FlightProvider = {
  id: FAKE_ID,
  label: 'Testni vir (izmišljeni podatki)',
  official: false,
  notice: 'IZMIŠLJENI PODATKI za razvoj in teste. Ta vir v produkciji ne obstaja.',
  dailyRunLimit: null,
  bookingHosts: ['example.test'],
  maxConcurrency: 4,
  minGapMs: 0,
  local: true,

  isEnabled(env: Env): boolean {
    return env.FLIGHT_FAKE_PROVIDER_ENABLED && env.NODE_ENV !== 'production';
  },

  buildQueries(ctx: ProviderQueryContext): ProviderQuery[] {
    const { rule, windows } = ctx;
    if (windows.empty) return [];
    const destination = rule.destination.mode === 'airports' ? (rule.destination.airports[0] ?? null) : null;
    return rule.departureAirports.map((origin) => ({
      providerId: FAKE_ID,
      origin,
      destination,
      outbound: { ...windows.outbound },
      inbound: windows.inbound ? { ...windows.inbound } : null,
      direct: rule.maxStops === 0,
      currency: rule.price.currency,
      adults: rule.passengers.adults,
      children: rule.passengers.childrenAges.length,
      minNights: windows.nights?.min ?? null,
      maxNights: windows.nights?.max ?? null,
      priceCapPerPerson: null,
    }));
  },

  request() {
    return { url: 'local://fake', headers: {} };
  },

  localBody(query: ProviderQuery, now: Date): unknown {
    const run = runIndex;
    const friday = nextFridayAfter(now);
    const sunday = friday.plus({ days: 2 });
    const roundTrip = query.inbound !== null;
    const body: FakeBody = { run, offers: [] };
    if (query.origin !== 'LJU') return body;
    const ret = roundTrip ? sunday.set({ hour: 17, minute: 40 }).toFormat("yyyy-LL-dd'T'HH:mm") : null;
    body.offers.push(
      {
        origin: 'LJU',
        destination: 'STN',
        airline: 'FR',
        departureLocal: friday.set({ hour: 15, minute: 10 }).toFormat("yyyy-LL-dd'T'HH:mm"),
        returnLocal: ret,
        pricePerPerson: priceForRun(run),
        flight: 'FR1234',
      },
      {
        origin: 'LJU',
        destination: 'STN',
        airline: 'FR',
        departureLocal: friday.set({ hour: 14, minute: 30 }).toFormat("yyyy-LL-dd'T'HH:mm"),
        returnLocal: ret,
        pricePerPerson: 75,
        flight: 'FR1230',
      },
    );
    if (run < 3) {
      body.offers.push({
        origin: 'LJU',
        destination: 'BGY',
        airline: 'FR',
        departureLocal: friday.set({ hour: 16, minute: 0 }).toFormat("yyyy-LL-dd'T'HH:mm"),
        returnLocal: ret,
        pricePerPerson: 60,
        flight: 'FR5678',
      });
    }
    return body;
  },

  parse(body: unknown, query: ProviderQuery, airports: AirportLookup, now: Date, _env: Env): ProviderResult {
    const data = body as FakeBody;
    const people = query.adults + query.children;
    const offers: NormalizedOffer[] = [];
    for (const o of data.offers) {
      const origin = airports(o.origin);
      const dest = airports(o.destination);
      if (!origin || !dest) continue;
      if (query.destination && query.destination !== o.destination) continue;
      const dep = DateTime.fromISO(o.departureLocal, { zone: origin.tz });
      const inbound = o.returnLocal
        ? {
            departureAt: DateTime.fromISO(o.returnLocal, { zone: dest.tz }).toJSDate(),
            arrivalAt: DateTime.fromISO(o.returnLocal, { zone: dest.tz }).plus({ hours: 2 }).toJSDate(),
            flightNumbers: [`${o.flight}R`],
            stops: 0,
          }
        : null;
      if ((query.inbound !== null) !== (inbound !== null)) continue;
      offers.push({
        providerId: FAKE_ID,
        airline: o.airline,
        airlineName: 'Testni prevoznik',
        origin: o.origin,
        destination: o.destination,
        outbound: {
          departureAt: dep.toJSDate(),
          arrivalAt: dep.plus({ hours: 2 }).toJSDate(),
          flightNumbers: [o.flight],
          stops: 0,
        },
        inbound,
        price: { amount: o.pricePerPerson * people, currency: query.currency },
        priceIncludes: 'IZMIŠLJENA cena testnega vira.',
        passengers: { adults: query.adults, children: query.children },
        fare: { type: 'test', baggage: null },
        bookingUrl: `https://example.test/book/${o.flight}`,
        providerPreviousPrice: null,
        dataAt: now,
      });
    }
    return resultFromOffers(offers, 0, false);
  },
};

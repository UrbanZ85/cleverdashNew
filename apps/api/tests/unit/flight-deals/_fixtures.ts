import { DateTime } from 'luxon';
import type { SearchInput } from '../../../src/modules/flight-deals/domain/rule-input.js';
import { searchCreateSchema } from '../../../src/modules/flight-deals/domain/rule-input.js';
import type { NormalizedOffer } from '../../../src/modules/flight-deals/domain/types.js';

// Skupne priprave za enotske teste modula Leti. Čas je ZAMRZNJEN na 17. 10. 2026 ob 12:00 po
// Ljubljani — teden pred prehodom na zimski čas (25. 10. 2026), ki je v naročilu izrecno imenovan.

export const NOW = DateTime.fromISO('2026-10-17T12:00:00', { zone: 'Europe/Ljubljana' }).toJSDate();

/** Vikend iskanje iz quickstart.md §3: LJU + TRS → kamor koli, 22. 10.–1. 11. 2026, ±2, 2–3 nočitve,
 * odhod petek po 15:00, povratek nedelja. */
export function weekendRule(overrides: Partial<SearchInput> = {}): SearchInput {
  return searchCreateSchema.parse({
    name: 'Vikend',
    departureAirports: ['LJU', 'TRS'],
    destination: { mode: 'any' },
    dates: { mode: 'range', from: '2026-10-22', to: '2026-11-01' },
    flexDays: 2,
    returnWithinWindow: true,
    minNights: 2,
    maxNights: 3,
    outbound: { weekdays: [5], earliest: '15:00', latest: null },
    inbound: { weekdays: [7], earliest: null, latest: null },
    passengers: { adults: 2, childrenAges: [] },
    price: { maxPerPerson: 120, maxTotal: null, currency: 'EUR' },
    ...overrides,
  });
}

export function local(iso: string, zone: string): Date {
  return DateTime.fromISO(iso, { zone }).toJSDate();
}

/** Povratna ponudba LJU → STN: odhod petek 23. 10. 2026 15:10 LJU, povratek nedelja 25. 10. 17:40 London. */
export function offer(overrides: Partial<NormalizedOffer> = {}): NormalizedOffer {
  return {
    providerId: 'fake',
    airline: 'FR',
    airlineName: 'Ryanair',
    origin: 'LJU',
    destination: 'STN',
    outbound: {
      departureAt: local('2026-10-23T15:10', 'Europe/Ljubljana'),
      arrivalAt: local('2026-10-23T16:20', 'Europe/London'),
      flightNumbers: ['FR1234'],
      stops: 0,
    },
    inbound: {
      departureAt: local('2026-10-25T17:40', 'Europe/London'),
      arrivalAt: local('2026-10-25T20:40', 'Europe/Ljubljana'),
      flightNumbers: ['FR1235'],
      stops: 0,
    },
    price: { amount: 200, currency: 'EUR' },
    priceIncludes: null,
    passengers: { adults: 2, children: 0 },
    fare: { type: null, baggage: null },
    bookingUrl: 'https://example.test/book',
    providerPreviousPrice: null,
    dataAt: NOW,
    ...overrides,
  };
}

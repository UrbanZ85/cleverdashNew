import { describe, expect, it } from 'vitest';
import { findAirport } from '../../../src/modules/flight-deals/domain/airports.js';
import { loadEnv, resetEnvCacheForTests } from '../../../src/platform/config/env.js';
import type { ProviderQuery } from '../../../src/modules/flight-deals/domain/query-plan.js';
import { dataAtFromLink, travelpayoutsProvider } from '../../../src/modules/flight-deals/providers/travelpayouts.provider.js';
import { ryanairProvider } from '../../../src/modules/flight-deals/providers/ryanair.provider.js';
import { computeWindows } from '../../../src/modules/flight-deals/domain/date-window.js';
import { NOW, weekendRule } from './_fixtures.js';

// FR-016, FR-017, edge case "neveljavne cene": razčlenitev odgovorov virov je čista (člen IX).
// Primeri so iz dokumentacije virov (research.md §4, §5).

const ENV = {
  NODE_ENV: 'test',
  PORT: '3000',
  TZ: 'Europe/Ljubljana',
  PUBLIC_BASE_URL: 'https://app.si',
  MONGO_URI: 'mongodb://x/y',
  SESSION_COOKIE_SECRET: 'c'.repeat(32),
  KEYCLOAK_ISSUER_URL: 'https://sso.example.com/realms/x',
  KEYCLOAK_CLIENT_ID: 'x',
  KEYCLOAK_CLIENT_SECRET: 'y',
  CREDENTIALS_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  FLIGHT_TRAVELPAYOUTS_TOKEN: 'tok',
  FLIGHT_TRAVELPAYOUTS_MARKER: '12345',
};

function env() {
  resetEnvCacheForTests();
  return loadEnv(ENV);
}

const query: ProviderQuery = {
  providerId: 'travelpayouts',
  origin: 'LJU',
  destination: null,
  outbound: { from: '2026-10-01', to: '2026-10-31' },
  inbound: { from: '2026-10-22', to: '2026-11-03' },
  direct: true,
  currency: 'EUR',
  adults: 2,
  children: 0,
  minNights: 2,
  maxNights: 3,
  priceCapPerPerson: null,
};

describe('Travelpayouts', () => {
  const row = {
    origin: 'LJU',
    destination: 'STN',
    origin_airport: 'LJU',
    destination_airport: 'STN',
    price: 59,
    airline: 'FR',
    flight_number: '1234',
    departure_at: '2026-10-23T15:10:00+02:00',
    return_at: '2026-10-25T17:40:00+00:00',
    transfers: 0,
    return_transfers: 0,
    duration: 300,
    duration_to: 130,
    duration_back: 170,
    link: '/search/LJU2310STN25101?t=FR...&search_date=16102026&expected_price_uuid=u&expected_price_currency=eur',
  };

  it('razčleni odgovor z lokalnim odmikom v UTC in pomnoži ceno s potniki', () => {
    const result = travelpayoutsProvider.parse(JSON.stringify({ success: true, data: [row], currency: 'eur' }), query, findAirport, NOW, env());
    expect(result.outcome).toBe('ok');
    const o = result.offers[0]!;
    expect(o.outbound.departureAt.toISOString()).toBe('2026-10-23T13:10:00.000Z');
    expect(o.inbound?.departureAt.toISOString()).toBe('2026-10-25T17:40:00.000Z');
    expect(o.outbound.arrivalAt?.toISOString()).toBe('2026-10-23T15:20:00.000Z');
    expect(o.price).toEqual({ amount: 118, currency: 'EUR' });
    expect(o.priceIncludes).toMatch(/× 2 potnikov/);
    expect(o.outbound.flightNumbers).toEqual(['FR1234']);
    expect(o.outbound.stops).toBe(0);
    expect(o.bookingUrl).toContain('https://www.aviasales.com/search/LJU2310STN25101');
    expect(o.bookingUrl).toContain('marker=12345');
    // dataAt iz search_date=16102026 → 16. 10. 2026 opoldne po Ljubljani
    expect(o.dataAt.toISOString()).toBe('2026-10-16T10:00:00.000Z');
  });

  it('cena brez valute / negativna / 0 / brez časa odhoda se zavrže in šteje kot nepopolna', () => {
    const bad = [
      { ...row, price: -5 },
      { ...row, price: 0 },
      { ...row, departure_at: undefined },
      { ...row, price: 'ni-stevilka' },
      { ...row, departure_at: 'včeraj' },
    ];
    const result = travelpayoutsProvider.parse({ success: true, data: bad }, query, findAirport, NOW, env());
    expect(result.outcome).toBe('incomplete');
    expect(result.offers).toHaveLength(0);
    expect(result.incompleteCount).toBe(5);
  });

  it('povratna poizvedba brez return_at je nepopolna; enosmerna poizvedba ga ne potrebuje', () => {
    const noReturn = { ...row, return_at: undefined };
    expect(travelpayoutsProvider.parse({ success: true, data: [noReturn] }, query, findAirport, NOW, env()).incompleteCount).toBe(1);
    const oneWay = travelpayoutsProvider.parse({ success: true, data: [noReturn] }, { ...query, inbound: null }, findAirport, NOW, env());
    expect(oneWay.offers[0]?.inbound).toBeNull();
  });

  it('1000 vrstic pomeni odrezan odgovor → incomplete, ponudbe pa so vrnjene', () => {
    const data = Array.from({ length: 1000 }, (_, i) => ({ ...row, flight_number: String(i) }));
    const result = travelpayoutsProvider.parse({ success: true, data }, query, findAirport, NOW, env());
    expect(result.outcome).toBe('incomplete');
    expect(result.offers.length).toBe(1000);
  });

  it('success:false ali nepravilen JSON → unreachable z razlogom', () => {
    expect(travelpayoutsProvider.parse({ success: false, data: {}, error: 'Unauthorized' }, query, findAirport, NOW, env()).outcome).toBe('unreachable');
    expect(travelpayoutsProvider.parse('<html>', query, findAirport, NOW, env()).outcome).toBe('unreachable');
  });

  it('prazen seznam je noFlights', () => {
    expect(travelpayoutsProvider.parse({ success: true, data: [] }, query, findAirport, NOW, env()).outcome).toBe('noFlights');
  });

  it('request: žeton je v glavi, ne v URL; destination izpuščen pri "kamor koli"', () => {
    const req = travelpayoutsProvider.request(query, env());
    expect(req.url).not.toContain('tok');
    expect(req.headers['X-Access-Token']).toBe('tok');
    expect(req.url).toContain('origin=LJU');
    expect(req.url).not.toContain('destination=');
    expect(req.url).toContain('departure_at=2026-10');
    expect(req.url).toContain('return_at=2026-10');
    expect(req.url).toContain('one_way=false');
    expect(req.url).toContain('direct=true');
    expect(req.url).toContain('currency=eur');
  });

  it('request: 5 mesecev vnaprej z 1–3 nočitvami vpraša za vsak mesec odhoda tudi povratek v naslednjem mesecu (napaka 19. 10. 2026)', () => {
    const rule = weekendRule({ departureAirports: ['LJU'], dates: { mode: 'rolling', months: 5 }, minNights: 1, maxNights: 3 });
    const windows = computeWindows(rule, NOW, 'Europe/Ljubljana');
    const queries = travelpayoutsProvider.buildQueries({ rule: { ...rule, id: 'r' }, windows, airports: findAirport });
    const months = queries.map((q) => {
      const u = new URL(travelpayoutsProvider.request(q, env()).url);
      return `${u.searchParams.get('departure_at')}>${u.searchParams.get('return_at')}`;
    });
    expect(months).toEqual([
      '2026-10>2026-10', '2026-10>2026-11',
      '2026-11>2026-11', '2026-11>2026-12',
      '2026-12>2026-12', '2026-12>2027-01',
      '2027-01>2027-01', '2027-01>2027-02',
      '2027-02>2027-02', '2027-02>2027-03',
      '2027-03>2027-03', '2027-03>2027-04',
    ]);
    // Povratek nikoli pred odhodom.
    expect(months.every((m) => m.split('>')[1]! >= m.split('>')[0]!)).toBe(true);
  });

  it('dataAtFromLink: brez search_date vrne čas preverjanja; datum v prihodnosti tudi', () => {
    expect(dataAtFromLink(null, NOW)).toBe(NOW);
    expect(dataAtFromLink('/search/x?search_date=01012030', NOW)).toBe(NOW);
  });
});

describe('Ryanair', () => {
  const fare = {
    outbound: {
      departureAirport: { iataCode: 'LJU' },
      arrivalAirport: { iataCode: 'STN' },
      departureDate: '2026-10-23T15:10:00',
      arrivalDate: '2026-10-23T16:20:00',
      price: { value: 49.99, currencyCode: 'EUR' },
      flightNumber: 'FR 1234',
    },
    inbound: {
      departureAirport: { iataCode: 'STN' },
      arrivalAirport: { iataCode: 'LJU' },
      departureDate: '2026-10-25T17:40:00',
      arrivalDate: '2026-10-25T20:40:00',
      price: { value: 30.01, currencyCode: 'EUR' },
      flightNumber: 'FR 1235',
    },
    summary: { price: { value: 80, currencyCode: 'EUR' }, previousPrice: null, newRoute: false, tripDurationDays: 2 },
  };
  const ryQuery: ProviderQuery = { ...query, providerId: 'ryanair', outbound: { from: '2026-10-20', to: '2026-11-03' }, priceCapPerPerson: 120 };

  it('lokalni čas brez odmika se sestavi s cono letališča', () => {
    const result = ryanairProvider.parse({ fares: [fare], size: 1 }, ryQuery, findAirport, NOW, env());
    expect(result.outcome).toBe('ok');
    const o = result.offers[0]!;
    expect(o.outbound.departureAt.toISOString()).toBe('2026-10-23T13:10:00.000Z'); // 15:10 CEST
    expect(o.inbound?.departureAt.toISOString()).toBe('2026-10-25T17:40:00.000Z'); // 17:40 GMT (po prehodu)
    expect(o.price).toEqual({ amount: 160, currency: 'EUR' });
    expect(o.outbound.flightNumbers).toEqual(['FR1234']);
    expect(o.airline).toBe('FR');
    expect(o.bookingUrl).toContain('https://www.ryanair.com/gb/en/trip/flights/select');
    expect(o.bookingUrl).toContain('dateOut=2026-10-23');
    expect(o.bookingUrl).toContain('dateIn=2026-10-25');
  });

  it('vrstica brez cene ali brez odhoda je nepopolna', () => {
    const bad = { ...fare, summary: null, outbound: { ...fare.outbound, price: null } };
    expect(ryanairProvider.parse({ fares: [bad] }, ryQuery, findAirport, NOW, env()).incompleteCount).toBe(1);
  });

  it('request: brez piškotkov, namizni User-Agent, država z malimi črkami, ure in priceValueTo, brez limit, rezervni gostitelj', () => {
    const req = ryanairProvider.request({ ...ryQuery, destination: 'country:GB' }, env());
    expect(req.url).toContain('https://www.ryanair.com/api/farfnd/v4/roundTripFares');
    expect(req.url).toContain('arrivalCountryCode=gb');
    expect(req.url).toContain('durationFrom=2');
    expect(req.url).toContain('adultPaxCount=1');
    expect(req.url).toContain('outboundDepartureTimeFrom=00%3A00');
    expect(req.url).toContain('inboundDepartureTimeTo=23%3A59');
    expect(req.url).toContain('priceValueTo=120');
    expect(req.url).not.toContain('limit=');
    expect(req.fallbackUrl).toContain('https://services-api.ryanair.com/farfnd/v4/roundTripFares');
    expect(req.fallbackUrl).toContain('arrivalCountryCode=gb');
    expect(req.headers['User-Agent']).toContain('Mozilla/5.0');
    expect(Object.keys(req.headers).map((h) => h.toLowerCase())).not.toContain('cookie');
    expect(ryanairProvider.official).toBe(false);
    expect(ryanairProvider.dailyRunLimit).toBe(2);
  });

  it('brez cenovne meje ni priceValueTo; enosmerno nima inbound ur', () => {
    const req = ryanairProvider.request({ ...ryQuery, inbound: null, priceCapPerPerson: null }, env());
    expect(req.url).toContain('/farfnd/v4/oneWayFares');
    expect(req.url).not.toContain('priceValueTo');
    expect(req.url).not.toContain('inboundDepartureTimeFrom');
  });

  it('nextPage: pri oneWayFares pomeni odrezan odgovor, pri roundTripFares se ignorira', () => {
    const oneWay = { ...ryQuery, inbound: null };
    const owFare = { outbound: fare.outbound, summary: { price: fare.outbound.price } };
    expect(ryanairProvider.parse({ fares: [owFare], nextPage: 1 }, oneWay, findAirport, NOW, env()).outcome).toBe('incomplete');
    expect(ryanairProvider.parse({ fares: [owFare], nextPage: null }, oneWay, findAirport, NOW, env()).outcome).toBe('ok');
    expect(ryanairProvider.parse({ fares: [fare], nextPage: 1 }, ryQuery, findAirport, NOW, env()).outcome).toBe('ok');
  });

  it('previousPrice vira se prenese kot podatek vira (× potniki), ne kot naša primerjava', () => {
    const withPrev = {
      ...fare,
      outbound: { ...fare.outbound, previousPrice: { value: 59.99, currencyCode: 'EUR' } },
      inbound: { ...fare.inbound, previousPrice: { value: 40.01, currencyCode: 'EUR' } },
    };
    const o = ryanairProvider.parse({ fares: [withPrev] }, ryQuery, findAirport, NOW, env()).offers[0]!;
    expect(o.providerPreviousPrice).toEqual({ amount: 200, currency: 'EUR' });
    const noPrev = ryanairProvider.parse({ fares: [fare] }, ryQuery, findAirport, NOW, env()).offers[0]!;
    expect(noPrev.providerPreviousPrice).toBeNull();
  });
});

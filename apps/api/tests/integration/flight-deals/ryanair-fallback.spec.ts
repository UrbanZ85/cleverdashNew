import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DateTime } from 'luxon';
import { clearTestDb, startTestDb, stopTestDb } from '../../setup/mongo-memory.js';
import { setTestEnv } from '../../setup/test-env.js';
import { FlightOfferModel } from '../../../src/modules/flight-deals/models/flight-offer.model.js';
import { FlightSearchRuleModel } from '../../../src/modules/flight-deals/models/flight-search-rule.model.js';
import { UserModel } from '../../../src/modules/auth/models/user.model.js';
import { nextFriday, seedRule } from '../../contract/flight-deals/_helpers.js';
import { runOnce } from './_run.js';

// Neuradni Ryanairov vir (research.md §5, dopolnjeno 2026-10-19 po pregledu ryanair-mcp in
// flight-deals-tracker): 403 na primarnem gostitelju → EN poskus na rezervnem (`services-api`), 403 na
// obeh → `unreachable` brez nadaljnjih poskusov (člen XII: ničesar ne obidemo); `previousPrice` vira se
// shrani kot podatek vira; dnevna meja ostaja.

beforeAll(async () => {
  setTestEnv({ FLIGHT_RYANAIR_ENABLED: 'true' });
  await startTestDb();
});
afterAll(stopTestDb);
afterEach(async () => {
  vi.unstubAllGlobals();
  await clearTestDb();
});

const realFetch = globalThis.fetch;

function fare(now: Date) {
  const friday = nextFriday(now);
  const dep = friday.set({ hour: 15, minute: 10 });
  const ret = friday.plus({ days: 2 }).setZone('Europe/London', { keepLocalTime: true }).set({ hour: 17, minute: 40 });
  const leg = (from: string, to: string, d: DateTime, price: number, prev: number | null) => ({
    departureAirport: { iataCode: from },
    arrivalAirport: { iataCode: to },
    departureDate: d.toFormat("yyyy-LL-dd'T'HH:mm:ss"),
    arrivalDate: d.plus({ hours: 2 }).toFormat("yyyy-LL-dd'T'HH:mm:ss"),
    price: { value: price, currencyCode: 'EUR' },
    previousPrice: prev === null ? null : { value: prev, currencyCode: 'EUR' },
    flightNumber: 'FR 1234',
  });
  return {
    outbound: leg('LJU', 'STN', dep, 49.99, 59.99),
    inbound: leg('STN', 'LJU', ret, 30.01, 40.01),
    summary: { price: { value: 80, currencyCode: 'EUR' }, previousPrice: null, newRoute: false, tripDurationDays: 2 },
  };
}

function stub(primaryStatus: number, fallbackStatus: number, now: Date) {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('127.0.0.1')) return realFetch(input, init);
      calls.push(url);
      const status = url.includes('services-api.ryanair.com') ? fallbackStatus : primaryStatus;
      if (status !== 200) return new Response('blocked', { status });
      return new Response(JSON.stringify({ fares: [fare(now)], size: 1, nextPage: 1 }), { status: 200, headers: { 'content-type': 'application/json' } });
    }),
  );
  return calls;
}

const ANY_DAY = {
  outbound: { weekdays: [], earliest: null, latest: null },
  inbound: { weekdays: [], earliest: null, latest: null },
  price: { maxPerPerson: 120, maxTotal: null, currency: 'EUR' },
};

describe('Ryanair: rezervni gostitelj in podatki vira', () => {
  it('403 na www → poskus na services-api → ok; previousPrice vira shranjen; priceValueTo v URL', async () => {
    const ana = await UserModel.create({ keycloakSubject: 'kc-a', email: 'a@x.si', displayName: 'a', lastLoginAt: new Date() });
    await seedRule(String(ana._id), ANY_DAY);
    const now = new Date();
    const calls = stub(403, 200, now);
    const { run } = await runOnce(now);
    expect(run?.status).toBe('succeeded');
    expect(calls.filter((u) => u.includes('www.ryanair.com'))).toHaveLength(1);
    expect(calls.filter((u) => u.includes('services-api.ryanair.com'))).toHaveLength(1);
    expect(calls[0]).toContain('priceValueTo=120');
    expect(calls[0]).toContain('outboundDepartureTimeFrom=00%3A00');
    expect(calls[0]).not.toContain('limit=');
    const offer = await FlightOfferModel.findOne({ providerId: 'ryanair' }).lean();
    expect(offer?.price).toEqual({ amount: 160, currency: 'EUR' });
    expect(offer?.providerPreviousPrice).toMatchObject({ amount: 200, currency: 'EUR' });
    expect(offer?.previousPrice).toBeNull(); // naša primerjava ostane NOVO (FR-030)
    expect(offer?.lastChangeType).toBe('NEW');
  });

  it('403 na obeh gostiteljih → unreachable, brez tretjega poskusa, ponudbe ostanejo', async () => {
    const ana = await UserModel.create({ keycloakSubject: 'kc-b', email: 'b@x.si', displayName: 'b', lastLoginAt: new Date() });
    const rule = await seedRule(String(ana._id), ANY_DAY);
    const now = new Date();
    const calls = stub(403, 403, now);
    const { run } = await runOnce(now);
    expect(run?.status).toBe('failed');
    expect(calls).toHaveLength(2);
    const fresh = await FlightSearchRuleModel.findById(rule._id).lean();
    const ry = fresh?.lastCheck?.outcomes.find((o) => o.providerId === 'ryanair');
    expect(ry?.outcome).toBe('unreachable');
    expect(ry?.message).toContain('403');
  });
});

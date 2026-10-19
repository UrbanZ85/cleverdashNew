import { describe, expect, it } from 'vitest';
import {
  DEFAULT_OFFER_SORT,
  DEFAULT_OFFER_VIEW,
  emptyOfferFilters,
  filterOffers,
  matchesScope,
  offerViewFilters,
  offerViewStorageKey,
  parseOfferView,
  serializeOfferView,
  type Offer,
  type OfferMatch,
  type OfferView,
} from '../../src/app/features/flight-deals/flight-deals.model.js';

// 015: zapomnjen pogled tabele (obseg, iskanje, vrsta, direktni, pretečene, red) in filter obsega
// Vse / Moje / Deljene z mano. Branje shranjenega zapisa je obrambno po poljih: star ali pokvarjen
// zapis v localStorage ne sme podreti strani, ampak pade na privzetek.

function match(overrides: Partial<OfferMatch> = {}): OfferMatch {
  return { searchId: 's1', searchName: 'Moje', isOwn: true, owner: null, changeType: 'UNCHANGED', firstMatchedAt: '2026-10-12T10:00:00Z', status: 'active', ...overrides };
}

function offer(id: string, matches: OfferMatch[]): Offer {
  const airport = { iata: 'LJU', name: 'Ljubljana', city: 'Ljubljana', country: 'SI', countryName: 'Slovenija', latitude: 0, longitude: 0, timezone: 'Europe/Ljubljana' };
  return {
    id,
    providerId: 'fake',
    providerLabel: 'Fake',
    providerOfficial: true,
    airline: 'FR',
    airlineName: 'Ryanair',
    origin: airport,
    destination: { ...airport, iata: 'NAP', city: 'Napoli', countryName: 'Italija' },
    outbound: { departureAt: '2030-01-01T10:00:00Z', departureTz: 'Europe/Rome', arrivalAt: null, arrivalTz: 'Europe/Rome', flightNumbers: [], stops: 0 },
    inbound: null,
    nights: null,
    price: { amount: 100, currency: 'EUR' },
    pricePerPerson: { amount: 100, currency: 'EUR' },
    priceIncludes: null,
    previousPrice: null,
    change: null,
    passengers: { adults: 1, children: 0 },
    bookingUrl: null,
    dataAt: '2026-10-16T10:00:00Z',
    lastCheckedAt: '2026-10-19T08:46:00Z',
    availability: 'available',
    matches,
  };
}

const own = offer('own', [match()]);
const shared = offer('shared', [match({ searchId: 's2', searchName: 'Majino', isOwn: false, owner: { id: 'u2', displayName: 'Maja', initials: 'M' } })]);
const both = offer('both', [match(), match({ searchId: 's2', isOwn: false })]);
const NOW = new Date('2026-10-19T10:00:00Z');

describe('obseg Vse / Moje / Deljene z mano', () => {
  it('"own" zahteva lastno ujemanje, "shared" deljeno, ponudba z obema je v obeh', () => {
    expect(matchesScope(own, 'own')).toBe(true);
    expect(matchesScope(own, 'shared')).toBe(false);
    expect(matchesScope(shared, 'own')).toBe(false);
    expect(matchesScope(shared, 'shared')).toBe(true);
    expect(matchesScope(both, 'own')).toBe(true);
    expect(matchesScope(both, 'shared')).toBe(true);
    expect(matchesScope(shared, 'all')).toBe(true);
  });

  it('filterOffers upošteva obseg skupaj z ostalimi filtri', () => {
    expect(filterOffers([own, shared, both], { ...emptyOfferFilters(), scope: 'shared' }, NOW).map((o) => o.id)).toEqual(['shared', 'both']);
    expect(filterOffers([own, shared, both], { ...emptyOfferFilters(), scope: 'own', query: 'maja' }, NOW)).toEqual([]);
    expect(filterOffers([own, shared, both], emptyOfferFilters(), NOW)).toHaveLength(3);
  });
});

describe('zapomnjen pogled', () => {
  const saved: OfferView = { scope: 'shared', searchId: 's2', kind: 'down', directOnly: true, showExpired: true, sort: { key: 'dataAt', dir: 'desc' } };

  it('privzetek ima obseg "vse", nič izbranega in privzeti red tabele', () => {
    expect(DEFAULT_OFFER_VIEW).toEqual({ scope: 'all', searchId: null, kind: 'all', directOnly: false, showExpired: false, sort: DEFAULT_OFFER_SORT });
  });

  it('shranjeno in prebrano je isto', () => {
    expect(parseOfferView(serializeOfferView(saved))).toEqual(saved);
  });

  it('brez zapisa, pokvarjen JSON ali napačen tip → privzetek (nova kopija, ne isti objekt)', () => {
    expect(parseOfferView(null)).toEqual(DEFAULT_OFFER_VIEW);
    expect(parseOfferView(null)).not.toBe(DEFAULT_OFFER_VIEW);
    expect(parseOfferView('{nope')).toEqual(DEFAULT_OFFER_VIEW);
    expect(parseOfferView('"besedilo"')).toEqual(DEFAULT_OFFER_VIEW);
    expect(parseOfferView('[1,2]')).toEqual({ ...DEFAULT_OFFER_VIEW });
  });

  it('vsako polje pade na privzetek posebej: neznane vrednosti ne podrejo ostalih', () => {
    const view = parseOfferView(JSON.stringify({ scope: 'everyone', kind: 'down', directOnly: 'yes', showExpired: true, sort: { key: 'nope', dir: 'desc' }, searchId: '' }));
    expect(view).toEqual({ scope: 'all', searchId: null, kind: 'down', directOnly: false, showExpired: true, sort: { key: DEFAULT_OFFER_SORT.key, dir: 'desc' } });
  });

  it('ključ shrambe je po strani in uporabniku', () => {
    expect(offerViewStorageKey('overview', 'u1')).toBe('cd.flight-deals.view.overview.u1');
    expect(offerViewStorageKey('shared', null)).toBe('cd.flight-deals.view.shared.anon');
  });

  it('pogled + poizvedba = filtri tabele', () => {
    expect(offerViewFilters(saved, 'nap')).toEqual({ query: 'nap', scope: 'shared', searchId: 's2', kind: 'down', directOnly: true, showExpired: true });
  });
});

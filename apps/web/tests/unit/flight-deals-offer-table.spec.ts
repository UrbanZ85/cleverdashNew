import { describe, expect, it } from 'vitest';
import {
  DEFAULT_OFFER_SORT,
  emptyOfferFilters,
  filterOffers,
  isExpiredOffer,
  normalizeSearchText,
  offerCounts,
  offerKind,
  offerMatchesQuery,
  offerStatus,
  searchNamesText,
  sortOffers,
  stopsText,
  toggleOfferSort,
  type Airport,
  type Offer,
  type OfferMatch,
} from '../../src/app/features/flight-deals/flight-deals.model.js';

// 015: tabela ponudb na glavni strani (brez TestBed, vzorec flight-deals-model.spec.ts). Pokrite so
// odločitve, ki jih je mogoče pokvariti tiho: kaj je "pretečeno" in da je privzeto skrito, prednost
// značk, iskanje brez šumnikov, števci čipov neodvisno od izbrane vrste, razvrščanje z manjkajočimi
// vrednostmi vedno na koncu.

const NOW = new Date('2026-10-19T10:00:00Z');

function airport(iata: string, city: string, countryName: string): Airport {
  return { iata, name: `${city} Airport`, city, country: 'XX', countryName, latitude: 0, longitude: 0, timezone: 'Europe/Ljubljana' };
}

function match(overrides: Partial<OfferMatch> = {}): OfferMatch {
  return {
    searchId: 's1',
    searchName: 'Samo vikendi',
    isOwn: true,
    owner: null,
    changeType: 'UNCHANGED',
    firstMatchedAt: '2026-10-12T10:00:00Z',
    status: 'active',
    ...overrides,
  };
}

function offer(overrides: Partial<Offer> = {}): Offer {
  return {
    id: 'o1',
    providerId: 'travelpayouts',
    providerLabel: 'Travelpayouts (Aviasales)',
    providerOfficial: false,
    airline: 'FR',
    airlineName: 'Ryanair',
    origin: airport('VCE', 'Venezia', 'Italija'),
    destination: airport('NAP', 'Napoli', 'Italija'),
    outbound: { departureAt: '2026-10-24T18:35:00Z', departureTz: 'Europe/Rome', arrivalAt: null, arrivalTz: 'Europe/Rome', flightNumbers: ['FR 1234'], stops: 0 },
    inbound: { departureAt: '2026-10-25T05:55:00Z', departureTz: 'Europe/Rome', arrivalAt: null, arrivalTz: 'Europe/Rome', flightNumbers: ['FR 4321'], stops: 0 },
    nights: 1,
    price: { amount: 237, currency: 'EUR' },
    pricePerPerson: { amount: 79, currency: 'EUR' },
    priceIncludes: null,
    previousPrice: null,
    change: null,
    passengers: { adults: 2, children: 1 },
    bookingUrl: null,
    dataAt: '2026-10-16T10:00:00Z',
    lastCheckedAt: '2026-10-19T08:46:00Z',
    availability: 'available',
    matches: [match()],
    ...overrides,
  };
}

const departed = offer({
  id: 'departed',
  outbound: { departureAt: '2026-10-18T06:00:00Z', departureTz: 'Europe/Rome', arrivalAt: null, arrivalTz: 'Europe/Rome', flightNumbers: [], stops: 0 },
  matches: [match({ changeType: 'NEW' })],
});
const unavailable = offer({ id: 'gone', availability: 'unavailable', change: { type: 'UNAVAILABLE', absolute: 0, percent: 0 } });
const fresh = offer({ id: 'fresh', price: { amount: 318, currency: 'EUR' }, matches: [match({ changeType: 'NEW' })] });
const cheaper = offer({
  id: 'cheaper',
  price: { amount: 150, currency: 'EUR' },
  previousPrice: { amount: 200, currency: 'EUR' },
  change: { type: 'PRICE_DOWN', absolute: -50, percent: -25 },
  destination: airport('AGP', 'Málaga', 'Španija'),
  matches: [match({ searchId: 's2', searchName: 'Španija', isOwn: false, owner: { id: 'u2', displayName: 'Maja', initials: 'M' } })],
});
const dearer = offer({
  id: 'dearer',
  price: { amount: 507, currency: 'EUR' },
  previousPrice: { amount: 480, currency: 'EUR' },
  change: { type: 'PRICE_UP', absolute: 27, percent: 5.6 },
  outbound: { departureAt: '2026-10-23T05:40:00Z', departureTz: 'Europe/Zagreb', arrivalAt: null, arrivalTz: 'Europe/Berlin', flightNumbers: [], stops: 1 },
  inbound: null,
  nights: null,
  destination: airport('FRA', 'Frankfurt am Main', 'Nemčija'),
  airline: 'OU',
  airlineName: 'Croatia Airlines',
});
const ALL = [departed, unavailable, fresh, cheaper, dearer];

describe('pretečene ponudbe in značka', () => {
  it('pretečeno je: vir je ne ponuja več ALI je odhod mimo', () => {
    expect(isExpiredOffer(unavailable, NOW)).toBe(true);
    expect(isExpiredOffer(departed, NOW)).toBe(true);
    expect(isExpiredOffer(fresh, NOW)).toBe(false);
  });

  it('značka: ni več na voljo > pretečeno > novo > pocenitev > podražitev > nič', () => {
    expect(offerStatus(unavailable, NOW)).toMatchObject({ key: 'unavailable', label: 'Ni več na voljo', color: 'medium' });
    expect(offerStatus(departed, NOW)).toMatchObject({ key: 'departed', label: 'Pretečeno' });
    expect(offerStatus(fresh, NOW)).toMatchObject({ key: 'new', label: 'Novo', color: 'primary' });
    expect(offerStatus(cheaper, NOW)).toMatchObject({ key: 'down', color: 'success' });
    expect(offerStatus(dearer, NOW)).toMatchObject({ key: 'up', color: 'danger' });
    expect(offerStatus(offer(), NOW)).toMatchObject({ key: 'plain', label: '', color: null });
  });

  it('vrsta za filter ne gleda pretečenosti (pretečena NOVA ponudba je še vedno "novo")', () => {
    expect(offerKind(departed)).toBe('new');
    expect(offerKind(cheaper)).toBe('down');
    expect(offerKind(offer())).toBe('plain');
  });

  it('prestopi: direktno / 1 prestop / 2 prestopa / 3 prestopi; šteje najslabši od obeh smeri', () => {
    expect(stopsText(offer())).toBe('direktno');
    expect(stopsText(dearer)).toBe('1 prestop');
    expect(stopsText(offer({ inbound: { ...offer().inbound!, stops: 2 } }))).toBe('2 prestopa');
    expect(stopsText(offer({ outbound: { ...offer().outbound, stops: 3 } }))).toBe('3 prestopi');
  });

  it('imena iskanj: lastno golo, deljeno z lastnikom v oklepaju', () => {
    expect(searchNamesText(offer())).toBe('Samo vikendi');
    expect(searchNamesText(cheaper)).toBe('Španija (Maja)');
  });
});

describe('iskanje po besedilu', () => {
  it('brez šumnikov in velikih črk', () => {
    expect(normalizeSearchText('  ŠPANIJA Čez ')).toBe('spanija cez');
  });

  it('najde po IATA, mestu, državi, prevozniku, imenu iskanja in lastniku; vse besede morajo ustrezati', () => {
    expect(offerMatchesQuery(cheaper, 'agp')).toBe(true);
    expect(offerMatchesQuery(cheaper, 'malaga')).toBe(true);
    expect(offerMatchesQuery(cheaper, 'spanija')).toBe(true);
    expect(offerMatchesQuery(cheaper, 'ryanair')).toBe(true);
    expect(offerMatchesQuery(cheaper, 'maja')).toBe(true);
    expect(offerMatchesQuery(cheaper, 'vce malaga')).toBe(true);
    expect(offerMatchesQuery(cheaper, 'vce frankfurt')).toBe(false);
    expect(offerMatchesQuery(cheaper, '')).toBe(true);
    expect(offerMatchesQuery(cheaper, '   ')).toBe(true);
  });
});

describe('filterOffers', () => {
  it('privzeto skrije pretečene; potrditveno polje jih pokaže', () => {
    expect(filterOffers(ALL, emptyOfferFilters(), NOW).map((o) => o.id)).toEqual(['fresh', 'cheaper', 'dearer']);
    expect(filterOffers(ALL, { ...emptyOfferFilters(), showExpired: true }, NOW)).toHaveLength(5);
  });

  it('filtri po iskanju, vrsti, direktnosti in besedilu se seštevajo', () => {
    expect(filterOffers(ALL, { ...emptyOfferFilters(), searchId: 's2' }, NOW).map((o) => o.id)).toEqual(['cheaper']);
    expect(filterOffers(ALL, { ...emptyOfferFilters(), kind: 'new' }, NOW).map((o) => o.id)).toEqual(['fresh']);
    expect(filterOffers(ALL, { ...emptyOfferFilters(), kind: 'new', showExpired: true }, NOW).map((o) => o.id)).toEqual(['departed', 'fresh']);
    expect(filterOffers(ALL, { ...emptyOfferFilters(), directOnly: true }, NOW).map((o) => o.id)).toEqual(['fresh', 'cheaper']);
    expect(filterOffers(ALL, { ...emptyOfferFilters(), query: 'nemcija', kind: 'down' }, NOW)).toEqual([]);
    expect(filterOffers(ALL, { ...emptyOfferFilters(), query: 'spanija', kind: 'down' }, NOW).map((o) => o.id)).toEqual(['cheaper']);
  });
});

describe('offerCounts', () => {
  it('števci vrst ne upoštevajo izbrane vrste, pretečene pa štejejo posebej', () => {
    const counts = offerCounts(ALL, { ...emptyOfferFilters(), kind: 'up' }, NOW);
    expect(counts).toEqual({ all: 3, new: 1, down: 1, up: 1, expired: 2 });
  });

  it('s prikazanimi pretečenimi se seštevek poveča, "expired" ostane informativen', () => {
    const counts = offerCounts(ALL, { ...emptyOfferFilters(), showExpired: true }, NOW);
    expect(counts).toEqual({ all: 5, new: 2, down: 1, up: 1, expired: 2 });
  });

  it('ostali filtri (iskanje, besedilo) zožijo tudi števce', () => {
    expect(offerCounts(ALL, { ...emptyOfferFilters(), query: 'nemcija' }, NOW)).toEqual({ all: 1, new: 0, down: 0, up: 1, expired: 0 });
  });
});

describe('razvrščanje', () => {
  it('privzeto po datumu odhoda naraščajoče; isti stolpec obrne smer, nov stolpec začne naraščajoče, čas podatka padajoče', () => {
    expect(DEFAULT_OFFER_SORT).toEqual({ key: 'departure', dir: 'asc' });
    expect(toggleOfferSort({ key: 'price', dir: 'asc' }, 'price')).toEqual({ key: 'price', dir: 'desc' });
    expect(toggleOfferSort({ key: 'price', dir: 'desc' }, 'departure')).toEqual({ key: 'departure', dir: 'asc' });
    expect(toggleOfferSort({ key: 'price', dir: 'asc' }, 'dataAt')).toEqual({ key: 'dataAt', dir: 'desc' });
  });

  it('po ceni v obe smeri', () => {
    expect(sortOffers([fresh, cheaper, dearer], { key: 'price', dir: 'asc' }).map((o) => o.id)).toEqual(['cheaper', 'fresh', 'dearer']);
    expect(sortOffers([fresh, cheaper, dearer], { key: 'price', dir: 'desc' }).map((o) => o.id)).toEqual(['dearer', 'fresh', 'cheaper']);
  });

  it('manjkajoča vrednost (enosmerno, brez spremembe) je na koncu ne glede na smer', () => {
    expect(sortOffers([dearer, fresh, cheaper], { key: 'return', dir: 'asc' }).map((o) => o.id)).toEqual(['cheaper', 'fresh', 'dearer']);
    expect(sortOffers([dearer, fresh, cheaper], { key: 'return', dir: 'desc' }).map((o) => o.id)).toEqual(['cheaper', 'fresh', 'dearer']);
    expect(sortOffers([fresh, dearer, cheaper], { key: 'change', dir: 'asc' }).map((o) => o.id)).toEqual(['cheaper', 'dearer', 'fresh']);
    expect(sortOffers([fresh, dearer, cheaper], { key: 'change', dir: 'desc' }).map((o) => o.id)).toEqual(['dearer', 'cheaper', 'fresh']);
  });

  it('izenačene vrstice loči cena; vhodno polje ostane nedotaknjeno', () => {
    const input = [dearer, fresh, cheaper];
    const sorted = sortOffers(input, { key: 'route', dir: 'asc' });
    expect(sorted.map((o) => o.id)).toEqual(['cheaper', 'dearer', 'fresh']);
    expect(input.map((o) => o.id)).toEqual(['dearer', 'fresh', 'cheaper']);
  });
});

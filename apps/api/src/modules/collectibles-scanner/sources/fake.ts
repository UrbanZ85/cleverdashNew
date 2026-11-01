import type { RetroProduct } from '../domain/retro-identify.js';
import { nameTokens } from '../domain/text.js';
import type { CatalogCard, RawListing } from '../domain/types.js';
import type { CardCatalogSource, ListingSource, RetroPrices, RetroPriceSource, SourceOutcome } from './types.js';

// TESTNI vir z IZMIŠLJENIMI podatki (019, FR-032). Samo za razvoj in avtomatizirane teste:
// `COLLECTIBLES_FAKE_SOURCE_ENABLED` je privzeto `false`, v produkciji ga `loadEnv` ZAVRNE (izmišljen oglas
// nikoli ne sme v dopis). Določena zgodba po zaporednih zagonih (`rt.runIndex`):
//
//   zagon 1: NOVO — kartice: Charizard Base Set unlimited (brez ocene: katalog ne loči izdaj), Charizard ex
//            125/197 neocenjena (ocena kataloga), isti PSA 9 in PSA 10 (druga različica), japonska (ročni
//            pregled), proxy, dražba, trije primerljivi oglasi; retro: Super Mario Land Game Boy loose,
//            CIB, NTSC-U, reprodukcija, konzola Game Boy Color (druga platforma), konzola defektna
//   zagon 2: dražba 6 → 8 € (sprememba ponudbe), ostalo enako
//   zagon 3: Charizard ex 125/197 neocenjena pocenitev 9 → 7 €
//   zagon 4: oglas C2b izgine (ob uspešnem odgovoru vira)

export const FAKE_ID = 'fake' as const;

const CARDS: CatalogCard[] = [
  {
    id: 'base1-4',
    language: 'en',
    name: 'Charizard',
    localId: '4',
    setId: 'base1',
    setName: 'Base Set',
    setOfficialCount: 102,
    rarity: 'Rare',
    imageUrl: 'https://assets.tcgdex.net/en/base/base1/4/low.webp',
    variants: { firstEdition: true, holo: true, normal: false, reverse: false },
    pricing: { source: 'cardmarket', currency: 'EUR', updatedAt: '2026-10-21T13:00:00.000Z', avg: 458.1, low: 95, trend: 252.57, avg7: 267.52, avg30: 401.22, trendHolo: null },
  },
  {
    id: 'sv3-125',
    language: 'en',
    name: 'Charizard ex',
    localId: '125',
    setId: 'sv3',
    setName: 'Obsidian Flames',
    setOfficialCount: 197,
    rarity: 'Double Rare',
    imageUrl: 'https://assets.tcgdex.net/en/sv/sv3/125/low.webp',
    variants: { firstEdition: false, holo: true, normal: false, reverse: false },
    pricing: { source: 'cardmarket', currency: 'EUR', updatedAt: '2026-10-21T13:00:00.000Z', avg: 13.5, low: 8, trend: 12, avg7: 12.4, avg30: 13, trendHolo: null },
  },
];

export const fakeCardCatalog: CardCatalogSource = {
  id: FAKE_ID,
  label: 'Testni vir (izmišljeni podatki)',
  disabledReason: () => null,
  async searchCards(_rt, query): Promise<SourceOutcome<CatalogCard[]>> {
    // Japonski katalog ima japonska imena: angleško ime ne najde ničesar (kot pri pravem viru).
    if (query.language !== 'en') return { ok: true, value: [], stale: false };
    const wanted = nameTokens(query.name);
    const hits = CARDS.filter((c) => wanted.every((w) => nameTokens(c.name).includes(w)) && (query.number === null || c.localId === query.number));
    return { ok: true, value: hits, stale: false };
  },
};

const PRODUCTS: RetroProduct[] = [
  { id: 'rp1', name: 'Super Mario Land', platform: 'gb', region: 'PAL' },
  { id: 'rp2', name: 'Super Mario Land', platform: 'gb', region: 'NTSC-U' },
];

export const fakeRetroPrices: RetroPriceSource = {
  id: FAKE_ID,
  label: 'Testni vir (izmišljeni podatki)',
  disabledReason: () => null,
  async findProducts(_rt, query): Promise<SourceOutcome<RetroProduct[]>> {
    const wanted = nameTokens(query.text);
    const hits = PRODUCTS.filter((p) => nameTokens(p.name).every((w) => wanted.includes(w)) && (query.platform === null || p.platform === query.platform));
    return { ok: true, value: hits, stale: false };
  },
  async getPrices(_rt, product): Promise<SourceOutcome<RetroPrices | null>> {
    // Izmišljen vir DAJE preverjene prodaje (basis 'sold'), da testi in razvoj pokažejo izračun dobička.
    // Pravi viri v tem obsegu prodaj ne dajejo (research §5).
    const pal = product.region === 'PAL';
    return {
      ok: true,
      value: {
        currency: 'EUR',
        basis: 'sold',
        updatedAt: '2026-10-21T13:00:00.000Z',
        periodMonths: 6,
        loose: { value: pal ? 14 : 9, count: 8 },
        cib: { value: pal ? 70 : 40, count: 5 },
        sealed: null,
      },
      stale: false,
    };
  },
};

function listing(partial: Partial<RawListing> & Pick<RawListing, 'itemId' | 'title' | 'price'>): RawListing {
  return {
    marketplace: 'EBAY_DE',
    description: null,
    listingType: 'FIXED_PRICE',
    endsAt: null,
    bidCount: null,
    conditionId: null,
    conditionText: null,
    sellerCountry: 'DE',
    shipping: { amount: 3, currency: 'EUR' },
    shippingKnown: true,
    url: `https://www.ebay.de/itm/${partial.itemId}`,
    images: [`https://i.ebayimg.com/images/g/${partial.itemId}/s-l500.jpg`],
    ...partial,
  };
}

const eur = (amount: number) => ({ amount, currency: 'EUR' });

export function fakeListings(runIndex: number, now: Date): RawListing[] {
  const out: RawListing[] = [
    // kartice
    listing({ itemId: 'C1', title: 'Pokemon Charizard 4/102 Base Set Unlimited Holo English', price: eur(200) }),
    listing({ itemId: 'C2', title: 'Pokemon Charizard ex 125/197 Obsidian Flames English', price: eur(runIndex >= 3 ? 7 : 9) }),
    listing({ itemId: 'C2a', title: 'Pokemon Charizard ex 125/197 Obsidian Flames English NM', price: eur(11) }),
    listing({ itemId: 'C2c', title: 'Pokemon Charizard ex 125/197 Obsidian Flames English', price: eur(12) }),
    listing({ itemId: 'C2d', title: 'Pokemon Charizard ex 125/197 Obsidian Flames English mint', price: eur(10) }),
    listing({ itemId: 'C3', title: 'Pokemon Charizard ex 125/197 Obsidian Flames English PSA 9', price: eur(45) }),
    listing({ itemId: 'C4', title: 'Pokemon Charizard ex 125/197 Obsidian Flames English PSA 10', price: eur(90) }),
    listing({ itemId: 'C5', title: 'Pokemon Charizard ex 125/197 Japanese', price: eur(14) }),
    listing({ itemId: 'C6', title: 'Pokemon Charizard ex 125/197 proxy custom card', price: eur(2) }),
    listing({
      itemId: 'C7',
      title: 'Pokemon Charizard ex 125/197 Obsidian Flames English',
      price: eur(runIndex >= 2 ? 8 : 6),
      listingType: 'AUCTION',
      endsAt: new Date(now.getTime() + 3 * 3_600_000),
      bidCount: runIndex >= 2 ? 4 : 2,
    }),
    // retro igre (stanje "rabljeno", razen okvarjene konzole)
    listing({ itemId: 'R1', title: 'Super Mario Land Game Boy PAL cartridge only tested', price: eur(12), conditionId: '3000' }),
    listing({ itemId: 'R2', title: 'Super Mario Land Game Boy PAL CIB complete', price: eur(40), conditionId: '3000' }),
    listing({ itemId: 'R3', title: 'Super Mario Land Game Boy NTSC-U loose', price: eur(15), conditionId: '3000' }),
    listing({ itemId: 'R4', title: 'Super Mario Land Game Boy repro cartridge', price: eur(8), conditionId: '3000' }),
    listing({ itemId: 'R5', title: 'Game Boy Color console Atomic Purple PAL working', price: eur(50), conditionId: '3000' }),
    listing({ itemId: 'R6', title: 'Game Boy console DMG PAL defekt for parts', price: eur(10), conditionId: '7000' }),
  ];
  return runIndex >= 4 ? out.filter((l) => l.itemId !== 'C2a') : out;
}

export const fakeListingSource: ListingSource = {
  id: FAKE_ID,
  label: 'Testni vir (izmišljeni podatki)',
  disabledReason: () => null,
  async search(rt, query): Promise<SourceOutcome<RawListing[]>> {
    const words = nameTokens(query.q);
    const hits = fakeListings(rt.runIndex, rt.now).filter((l) => words.length === 0 || words.every((w) => nameTokens(l.title).includes(w)));
    return { ok: true, value: hits, stale: false };
  },
};

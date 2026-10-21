import type { PriceGuide } from '../domain/valuation.js';
import { normalizeName } from '../domain/set-number.js';
import type { CatalogSet, RawListing } from '../domain/types.js';
import type { CatalogSource, ListingSource, PriceSource, SourceOutcome } from './types.js';

// TESTNI vir z IZMIŠLJENIMI podatki (018, FR-006). Samo za razvoj in avtomatizirane teste:
// `LEGO_FAKE_SOURCE_ENABLED` je privzeto `false`, v produkciji ga `loadEnv` ZAVRNE (izmišljen oglas
// nikoli ne sme v dopis). Isti vzorec kot testni vir letov: določena zgodba po zaporednih zagonih
// (`rt.runIndex`), da se v štirih zagonih zgodi vse, kar jedro in tip morata znati:
//
//   zagon 1: NOVO — set 75192 (350 €), rabljen 75192 (neznana kompletnost), paket, deli, prazna škatla,
//            Technic 42115 kompleten rabljen, dražba 75257 (60 €, izteka čez 3 h), Technic 42115 nov,
//            "Millennium Falcon" brez številke (dvoumno)
//   zagon 2: dražba 70 € (sprememba ponudbe), ostalo enako
//   zagon 3: 75192 pocenitev na 330 €
//   zagon 4: Technic 42115 nov izgine (ob uspešnem odgovoru vira)

export const FAKE_ID = 'fake' as const;

const CATALOG: CatalogSet[] = [
  { setNumber: '75192-1', name: 'Millennium Falcon', year: 2017, themeId: 158, theme: 'Star Wars', subtheme: 'Ultimate Collector Series', pieces: 7541, imageUrl: 'https://cdn.rebrickable.com/media/sets/75192-1.jpg', url: 'https://rebrickable.com/sets/75192-1/' },
  { setNumber: '75257-1', name: 'Millennium Falcon', year: 2019, themeId: 158, theme: 'Star Wars', subtheme: null, pieces: 1351, imageUrl: 'https://cdn.rebrickable.com/media/sets/75257-1.jpg', url: 'https://rebrickable.com/sets/75257-1/' },
  { setNumber: '10179-1', name: "Ultimate Collector's Millennium Falcon", year: 2007, themeId: 158, theme: 'Star Wars', subtheme: 'Ultimate Collector Series', pieces: 5195, imageUrl: null, url: null },
  { setNumber: '42115-1', name: 'Lamborghini Sián FKP 37', year: 2020, themeId: 1, theme: 'Technic', subtheme: null, pieces: 3696, imageUrl: 'https://cdn.rebrickable.com/media/sets/42115-1.jpg', url: 'https://rebrickable.com/sets/42115-1/' },
];

function guide(avg: number, count: number): PriceGuide {
  const details = Array.from({ length: Math.min(count, 12) }, (_, i) => ({ unitPrice: Math.round((avg + (i - (Math.min(count, 12) - 1) / 2) * (avg / 50)) * 100) / 100, quantity: 1 }));
  return { currency: 'EUR', average: avg, qtyAverage: avg, min: Math.round(avg * 0.8), max: Math.round(avg * 1.2), count, details };
}

const SOLD: Record<string, { N?: PriceGuide; U?: PriceGuide }> = {
  '75192-1': { N: guide(550, 14), U: guide(420, 4) },
  '75257-1': { N: guide(160, 20), U: guide(110, 9) },
  '10179-1': { N: guide(3200, 2) },
  '42115-1': { N: guide(360, 8), U: guide(280, 5) },
};

export const fakeCatalog: CatalogSource = {
  id: FAKE_ID,
  label: 'Testni vir (izmišljeni podatki)',
  disabledReason: () => null,
  async getSet(_rt, setNumber): Promise<SourceOutcome<CatalogSet | null>> {
    return { ok: true, value: CATALOG.find((c) => c.setNumber === setNumber) ?? null, stale: false };
  },
  async searchByName(_rt, query): Promise<SourceOutcome<CatalogSet[]>> {
    const words = normalizeName(query).split(' ').filter(Boolean);
    const hits = words.length === 0 ? [] : CATALOG.filter((c) => words.every((w) => normalizeName(c.name).includes(w)));
    return { ok: true, value: hits, stale: false };
  },
};

export const fakePrices: PriceSource = {
  id: FAKE_ID,
  label: 'Testni vir (izmišljeni podatki)',
  disabledReason: () => null,
  async getPriceGuide(_rt, setNumber, newOrUsed, kind): Promise<SourceOutcome<PriceGuide | null>> {
    const sold = SOLD[setNumber]?.[newOrUsed] ?? null;
    if (!sold) return { ok: true, value: null, stale: false };
    if (kind === 'sold') return { ok: true, value: sold, stale: false };
    // Aktivne ponudbe: namenoma višje od prodaj (ponudbe niso prodajne cene).
    return { ok: true, value: { currency: 'EUR', average: Math.round((sold.average ?? 0) * 1.15), qtyAverage: null, min: Math.round((sold.min ?? 0) * 1.1), max: null, count: 3, details: null }, stale: false };
  },
};

function listing(partial: Partial<RawListing> & Pick<RawListing, 'itemId' | 'title' | 'price'>): RawListing {
  return {
    marketplace: 'EBAY_DE',
    description: null,
    listingType: 'FIXED_PRICE',
    endsAt: null,
    bidCount: null,
    conditionId: '1000',
    conditionText: 'New',
    sellerCountry: 'DE',
    shipping: { amount: 20, currency: 'EUR' },
    shippingKnown: true,
    url: `https://www.ebay.de/itm/${partial.itemId}`,
    images: [`https://i.ebayimg.com/images/g/${partial.itemId}/s-l500.jpg`],
    ...partial,
  };
}

export function fakeListings(runIndex: number, now: Date): RawListing[] {
  const out: RawListing[] = [
    listing({ itemId: 'F1', title: 'LEGO Star Wars 75192 Millennium Falcon NEU OVP', price: { amount: runIndex >= 3 ? 330 : 350, currency: 'EUR' } }),
    listing({ itemId: 'F2', title: 'LEGO 75192 Millennium Falcon gebraucht', price: { amount: 300, currency: 'EUR' }, conditionId: '3000', conditionText: 'Used', shipping: { amount: 25, currency: 'EUR' } }),
    listing({ itemId: 'F3', title: 'LEGO Star Wars Konvolut 10179 und 75192 Sets', price: { amount: 900, currency: 'EUR' }, conditionId: '3000', conditionText: 'Used' }),
    listing({ itemId: 'F4', title: 'LEGO Teile Konvolut Star Wars 1kg', price: { amount: 25, currency: 'EUR' }, conditionId: '3000', conditionText: 'Used', shipping: { amount: 6, currency: 'EUR' } }),
    listing({ itemId: 'F5', title: 'Leere Box LEGO 75192 Karton', price: { amount: 30, currency: 'EUR' }, conditionId: '3000', conditionText: 'Used', shipping: { amount: 9, currency: 'EUR' } }),
    listing({ itemId: 'F6', title: 'LEGO Technic 42115 Lamborghini Sián komplett gebraucht', price: { amount: 250, currency: 'EUR' }, conditionId: '3000', conditionText: 'Used', shipping: { amount: 15, currency: 'EUR' } }),
    listing({
      itemId: 'F7',
      title: 'LEGO Star Wars 75257 Millennium Falcon NEU',
      price: { amount: runIndex >= 2 ? 70 : 60, currency: 'EUR' },
      listingType: 'AUCTION',
      endsAt: new Date(now.getTime() + 3 * 3_600_000),
      bidCount: runIndex >= 2 ? 4 : 2,
      shipping: { amount: 12, currency: 'EUR' },
    }),
    listing({ itemId: 'F9', title: 'LEGO Millennium Falcon neu', price: { amount: 150, currency: 'EUR' } }),
  ];
  if (runIndex < 4) out.push(listing({ itemId: 'F8', title: 'LEGO Technic 42115 Lamborghini Sián NEU OVP', price: { amount: 300, currency: 'EUR' }, shipping: { amount: 0, currency: 'EUR' } }));
  return out;
}

export const fakeListingSource: ListingSource = {
  id: FAKE_ID,
  label: 'Testni vir (izmišljeni podatki)',
  disabledReason: () => null,
  async search(rt, query): Promise<SourceOutcome<RawListing[]>> {
    const words = normalizeName(query.q).split(' ').filter(Boolean);
    const hits = fakeListings(rt.runIndex, rt.now)
      .filter((l) => l.marketplace === query.marketplace || query.marketplace === 'EBAY_DE')
      .filter((l) => words.length === 0 || words.every((w) => normalizeName(l.title).includes(w)));
    return { ok: true, value: hits, stale: false };
  },
};

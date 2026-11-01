import type { Env } from '../../../platform/config/env.js';
import { createPacer } from '../../../platform/external-sources/pacer.js';
import { EBAY_GAP_MS, ebayListings } from './ebay.js';
import { fakeCardCatalog, fakeListingSource, fakeRetroPrices } from './fake.js';
import { PRICECHARTING_GAP_MS, pricechartingPrices } from './pricecharting.js';
import { TCGDEX_GAP_MS, tcgdexCatalog } from './tcgdex.js';
import type { ResolvedSources, SourceId, SourceRuntime } from './types.js';

// Kateri viri so v tej namestitvi vklopljeni (research §3, §4). Vir je vklopljen SAMO z ustreznimi ključi
// v okolju (eBay: oba ključa; PriceCharting: ključ; TCGdex ključa ne potrebuje); testni vir (izmišljeni
// podatki) nadomesti vse tri vloge in v produkciji ne more biti vklopljen (`loadEnv`). Nov vir = nova
// datoteka + tu ena vrstica (FR-011).

export function resolveSources(env: Env): ResolvedSources {
  if (env.COLLECTIBLES_FAKE_SOURCE_ENABLED) {
    return { listings: fakeListingSource, cardCatalog: fakeCardCatalog, retroPrices: fakeRetroPrices, reasons: { listings: null, cardCatalog: null, retroPrices: null }, fake: true };
  }
  const listingsReason = ebayListings.disabledReason(env);
  const catalogReason = tcgdexCatalog.disabledReason(env);
  const pricesReason = pricechartingPrices.disabledReason(env);
  return {
    listings: listingsReason ? null : ebayListings,
    cardCatalog: catalogReason ? null : tcgdexCatalog,
    retroPrices: pricesReason ? null : pricechartingPrices,
    reasons: { listings: listingsReason, cardCatalog: catalogReason, retroPrices: pricesReason },
    fake: false,
  };
}

export interface RuntimeOptions {
  /** Testi: ničelni razmiki. */
  noPacing?: boolean;
}

/** Izvajalno okolje virov za en zagon: razmiki po virih so deljeni med vsemi klici zagona. */
export function createRuntime(params: { env: Env; logger: SourceRuntime['logger']; now: Date; runIndex: number }, options: RuntimeOptions = {}): SourceRuntime {
  const gaps: Record<SourceId, number> = { ebay: EBAY_GAP_MS, tcgdex: TCGDEX_GAP_MS, pricecharting: PRICECHARTING_GAP_MS, fake: 0 };
  const pacers = new Map<SourceId, () => Promise<void>>();
  return {
    ...params,
    pace(source) {
      if (options.noPacing || gaps[source] === 0) return Promise.resolve();
      let pacer = pacers.get(source);
      if (!pacer) {
        pacer = createPacer(gaps[source]);
        pacers.set(source, pacer);
      }
      return pacer();
    },
  };
}

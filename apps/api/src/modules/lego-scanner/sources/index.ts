import type { Env } from '../../../platform/config/env.js';
import { bricklinkPrices, BRICKLINK_GAP_MS } from './bricklink.js';
import { ebayListings, EBAY_GAP_MS } from './ebay.js';
import { fakeCatalog, fakeListingSource, fakePrices } from './fake.js';
import { rebrickableCatalog, REBRICKABLE_GAP_MS } from './rebrickable.js';
import type { ResolvedSources, SourceId, SourceRuntime } from './types.js';
import { createPacer } from '../util/pacer.js';

// Kateri viri so v tej namestitvi vklopljeni (research §2). Vir je vklopljen SAMO s ključi v okolju;
// testni vir (izmišljeni podatki) nadomesti vse tri vloge in v produkciji ne more biti vklopljen
// (`loadEnv`). Nov vir = nova datoteka + tu ena vrstica (FR-009).

export function resolveSources(env: Env): ResolvedSources {
  if (env.LEGO_FAKE_SOURCE_ENABLED) {
    return { catalog: fakeCatalog, prices: fakePrices, listings: fakeListingSource, reasons: { catalog: null, prices: null, listings: null }, fake: true };
  }
  const catalogReason = rebrickableCatalog.disabledReason(env);
  const pricesReason = bricklinkPrices.disabledReason(env);
  const listingsReason = ebayListings.disabledReason(env);
  return {
    catalog: catalogReason ? null : rebrickableCatalog,
    prices: pricesReason ? null : bricklinkPrices,
    listings: listingsReason ? null : ebayListings,
    reasons: { catalog: catalogReason, prices: pricesReason, listings: listingsReason },
    fake: false,
  };
}

export interface RuntimeOptions {
  /** Testi: ničelni razmiki. */
  noPacing?: boolean;
}

/** Izvajalno okolje virov za en zagon: razmiki po virih so deljeni med vsemi klici zagona. */
export function createRuntime(params: { env: Env; logger: SourceRuntime['logger']; now: Date; runIndex: number }, options: RuntimeOptions = {}): SourceRuntime {
  const gaps: Record<SourceId, number> = { rebrickable: REBRICKABLE_GAP_MS, bricklink: BRICKLINK_GAP_MS, ebay: EBAY_GAP_MS, fake: 0 };
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

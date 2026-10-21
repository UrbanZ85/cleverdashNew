import type { ResultView, ScannerType } from '../../platform/scanner/types.js';
import { describeLegoConfig, legoConfigSchema, validateLegoConfig, type LegoConfig } from './config.js';
import { executeLego } from './execute.js';
import { legoNotificationHooks, type LegoDigestItem } from './notifications.js';
import type { LegoResultData } from './domain/types.js';

// Tip `lego` (018). `single` + `generic`: vsako iskanje ima svoje filtre in urnik, rezultati so zasebni
// zapisi lastnika v generični shrambi jedra. `isEnabled: () => true` — tip mora biti izbiren tudi brez
// ključev virov: obrazec in zagon povesta, kaj manjka (spec US1.3). Po vzoru `echo` (016).

const EBAY_HOSTS = ['ebay.de', 'ebay.it', 'ebay.com'] as const;

/** Vhod za analizo z umetno inteligenco (017): samo podatki oglasa in kataloga, brez oseb (FR-003, FR-022). */
export function describeForAi(result: ResultView) {
  const data = (result.data ?? {}) as Partial<LegoResultData>;
  const lego = data.lego;
  const id = data.identification;
  const v = data.valuation;
  const opp = data.opportunity;
  const attributes: Record<string, string | number | boolean | null> = {
    set_number: lego?.setNumber ?? null,
    set_name: lego?.setName ?? null,
    theme: lego?.theme ?? null,
    subtheme: lego?.subtheme ?? null,
    release_year: lego?.releaseYear ?? null,
    piece_count: lego?.pieceCount ?? null,
    condition: lego?.condition ?? null,
    completeness_verified: lego?.completenessVerified ?? null,
    box_included: lego?.boxIncluded ?? null,
    instructions_included: lego?.instructionsIncluded ?? null,
    listing_type: lego?.listingType ?? null,
    seller_country: lego?.sellerCountry ?? null,
    shipping_cost: lego?.shippingCost ?? null,
    marketplace: data.listing?.marketplace ?? null,
    identification_kind: id?.kind ?? null,
    identification_confidence: id?.confidence ?? null,
    identification_needs_review: id?.needsReview ?? null,
    identification_reason: id?.reason ?? null,
    sold_average_eur: v?.comparable ? (v.average ?? null) : null,
    sold_count_6_months: v?.comparable ? v.salesCount : null,
    valuation_confidence: v?.confidence ?? null,
    missing_for_profit: opp && opp.missing.length > 0 ? opp.missing.join(', ') : null,
  };
  return {
    title: result.title,
    description: id?.catalog?.name ?? null,
    source: result.source,
    price: result.price,
    previousPrice: result.previousPrice ? { amount: result.previousPrice.amount, currency: result.previousPrice.currency } : null,
    attributes,
    images: (data.listing?.images ?? []).filter((u) => /^https:\/\/[^/]*ebayimg\.com\//.test(u)).slice(0, 3),
  };
}

export const legoScannerType: ScannerType<LegoConfig, LegoDigestItem> = {
  type: 'lego',
  label: 'LEGO skener',
  icon: 'cube-outline',
  description: 'Podcenjeni LEGO seti na tržnicah: katalog, tržna vrednost iz prodaj, ocena priložnosti in obvestilo.',
  execution: 'single',
  results: 'generic',
  allowedResultHosts: EBAY_HOSTS,
  isEnabled: () => true,
  configSchema: legoConfigSchema,
  validateConfig: (config, env) => validateLegoConfig(config, env),
  describeConfig: describeLegoConfig,
  execute: executeLego,
  notifications: legoNotificationHooks,
  ai: {
    subject:
      'LEGO oglas na tržnici (set, paket, deli ali prazna škatla). Ne trdi, da je izdelek pristen ali ponaredek na podlagi slik; ne ocenjuj cen, vrednosti, stroškov ali dobičkov — vsi zneski so že izračunani v podatkih. Poišči morebitno številko seta v besedilu, manjkajoče dele, poškodovano škatlo ali sumljive trditve in jih opiši',
    describe: describeForAi,
  },
};

import type { ResultView, ScannerType } from '../../platform/scanner/types.js';
import { collectiblesConfigSchema, describeCollectiblesConfig, validateCollectiblesConfig, type CollectiblesConfig } from './config.js';
import { ALLOWED_RESULT_HOSTS, executeCollectibles } from './execute.js';
import { collectiblesNotificationHooks, type CollectiblesDigestItem } from './notifications.js';
import type { CollectiblesResultData } from './domain/types.js';

// Tip `collectibles` (019). `single` + `generic`: vsako iskanje ima svoje filtre in urnik, rezultati so
// zasebni zapisi lastnika v generični shrambi jedra. `isEnabled: () => true` — tip mora biti izbiren tudi
// brez ključev virov: obrazec in zagon povesta, kaj manjka (spec US1.3). Po vzoru `lego` (018).

/** Vhod za analizo z umetno inteligenco (017): samo podatki oglasa in kataloga, brez oseb (FR-028). */
export function describeForAi(result: ResultView) {
  const data = (result.data ?? {}) as Partial<CollectiblesResultData>;
  const c = data.collectible;
  const id = data.identification;
  const v = data.valuation;
  const opp = data.opportunity;
  const attributes: Record<string, string | number | boolean | null> = {
    category: c?.category ?? null,
    name: c?.name ?? null,
    catalog_id: c?.catalogId ?? null,
    set_name: c?.card?.setName ?? null,
    card_number: c?.card?.cardNumber ?? null,
    language: c?.language ?? null,
    edition: c?.edition ?? null,
    finish: c?.card?.finish ?? null,
    grading_company: c?.gradingCompany ?? null,
    grade: c?.grade ?? null,
    platform: c?.retro?.platform ?? null,
    region: c?.region ?? null,
    completeness: c?.completeness ?? null,
    working: c?.retro?.working ?? null,
    condition: c?.condition ?? null,
    listing_type: c?.listingType ?? data.listing?.listingType ?? null,
    seller_country: c?.sellerCountry ?? null,
    marketplace: data.listing?.marketplace ?? null,
    shipping_cost: data.listing?.shippingKnown && data.listing.shipping ? data.listing.shipping.amount : null,
    identification_kind: id?.kind ?? null,
    identification_confidence: id?.confidence ?? null,
    identification_needs_review: id?.needsReview ?? null,
    identification_reason: id?.reason ?? null,
    identification_ambiguities: id && id.ambiguities.length > 0 ? id.ambiguities.join(', ') : null,
    value_basis: v?.comparable ? (v.primary ?? null) : null,
    value_confidence: v?.confidence ?? null,
    discount_pct: opp?.discountPct ?? null,
    discount_basis: opp?.discountBasis ?? null,
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

export const collectiblesScannerType: ScannerType<CollectiblesConfig, CollectiblesDigestItem> = {
  type: 'collectibles',
  label: 'Zbirateljski predmeti',
  icon: 'albums-outline',
  description: 'Zbirateljske kartice (Pokémon) in retro igre: prepoznava različice, vrednost iz označenih virov, ocena priložnosti in obvestilo.',
  execution: 'single',
  results: 'generic',
  allowedResultHosts: ALLOWED_RESULT_HOSTS,
  isEnabled: () => true,
  configSchema: collectiblesConfigSchema,
  validateConfig: (config, env) => validateCollectiblesConfig(config, env),
  describeConfig: describeCollectiblesConfig,
  execute: executeCollectibles,
  notifications: collectiblesNotificationHooks,
  ai: {
    subject:
      'zbirateljski predmet na tržnici (Pokémon kartica ali retro igra/konzola). Ne trdi, da je predmet pristen ali ponaredek na podlagi slik; ne ocenjuj cen, vrednosti, stroškov popravila ali dobičkov — vsi zneski so že izračunani v podatkih. Poišči možne različice (izdaja, jezik, regija, ocena), manjkajoče dele ali embalažo, poškodbe in sumljive trditve v opisu in jih opiši',
    describe: describeForAi,
  },
};

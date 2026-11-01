// Tržnice eBay, ki jih podpirajo skenerji (Browse API, glava `X-EBAY-C-MARKETPLACE-ID`). Skupen seznam, da
// LEGO in zbirateljski skener ne razhajata. Vsaka tržnica pove gostitelja povezav oglasov (za
// `allowedResultHosts`), valuto, v kateri so oglasi, in ali je prodajalec praviloma v EU.
//
// Namestitev določi, katere tržnice sploh dovoli (`EBAY_MARKETPLACES` v okolju); iskanje izbira iz tega nabora.
//
// ⚠ Oglasi na tržnicah izven evrskega območja (GB, PL, US) so v GBP/PLN/USD. Cenik virov vrednosti je v EUR/USD
// in pretvorbe valut ni: tak oglas je brez primerljive vrednosti in dobička, ob nastavljeni najnižji/najvišji ceni
// v drugi valuti pa je izločen (primerjava ni mogoča).

export interface EbayMarketplaceInfo {
  id: string;
  /** Slovensko ime za vmesnik. */
  label: string;
  /** Gostitelj povezav oglasov (ujema se tudi poddomena, npr. `www.ebay.de`). */
  host: string;
  /** Valuta oglasov na tej tržnici. */
  currency: string;
  /** Tržnica države članice EU (prodajalci so praviloma tam; davki se vseeno računajo po državi prodajalca). */
  eu: boolean;
}

export const EBAY_MARKETPLACE_INFO: readonly EbayMarketplaceInfo[] = [
  { id: 'EBAY_DE', label: 'eBay Nemčija', host: 'ebay.de', currency: 'EUR', eu: true },
  { id: 'EBAY_IT', label: 'eBay Italija', host: 'ebay.it', currency: 'EUR', eu: true },
  { id: 'EBAY_FR', label: 'eBay Francija', host: 'ebay.fr', currency: 'EUR', eu: true },
  { id: 'EBAY_ES', label: 'eBay Španija', host: 'ebay.es', currency: 'EUR', eu: true },
  { id: 'EBAY_AT', label: 'eBay Avstrija', host: 'ebay.at', currency: 'EUR', eu: true },
  { id: 'EBAY_NL', label: 'eBay Nizozemska', host: 'ebay.nl', currency: 'EUR', eu: true },
  { id: 'EBAY_BE', label: 'eBay Belgija', host: 'ebay.be', currency: 'EUR', eu: true },
  { id: 'EBAY_IE', label: 'eBay Irska', host: 'ebay.ie', currency: 'EUR', eu: true },
  { id: 'EBAY_PL', label: 'eBay Poljska', host: 'ebay.pl', currency: 'PLN', eu: true },
  { id: 'EBAY_GB', label: 'eBay Združeno kraljestvo', host: 'ebay.co.uk', currency: 'GBP', eu: false },
  { id: 'EBAY_US', label: 'eBay ZDA', host: 'ebay.com', currency: 'USD', eu: false },
];

/** Identifikatorji tržnic, kot enum za Zod (`z.enum`). */
export const EBAY_MARKETPLACE_IDS = EBAY_MARKETPLACE_INFO.map((m) => m.id) as [string, ...string[]];

/** Gostitelji povezav oglasov za `allowedResultHosts` (brez podvojenih). */
export const EBAY_RESULT_HOSTS: readonly string[] = [...new Set(['ebay.com', ...EBAY_MARKETPLACE_INFO.map((m) => m.host)])];

/** Tržnice, ki jih namestitev dovoli (`EBAY_MARKETPLACES`), v vrstnem redu seznama in samo znane. */
export function allowedEbayMarketplaces(env: { EBAY_MARKETPLACES: string }): string[] {
  const wanted = env.EBAY_MARKETPLACES.split(',').map((s) => s.trim().toUpperCase());
  return EBAY_MARKETPLACE_IDS.filter((m) => wanted.includes(m));
}

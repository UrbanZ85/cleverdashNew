import type { EbayQuery } from '../../../platform/ebay/client.js';
import type { Env } from '../../../platform/config/env.js';
import type { SourceOutcome, SourceRuntimeBase } from '../../../platform/external-sources/types.js';
import type { RetroProduct } from '../domain/retro-identify.js';
import type { CardLanguage, CatalogCard, RawListing } from '../domain/types.js';

// Vmesniki virov zbirateljskega skenerja (019, research §3, §4). Isti dogovor kot LEGO in leti: vir NE
// vrača surovih odgovorov — vrne razčlenjene, normalizirane vrednosti ali izid z razlogom. Prenos gre
// vedno prek `platform/external-sources/http.ts` (skupni predpomnilnik, dnevna meja, razmik, časovna
// omejitev). Nov vir je nova datoteka in ena vrstica v `sources/index.ts`.

export type { FailureCode, SourceOutcome } from '../../../platform/external-sources/types.js';

export type SourceId = 'ebay' | 'tcgdex' | 'pricecharting' | 'fake';

/** Kar vir potrebuje za delo: okolje, dnevnik, "zdaj" in razmiki (testi jih ničelno nastavijo). */
export interface SourceRuntime extends Omit<SourceRuntimeBase, 'pace'> {
  /** Zaporedna številka zagona tega skenerja (1, 2, …) — samo testni vir z deterministično zgodbo. */
  runIndex: number;
  /** Počakaj do naslednjega dovoljenega klica vira; `undefined` = brez razmika. */
  pace(source: SourceId): Promise<void>;
}

export interface CardCatalogSource {
  readonly id: SourceId;
  readonly label: string;
  /** `null` = vklopljen; sicer slovenski razlog. */
  disabledReason(env: Env): string | null;
  /**
   * Kartice, katerih ime vsebuje iskano besedo, v izbranem jeziku. Kadar je številka znana, vir vrne
   * podrobnosti (set, različice, cene) samo za kartice s to številko; brez nje samo osnovne podatke.
   */
  searchCards(rt: SourceRuntime, query: { name: string; language: CardLanguage; number: string | null }): Promise<SourceOutcome<CatalogCard[]>>;
}

/** Cena iz cenika retro iger za eno stanje. */
export interface PriceQuote {
  value: number;
  /** Število prodaj, kadar vir to pove (samo `basis: 'sold'`). */
  count: number | null;
}

export interface RetroPrices {
  currency: string;
  /** `guide` = cenik (ocena); `sold` = vir daje preverjene prodaje. */
  basis: 'guide' | 'sold';
  updatedAt: string | null;
  periodMonths: number | null;
  loose: PriceQuote | null;
  cib: PriceQuote | null;
  sealed: PriceQuote | null;
}

export interface RetroPriceSource {
  readonly id: SourceId;
  readonly label: string;
  disabledReason(env: Env): string | null;
  findProducts(rt: SourceRuntime, query: { text: string; platform: string | null }): Promise<SourceOutcome<RetroProduct[]>>;
  getPrices(rt: SourceRuntime, product: RetroProduct): Promise<SourceOutcome<RetroPrices | null>>;
}

export type ListingQuery = EbayQuery;

export interface ListingSource {
  readonly id: SourceId;
  readonly label: string;
  disabledReason(env: Env): string | null;
  search(rt: SourceRuntime, query: ListingQuery): Promise<SourceOutcome<RawListing[]>>;
}

export interface ResolvedSources {
  listings: ListingSource | null;
  cardCatalog: CardCatalogSource | null;
  retroPrices: RetroPriceSource | null;
  /** Razlogi po vlogi, kadar vira ni. */
  reasons: { listings: string | null; cardCatalog: string | null; retroPrices: string | null };
  fake: boolean;
}

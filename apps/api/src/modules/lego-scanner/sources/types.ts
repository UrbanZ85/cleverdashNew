import type { Env } from '../../../platform/config/env.js';
import type { Logger } from '../../../platform/logging/logger.js';
import type { PriceGuide } from '../domain/valuation.js';
import type { CatalogSet, ListingType, LegoMarketplace, RawListing } from '../domain/types.js';

// Vmesniki virov LEGO skenerja (018, research §2). Isti dogovor kot `flight-deals/providers`: vir NE
// vrača surovih odgovorov — vrne razčlenjene, normalizirane vrednosti ali izid z razlogom. Prenos gre
// vedno prek `sources/http.ts` (skupni predpomnilnik, dnevna meja, razmik, časovna omejitev). Nov vir
// je nova datoteka in ena vrstica v `sources/index.ts`; Bolha ali trgovina sta lahko novi
// `ListingSource` brez sprememb ostale kode.

export type SourceId = 'rebrickable' | 'bricklink' | 'ebay' | 'fake';

export type FailureCode = 'disabled' | 'daily-limit' | 'rate-limited' | 'unauthorized' | 'unreachable' | 'invalid';

export type SourceOutcome<T> = { ok: true; value: T; stale: boolean } | { ok: false; code: FailureCode; message: string };

/** Kar vir potrebuje za delo: okolje, dnevnik, "zdaj" in razmiki (testi jih ničelno nastavijo). */
export interface SourceRuntime {
  env: Env;
  logger: Logger | undefined;
  now: Date;
  /** Zaporedna številka zagona tega skenerja (1, 2, …) — samo testni vir z deterministično zgodbo. */
  runIndex: number;
  /** Počakaj do naslednjega dovoljenega klica vira; `undefined` = brez razmika. */
  pace(source: SourceId): Promise<void>;
}

export interface CatalogSource {
  readonly id: SourceId;
  readonly label: string;
  /** `null` = vklopljen; sicer slovenski razlog. */
  disabledReason(env: Env): string | null;
  getSet(rt: SourceRuntime, setNumber: string): Promise<SourceOutcome<CatalogSet | null>>;
  searchByName(rt: SourceRuntime, query: string): Promise<SourceOutcome<CatalogSet[]>>;
}

export interface PriceSource {
  readonly id: SourceId;
  readonly label: string;
  disabledReason(env: Env): string | null;
  /** `null` v vrednosti = vir seta ne pozna ali za stanje ni podatkov. */
  getPriceGuide(rt: SourceRuntime, setNumber: string, newOrUsed: 'N' | 'U', guide: 'sold' | 'stock', currency: string): Promise<SourceOutcome<PriceGuide | null>>;
}

export interface ListingQuery {
  marketplace: LegoMarketplace;
  /** Iskalni niz (številka seta ali ključne besede, z "LEGO"). */
  q: string;
  minPrice?: number;
  maxPrice?: number;
  currency: string;
  /** eBay `conditionIds`; `null` = brez omejitve. */
  conditionIds: string[] | null;
  listingTypes: readonly ListingType[];
  sellerCountries: readonly string[];
  /** Dostava v to državo (Slovenija). */
  deliveryCountry: string;
  maxPages: number;
}

export interface ListingSource {
  readonly id: SourceId;
  readonly label: string;
  disabledReason(env: Env): string | null;
  search(rt: SourceRuntime, query: ListingQuery): Promise<SourceOutcome<RawListing[]>>;
}

export interface ResolvedSources {
  catalog: CatalogSource | null;
  prices: PriceSource | null;
  listings: ListingSource | null;
  /** Razlogi po vlogi, kadar vira ni. */
  reasons: { catalog: string | null; prices: string | null; listings: string | null };
  fake: boolean;
}

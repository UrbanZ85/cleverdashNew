import type { ZodTypeAny } from 'zod';
import type { Env } from '../../../platform/config/env.js';
import type { CollectibleAttributes, CollectibleCategoryId, CollectibleCondition, Identification, RawListing, Valuation } from '../domain/types.js';
import type { FailureCode, ResolvedSources, SourceRuntime } from '../sources/types.js';

// Register kategorij zbirateljskih predmetov (019, FR-003). Vsaka kategorija je ENA datoteka, ki izpolni
// `CategoryHandler`; dodajanje kategorije je nova datoteka + ena vrstica v `registry.ts`, brez sprememb
// jedra skenerjev ali odjemalca (obrazec se zgradi iz `fields`).

/** Opis polja za dinamični obrazec odjemalca (`GET /collectibles-scanner/categories`). */
export interface FieldDescriptor {
  /** Pot v `config`, npr. `cards.gradingCompany`. */
  key: string;
  label: string;
  kind: 'text' | 'number' | 'select' | 'multiselect' | 'boolean';
  options?: Array<{ value: string; label: string }>;
  help?: string;
}

/** Stanje enega zagona, ki ga kategorija potrebuje za poizvedbe po katalogu in ceniku. */
export interface CategoryRun {
  env: Env;
  rt: SourceRuntime;
  sources: ResolvedSources;
  /** Zapiši napako vira (enkrat na vir in kodo); zagon se zaradi nje ne ruši. */
  fail(source: string, code: FailureCode, message: string): void;
  heartbeat(): Promise<void>;
  shouldCancel(): Promise<boolean>;
  /** Predpomnilnik poizvedb v okviru enega zagona (ključ → rezultat). */
  memo: Map<string, unknown>;
  counters: { catalogLookups: number; valuations: number };
}

/** Oglas po prepoznavi: vse, kar kategorija ve, in kar potrebuje vrednotenje. */
export interface IdentifiedListing {
  listing: RawListing;
  identification: Identification;
  collectible: CollectibleAttributes;
  condition: CollectibleCondition;
  /** Ali oglas ustreza filtrom kategorije (kar ni preverljivo, ne ustreza — nič se ne domneva). */
  matchesFilters: boolean;
  /** Notranji sklic kategorije (kartica, izdelek v ceniku …) za vrednotenje; ni del shranjenih podatkov. */
  ref: unknown;
}

/** Podatki za vrednost iz vira kategorije; `asking` doda skupno jedro iz oglasov zagona. */
export interface ValuationParts {
  estimate: NonNullable<Valuation['estimate']> | null;
  sold: NonNullable<Valuation['sold']> | null;
  stale: boolean;
  note: string | null;
}

export interface CategoryHandler<TConfig = unknown> {
  readonly id: CollectibleCategoryId;
  readonly label: string;
  readonly fields: FieldDescriptor[];
  /** Zod shema podobjekta filtrov kategorije (`cards` / `retro`). */
  readonly filterSchema: ZodTypeAny;
  /** Ključ podobjekta v `config`. */
  readonly filterKey: 'cards' | 'retro';
  /** Kategorija eBay; `undefined` do potrditve ID-jev (research §7). */
  readonly ebayCategoryId: string | undefined;
  /** Ali sme se filter stanja poslati eBayju (ID-ji stanj niso enaki v vseh kategorijah). */
  readonly sendEbayConditionIds: boolean;

  /** Iskalni niz za vir oglasov. */
  searchText(config: TConfig): string;
  /** Ali je nastavljen vsaj en filter kategorije (za `validateConfig`). */
  hasFilters(config: TConfig): boolean;
  /** Slovenski razlog, zakaj so filtri kategorije neveljavni, ali `null`. */
  validate(config: TConfig): string | null;
  /** Kratki deli opisa iskanja. */
  describe(config: TConfig): string[];

  identify(listings: readonly RawListing[], config: TConfig, run: CategoryRun): Promise<IdentifiedListing[]>;
  valuate(item: IdentifiedListing, run: CategoryRun): Promise<ValuationParts | null>;
  /** Rezerva za tveganje v odstotkih za ta oglas (osnova kategorije + dodatki). */
  riskReservePct(item: IdentifiedListing, env: Env): number;
}

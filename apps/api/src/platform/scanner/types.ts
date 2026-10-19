import type { z } from 'zod';
import type { Env } from '../config/env.js';
import type { Logger } from '../logging/logger.js';

// Skupni nabori vrednosti in VMESNIK tipa skenerja (016). Čista datoteka: brez mongoose in
// brez expressa (člen IX) — uvažajo jo modeli, domena, storitve, usmerjevalniki IN moduli, ki
// tip registrirajo (`modules/flight-deals/scanner/type.ts`, `modules/echo-scanner/`).
//
// Jedro o nobenem tipu ne ve po imenu: vse, kar tip prispeva, gre prek tega vmesnika in
// registra (registry.ts). Nov tip = nova mapa pod modules/ + en klic `registerScannerType`.

// ───────────────────────────── nabori ─────────────────────────────

export const EXECUTION_MODES = ['batch', 'single'] as const;
/** `batch`: en zagon za VSE skenerje tipa po urniku tipa (leti); `single`: zagon na skener po
 * lastnem urniku (echo, bodoči tipi). research.md §2. */
export type ExecutionMode = (typeof EXECUTION_MODES)[number];

export const RESULT_STORAGES = ['generic', 'custom'] as const;
/** `generic`: jedro hrani rezultate (`ScannerResult`); `custom`: tip ima lastno shrambo in
 * izpolni `resultReader` (leti). research.md §5. */
export type ResultStorage = (typeof RESULT_STORAGES)[number];

export const RUN_STATUSES = ['queued', 'running', 'succeeded', 'partial', 'failed', 'cancelled', 'interrupted'] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export const RUN_TRIGGERS = ['schedule', 'manual'] as const;
export type RunTrigger = (typeof RUN_TRIGGERS)[number];

export const RUN_SCOPE_KINDS = ['type', 'definition'] as const;
export type RunScopeKind = (typeof RUN_SCOPE_KINDS)[number];

/** `CHANGED` je novo proti 015: sprememba vsebine brez cene (npr. slika, naslov). */
export const CHANGE_TYPES = ['NEW', 'PRICE_DOWN', 'PRICE_UP', 'CHANGED', 'UNCHANGED', 'UNAVAILABLE'] as const;
export type ChangeType = (typeof CHANGE_TYPES)[number];

export const NOTIFIABLE_CHANGE_TYPES = ['NEW', 'PRICE_DOWN', 'PRICE_UP', 'CHANGED'] as const;
export type NotifiableChangeType = (typeof NOTIFIABLE_CHANGE_TYPES)[number];

export const DEFINITION_OUTCOMES = ['ok', 'failed', 'skipped'] as const;
export type DefinitionOutcome = (typeof DEFINITION_OUTCOMES)[number];

export const NOTIFICATION_STATUSES = ['pending', 'sending', 'sent', 'failed', 'suppressed'] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

export const SUPPRESSED_REASONS = ['smtp-not-configured', 'no-email', 'user-missing', 'no-items', 'type-unavailable'] as const;
export type SuppressedReason = (typeof SUPPRESSED_REASONS)[number];

export const NOTIFICATION_CHANNELS = ['email'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_MODES = ['all-changes'] as const;
export type NotificationMode = (typeof NOTIFICATION_MODES)[number];

export const SCHEDULE_PRESET_IDS = ['hourly', 'daily-06', 'daily-06-18', 'every-6h', 'monday-08', 'custom'] as const;
export type SchedulePresetId = (typeof SCHEDULE_PRESET_IDS)[number];

export const SCHEDULE_MODES = ['own', 'type'] as const;
export type ScheduleMode = (typeof SCHEDULE_MODES)[number];

export const AVAILABILITIES = ['available', 'unavailable'] as const;
export type Availability = (typeof AVAILABILITIES)[number];

export const RESULT_SORTS = ['seen', 'price', 'change'] as const;
export type ResultSort = (typeof RESULT_SORTS)[number];

export interface Money {
  amount: number;
  currency: string;
}

// ───────────────────────────── definicija in urnik ─────────────────────────────

export interface ScheduleSpec {
  preset: SchedulePresetId;
  cronExpression: string;
  timezone: string;
}

/** Urnik tipa, kot ga jedro poda tipu z lastnimi definicijami (leti) za izpis vrstic. */
export interface TypeScheduleContext extends ScheduleSpec {
  enabled: boolean;
  nextRunAt: Date | null;
  label: string;
}

/** Opis urnika v vrstici seznama — isti za generične definicije in za tiste, ki jih prispeva tip. */
export interface ScheduleInfo {
  mode: ScheduleMode;
  preset?: SchedulePresetId;
  cronExpression?: string;
  timezone?: string;
  /** Slovensko, npr. "vsakih 6 ur" ali "po urniku tipa (vsak dan ob 6:00 in 18:00)". */
  label: string;
  nextRunAt: Date | null;
  /** Isti trenutek v coni urnika, za človeka (`formatSlotLocal`). */
  nextRunLocal: string | null;
}

export interface LastRunInfo {
  at: Date;
  outcome: DefinitionOutcome;
  message: string | null;
}

/**
 * Vrstica seznama skenerjev (`GET /scanners`). Generične definicije jo sestavi jedro; tip z
 * lastnimi definicijami (leti) jo vrne iz `definitions.listForUser`. `typeLabel` in
 * `typeAvailable` doda jedro, tip ju ne polni.
 */
export interface ScannerSummary {
  id: string;
  type: string;
  name: string;
  enabled: boolean;
  schedule: ScheduleInfo;
  lastRun: LastRunInfo | null;
  lastSuccessAt: Date | null;
  resultCount: number;
  /** Poti ODJEMALCA (brez izvora): kam vodita klik na vrstico in gumb Uredi. */
  links: { edit: string; results: string };
  createdAt: Date;
  updatedAt: Date;
}

/** Definicija, kot jo dobi tip z izvajanjem na skener (`ctx.definition`). */
export interface SingleDefinition<TConfig = unknown> {
  id: string;
  userId: string;
  name: string;
  config: TConfig;
  notifications: { enabled: boolean; mode: NotificationMode };
}

// ───────────────────────────── izvajanje ─────────────────────────────

/** Rezultat, kot ga tip vrne jedru v generično shrambo. `identity` je kanonični niz (jedro ga
 * hashira); `comparable` je tisto, kar šteje za spremembo, kadar cene ni. */
export interface NormalizedResult {
  identity: string;
  source: string;
  externalId?: string | null;
  title: string;
  url?: string | null;
  price?: Money | null;
  data: unknown;
  comparable?: unknown;
  dataAt?: Date;
  expiresAt?: Date;
}

/** Dogodek, iz katerega jedro sestavi postavko dopisa (FR-028). `recipients` določi tip —
 * pri generičnih definicijah lastnik, pri letih še prejemniki z vklopljenim obveščanjem. */
export interface ScannerEvent {
  definitionId: string;
  definitionName: string;
  ownerId: string;
  recipients: string[];
  /** Id rezultata (`ScannerResult` ali `FlightOffer`): dedup v dopisu in `resultRef` postavke. */
  resultRef: string;
  changeType: NotifiableChangeType;
  /** Posnetek za postavko — oblika last tipa; `verify` ga dobi nazaj. */
  payload: unknown;
}

export interface DefinitionOutcomeRow {
  definitionId: string;
  ownerId: string;
  outcome: DefinitionOutcome;
  message: string | null;
}

export interface ExecutionError {
  definitionId?: string;
  code: string;
  message: string;
}

export interface ExecutionOutcome {
  status: 'succeeded' | 'partial' | 'failed' | 'cancelled';
  /** Števci tipa (leti: rules, queries, providerRequests, offersSeen …); jedro doda svoje. */
  counters: Record<string, number>;
  /** Izid na skener — izolacija napak (FR-017). */
  definitions: DefinitionOutcomeRow[];
  events: ScannerEvent[];
  /** Dodatek tipa za admin (leti: izidi po virih); brez skrivnosti. */
  extras?: unknown;
  errors: ExecutionError[];
}

export interface ResultStoreCounters {
  seen: number;
  new: number;
  changed: number;
  unavailable: number;
  incomplete: number;
}

/** Generična shramba za tip z `results: 'generic'` — jedro jo poda v `ctx.results`. */
export interface GenericResultStore {
  reconcile(
    items: NormalizedResult[],
    options: { sourceSucceeded: boolean; allowedHosts?: readonly string[] },
  ): Promise<{ events: ScannerEvent[]; counters: ResultStoreCounters }>;
}

export interface ExecutionContext<TConfig = unknown> {
  runId: string;
  now: Date;
  env: Env;
  logger: Logger | undefined;
  /** Pri `single`: skener, ki se izvaja; pri `batch`: `null` (tip naloži svoje definicije sam). */
  definition: SingleDefinition<TConfig> | null;
  /** Koliko zagonov TEGA obsega se je pred tem že končalo — za deterministične scenarije (echo). */
  previousRunCount: number;
  /** Pri `results: 'generic'` in `single`: shramba; sicer `null`. */
  results: GenericResultStore | null;
  /** Možnosti, ki jih tipu podajo TESTI (npr. ničelni zamiki ponovitev); produkcijski tik poda
   * `undefined`. Jedro jih ne tolmači. */
  typeOptions: unknown;
  heartbeat(): Promise<void>;
  shouldCancel(): Promise<boolean>;
}

// ───────────────────────────── obvestila ─────────────────────────────

export interface NotificationItem {
  definitionId: string;
  definitionName: string;
  /** Samo, kadar prejemnik ni lastnik; sicer `null`. */
  ownerName: string | null;
  resultRef: string;
  changeType: NotifiableChangeType;
  payload: unknown;
}

export interface RenderContext {
  /** PUBLIC_BASE_URL brez končne poševnice. */
  baseUrl: string;
  checkedAt: Date;
  appName: string;
}

export interface RenderedDigest {
  subject: string;
  html: string;
  text: string;
}

/**
 * Dva kavlja, s katerima tip določi vsebino dopisa; prevzem, ponovitve in pošiljanje so v jedru
 * (research.md §6). `verify` pred pošiljanjem ZNOVA preveri vsako postavko (FR-030) in vrne
 * samo tiste, ki še držijo, v obliki, ki jo `render` razume.
 */
export interface NotificationHooks<TVerified = unknown> {
  verify(items: NotificationItem[], recipientUserId: string, now: Date): Promise<TVerified[]>;
  render(items: TVerified[], ctx: RenderContext): RenderedDigest;
}

// ───────────────────────────── rezultati (branje) ─────────────────────────────

export interface ResultQuery {
  sort: ResultSort;
  includeUnavailable: boolean;
  limit: number;
}

export interface PriceChangeView {
  type: ChangeType;
  absolute: number;
  percent: number;
}

/** `Result` iz pogodbe 016, s časi kot `Date` (usmerjevalnik jih zapiše kot ISO). */
export interface ResultView {
  id: string;
  scannerId: string;
  type: string;
  source: string;
  externalId: string | null;
  title: string;
  url: string | null;
  price: Money | null;
  data: unknown;
  dataAt: Date;
  firstSeenAt: Date;
  lastSeenAt: Date;
  availability: Availability;
  previousPrice: (Money & { at: Date }) | null;
  lastChangeType: ChangeType;
  change: PriceChangeView | null;
}

export interface HistoryPointView {
  checkedAt: Date;
  price: Money | null;
  changeType: ChangeType;
}

export interface ResultDetailView extends ResultView {
  history: HistoryPointView[];
}

/** Bralni vmesnik nad rezultati — isti za generično shrambo in za lastno shrambo tipa (FR-026). */
export interface ResultReader {
  list(definitionId: string, userId: string, query: ResultQuery, env: Env): Promise<{ results: ResultView[]; total: number }>;
  count(definitionIds: readonly string[]): Promise<Map<string, number>>;
  get(definitionId: string, resultId: string, userId: string, env: Env): Promise<ResultDetailView | null>;
}

// ───────────────────────────── definicije, ki jih hrani tip ─────────────────────────────

export interface DefinitionsContext {
  env: Env;
  now: Date;
  /** Urnik tipa z naslednjim terminom — da tip ne bere `ScannerTypeSettings` sam. */
  typeSchedule: TypeScheduleContext;
}

/** Tip, ki svoje definicije hrani sam (leti: `FlightSearchRule`), jih prispeva na seznam prek
 * tega vmesnika. Jedro zanje nima zapisa (FR-008). */
export interface TypeDefinitions {
  listForUser(userId: string, ctx: DefinitionsContext): Promise<ScannerSummary[]>;
  findForUser(userId: string, id: string, ctx: DefinitionsContext): Promise<ScannerSummary | null>;
  /** Vsi skenerji tipa v namestitvi — za admin (`definitionCount`). */
  countAll(): Promise<number>;
}

// ───────────────────────────── tip skenerja ─────────────────────────────

export interface ScannerType<TConfig = unknown, TVerified = unknown> {
  /** Oznaka: angleško, kebab-case; `type` definicije in `scannerType` zagona. */
  readonly type: string;
  /** Slovensko ime za vmesnik ("Leti"). */
  readonly label: string;
  /** Ime Ionicons ikone (registrirano v apps/web/src/app/core/icons/register-icons.ts). */
  readonly icon: string;
  /** Ena poved za izbiro tipa v čarovniku. */
  readonly description: string;
  readonly execution: ExecutionMode;
  readonly results: ResultStorage;
  /** Obsegi tipa; brez njih veljata skupna `scanners:read`/`scanners:write`. */
  readonly scopes?: { read: string; write: string };
  /** Privzeti urnik tipa (`batch`); brez njega `daily-06-18`. */
  readonly defaultSchedule?: ScheduleSpec;
  /** Pot odjemalca za ustvarjanje, kadar tip hrani definicije sam (čarovnik preusmeri). */
  readonly createRoute?: string;
  /** Gostitelji, s katerih sme biti `url` rezultata v generični shrambi; prazno = brez povezav. */
  readonly allowedResultHosts?: readonly string[];
  isEnabled(env: Env): boolean;
  /** Oblika `config` (generične definicije); tip z lastnimi definicijami poda `z.never()`. */
  readonly configSchema: z.ZodType<TConfig>;
  /** Pomen `config` — slovenski stavek ob napaki ali `null`. */
  validateConfig?(config: TConfig, env: Env): string | null;
  /** Ena vrstica za seznam, npr. "3 rezultati, oznaka Echo". */
  describeConfig?(config: TConfig): string;
  readonly definitions?: TypeDefinitions;
  readonly resultReader?: ResultReader;
  execute(ctx: ExecutionContext<TConfig>): Promise<ExecutionOutcome>;
  readonly notifications: NotificationHooks<TVerified>;
  readonly admin?: { extras(env: Env): Promise<unknown> };
}

/** Register hrani tipe brez generičnih parametrov; `never` pove, da jedro `config` ne tolmači. */
export type AnyScannerType = ScannerType<never, unknown>;

import { Types } from 'mongoose';
import { badRequest, notFound } from '../../../platform/errors/problem.js';
import { FlightSearchRuleModel } from '../models/flight-search-rule.model.js';
import type { SearchInput } from '../domain/rule-input.js';
import type { BaggageOption, DateMode, DestinationMode, ProviderId, ProviderOutcome } from '../domain/types.js';

// EDINA vrata do iskanja v tem modulu. Vsaka pot gre skozi `requireOwnRule`; nikjer drugje se
// `FlightSearchRuleModel.findOne` ne kliče z ročno sestavljenim pogojem dostopa.
//
// Model dostopa je tu preprost — `{ _id, userId }` — in to je NAMERNO: prejemnik iskanja ne bere
// (FR-041), zato ni vmesne vloge, ki bi zapis videla brez pravice. Tuje iskanje vrne 404, nikoli
// 403 (FR-014): 403 bi povedal "to iskanje obstaja, samo tvoje ni".

export interface DayWindowLean {
  weekdays: number[];
  earliest: string | null;
  latest: string | null;
}

export interface RuleCheckOutcomeLean {
  providerId: ProviderId;
  outcome: ProviderOutcome;
  message: string | null;
  queries: number;
  offers: number;
}

/** Analiza zadnjega preverjanja (glej model): vrnjeno / ujemanja / zavrnjeno po razlogih, padajoče po številu. */
export interface RuleCheckAnalysisLean {
  returned: number;
  matched: number;
  rejected: Array<{ reason: string; label: string; count: number }>;
}

export interface RuleCheckLean {
  runId: Types.ObjectId;
  at: Date;
  outcomes: RuleCheckOutcomeLean[];
  /** `null` pri zapisih izpred 19. 10. 2026. */
  analysis?: RuleCheckAnalysisLean | null;
}

export interface RuleLean {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  name: string;
  active: boolean;
  /** 017; zapisi izpred uvedbe ga nimajo → `false`. */
  aiEnabled?: boolean;
  departureAirports: string[];
  destination: { mode: DestinationMode; countries: string[]; airports: string[] };
  excluded: { countries: string[]; airports: string[] };
  dates: {
    mode: DateMode;
    departDate: string | null;
    returnDate: string | null;
    from: string | null;
    to: string | null;
    months: number | null;
  };
  flexDays: number;
  returnWithinWindow: boolean;
  minNights: number | null;
  maxNights: number | null;
  outbound: DayWindowLean;
  inbound: DayWindowLean;
  minStayHours: number | null;
  passengers: { adults: number; childrenAges: number[] };
  price: { maxPerPerson: number | null; maxTotal: number | null; currency: string };
  airlines: string[];
  maxStops: number;
  baggage: BaggageOption;
  recipients: { userId: Types.ObjectId; notify: boolean; addedAt: Date }[];
  lastCheck: RuleCheckLean | null;
  lastSuccessfulCheckAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Neveljaven ObjectId bi v Mongoose vrgel CastError, ki se navzven pokaže kot 500 — za
 * uporabnika, ki je odprl staro povezavo, je to 404 (isti vzorec kot 007/010/013). */
export function requireObjectId(value: string, what: string): string {
  if (!Types.ObjectId.isValid(value)) throw notFound(`${what} ne obstaja.`);
  return value;
}

export async function requireOwnRule(userId: string, ruleId: string): Promise<RuleLean> {
  const rule = await FlightSearchRuleModel.findOne({
    _id: requireObjectId(ruleId, 'Iskanje'),
    userId: new Types.ObjectId(userId),
  }).lean<RuleLean | null>();
  if (!rule) throw notFound('Iskanje ne obstaja.');
  return rule;
}

export async function listOwnRules(userId: string): Promise<RuleLean[]> {
  return FlightSearchRuleModel.find({ userId: new Types.ObjectId(userId) }).sort({ updatedAt: -1 }).lean<RuleLean[]>();
}

export interface SharedRuleRef {
  ruleId: string;
  name: string;
  ownerId: string;
}

/** Iskanja, pri katerih je uporabnik prejemnik — SAMO ime in lastnik, nikoli kriteriji (FR-041). */
export async function sharedRulesFor(userId: string): Promise<SharedRuleRef[]> {
  const rows = await FlightSearchRuleModel.find({ 'recipients.userId': new Types.ObjectId(userId) })
    .select('_id name userId')
    .lean<Array<{ _id: Types.ObjectId; name: string; userId: Types.ObjectId }>>();
  return rows.map((r) => ({ ruleId: String(r._id), name: r.name, ownerId: String(r.userId) }));
}

export async function assertRoomForRule(userId: string, max: number): Promise<void> {
  const count = await FlightSearchRuleModel.countDocuments({ userId: new Types.ObjectId(userId) });
  if (count >= max) {
    throw badRequest(`Dosegel si mejo ${max} iskanj. Izbriši ali združi kakšno, preden ustvariš novo.`);
  }
}

/** Zapis iz baze v obliko, nad katero delajo čiste domenske funkcije (okna, ujemanje, predogled). */
export function ruleToInput(rule: RuleLean): SearchInput {
  return {
    name: rule.name,
    active: rule.active,
    aiEnabled: rule.aiEnabled ?? false,
    departureAirports: rule.departureAirports,
    destination: {
      mode: rule.destination.mode,
      countries: rule.destination.countries ?? [],
      airports: rule.destination.airports ?? [],
    },
    excluded: { countries: rule.excluded?.countries ?? [], airports: rule.excluded?.airports ?? [] },
    dates: {
      mode: rule.dates.mode,
      departDate: rule.dates.departDate ?? undefined,
      returnDate: rule.dates.returnDate ?? (rule.dates.mode === 'fixed' ? null : undefined),
      from: rule.dates.from ?? undefined,
      to: rule.dates.to ?? undefined,
      months: rule.dates.months ?? undefined,
    },
    flexDays: rule.flexDays,
    returnWithinWindow: rule.returnWithinWindow,
    minNights: rule.minNights,
    maxNights: rule.maxNights,
    outbound: { weekdays: rule.outbound.weekdays ?? [], earliest: rule.outbound.earliest, latest: rule.outbound.latest },
    inbound: { weekdays: rule.inbound.weekdays ?? [], earliest: rule.inbound.earliest, latest: rule.inbound.latest },
    minStayHours: rule.minStayHours,
    passengers: { adults: rule.passengers.adults, childrenAges: rule.passengers.childrenAges ?? [] },
    price: { maxPerPerson: rule.price.maxPerPerson, maxTotal: rule.price.maxTotal, currency: rule.price.currency },
    airlines: rule.airlines ?? [],
    maxStops: rule.maxStops,
    baggage: rule.baggage,
  };
}

/** Vnos v obliko za `create`/`$set`: izpuščena polja postanejo `null`, kot jih pričakuje shema. */
export function inputToDocument(input: SearchInput) {
  return {
    name: input.name,
    active: input.active,
    aiEnabled: input.aiEnabled,
    departureAirports: input.departureAirports,
    destination: input.destination,
    excluded: input.excluded,
    dates: {
      mode: input.dates.mode,
      departDate: input.dates.departDate ?? null,
      returnDate: input.dates.returnDate ?? null,
      from: input.dates.from ?? null,
      to: input.dates.to ?? null,
      months: input.dates.months ?? null,
    },
    flexDays: input.flexDays,
    returnWithinWindow: input.returnWithinWindow,
    minNights: input.minNights,
    maxNights: input.maxNights,
    outbound: input.outbound,
    inbound: input.inbound,
    minStayHours: input.minStayHours,
    passengers: input.passengers,
    price: input.price,
    airlines: input.airlines,
    maxStops: input.maxStops,
    baggage: input.baggage,
  };
}

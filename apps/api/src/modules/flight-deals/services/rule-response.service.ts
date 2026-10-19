import { Types } from 'mongoose';
import type { Env } from '../../../platform/config/env.js';
import { readUserSummaries, type UserSummary } from '../../../platform/users/directory.service.js';
import { FlightSearchMatchModel } from '../models/flight-search-match.model.js';
import { buildPreview, type SearchPreview } from '../domain/date-window.js';
import { findAirport } from '../domain/airports.js';
import { ruleToInput, type RuleCheckAnalysisLean, type RuleCheckOutcomeLean, type RuleLean } from './rule-access.service.js';

// Odgovor `FlightSearch` iz pogodbe. Imena prejemnikov se razrešijo ob branju v ENI poizvedbi za
// vsa iskanja (brez N+1), e-pošta pri prejemnikih je zamaskirana (`emailHint`), kot v imeniku.

export interface SearchResponse {
  id: string;
  isOwn: true;
  name: string;
  active: boolean;
  departureAirports: string[];
  destination: RuleLean['destination'];
  excluded: RuleLean['excluded'];
  dates: {
    mode: RuleLean['dates']['mode'];
    departDate?: string;
    returnDate?: string | null;
    from?: string;
    to?: string;
    months?: number;
  };
  flexDays: number;
  returnWithinWindow: boolean;
  minNights: number | null;
  maxNights: number | null;
  outbound: RuleLean['outbound'];
  inbound: RuleLean['inbound'];
  minStayHours: number | null;
  passengers: RuleLean['passengers'];
  price: RuleLean['price'];
  airlines: string[];
  maxStops: number;
  baggage: RuleLean['baggage'];
  recipients: Array<UserSummary & { notify: boolean; addedAt: string }>;
  preview: SearchPreview;
  lastCheck: {
    runId: string;
    at: string;
    outcomes: RuleCheckOutcomeLean[];
    /** `null` pri preverjanjih izpred uvedbe analize. */
    analysis: RuleCheckAnalysisLean | null;
  } | null;
  lastSuccessfulCheckAt: string | null;
  offerCount: number;
  createdAt: string;
  updatedAt: string;
}

export function originTimezoneOf(rule: Pick<RuleLean, 'departureAirports'>): string {
  const first = rule.departureAirports[0];
  return (first ? findAirport(first)?.tz : null) ?? 'Europe/Ljubljana';
}

export function collectRecipientIds(rules: readonly RuleLean[]): string[] {
  const ids = new Set<string>();
  for (const rule of rules) for (const r of rule.recipients) ids.add(String(r.userId));
  return [...ids];
}

export async function readOfferCounts(ruleIds: readonly Types.ObjectId[]): Promise<Map<string, number>> {
  if (ruleIds.length === 0) return new Map();
  const rows = await FlightSearchMatchModel.aggregate<{ _id: Types.ObjectId; count: number }>([
    { $match: { ruleId: { $in: ruleIds }, status: 'active' } },
    { $group: { _id: '$ruleId', count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.count]));
}

export function toSearchResponse(
  rule: RuleLean,
  now: Date,
  env: Pick<Env, 'FLIGHT_MAX_QUERIES_PER_RULE'>,
  users: Map<string, UserSummary>,
  offerCount: number,
): SearchResponse {
  const input = ruleToInput(rule);
  const preview = buildPreview(input, now, originTimezoneOf(rule), { maxQueriesPerRule: env.FLIGHT_MAX_QUERIES_PER_RULE });
  return {
    id: String(rule._id),
    isOwn: true,
    name: rule.name,
    active: rule.active,
    departureAirports: rule.departureAirports,
    destination: rule.destination,
    excluded: rule.excluded ?? { countries: [], airports: [] },
    dates: {
      mode: rule.dates.mode,
      ...(rule.dates.departDate ? { departDate: rule.dates.departDate } : {}),
      ...(rule.dates.mode === 'fixed' ? { returnDate: rule.dates.returnDate ?? null } : {}),
      ...(rule.dates.from ? { from: rule.dates.from } : {}),
      ...(rule.dates.to ? { to: rule.dates.to } : {}),
      ...(rule.dates.months ? { months: rule.dates.months } : {}),
    },
    flexDays: rule.flexDays,
    returnWithinWindow: rule.returnWithinWindow,
    minNights: rule.minNights,
    maxNights: rule.maxNights,
    outbound: rule.outbound,
    inbound: rule.inbound,
    minStayHours: rule.minStayHours,
    passengers: rule.passengers,
    price: rule.price,
    airlines: rule.airlines ?? [],
    maxStops: rule.maxStops,
    baggage: rule.baggage,
    recipients: rule.recipients
      .map((r) => {
        const user = users.get(String(r.userId));
        if (!user) return null;
        return { ...user, notify: r.notify, addedAt: r.addedAt.toISOString() };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null),
    preview,
    lastCheck: rule.lastCheck
      ? {
          runId: String(rule.lastCheck.runId),
          at: rule.lastCheck.at.toISOString(),
          outcomes: rule.lastCheck.outcomes,
          analysis: rule.lastCheck.analysis ?? null,
        }
      : null,
    lastSuccessfulCheckAt: rule.lastSuccessfulCheckAt ? rule.lastSuccessfulCheckAt.toISOString() : null,
    offerCount,
    createdAt: rule.createdAt.toISOString(),
    updatedAt: rule.updatedAt.toISOString(),
  };
}

/** Odgovori za več iskanj z eno poizvedbo za imena in eno za števce. */
export async function toSearchResponses(
  rules: readonly RuleLean[],
  now: Date,
  env: Pick<Env, 'FLIGHT_MAX_QUERIES_PER_RULE'>,
): Promise<SearchResponse[]> {
  const [users, counts] = await Promise.all([
    readUserSummaries(collectRecipientIds(rules)),
    readOfferCounts(rules.map((r) => r._id)),
  ]);
  return rules.map((rule) => toSearchResponse(rule, now, env, users, counts.get(String(rule._id)) ?? 0));
}

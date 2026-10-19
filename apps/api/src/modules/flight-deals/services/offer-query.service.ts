import { Types } from 'mongoose';
import { notFound } from '../../../platform/errors/problem.js';
import { readUserSummaries, type UserSummary } from '../../../platform/users/directory.service.js';
import { FlightOfferModel } from '../models/flight-offer.model.js';
import { FlightOfferHistoryModel } from '../models/flight-offer-history.model.js';
import { FlightSearchMatchModel } from '../models/flight-search-match.model.js';
import { FlightSearchRuleModel } from '../models/flight-search-rule.model.js';
import { offerAirlines } from '../domain/airlines.js';
import { countryNameSl, findAirport } from '../domain/airports.js';
import { classifyChange } from '../domain/price-change.js';
import type { OfferSort, OffersQuery } from '../domain/rule-input.js';
import type { Availability, ChangeType, MatchStatus, Money, ProviderId } from '../domain/types.js';
import { providerById } from '../providers/index.js';
import { requireObjectId, sharedRulesFor, type SharedRuleRef } from './rule-access.service.js';

// Branje ponudb za uporabnika (FR-031, FR-032). Vidnost gre VEDNO prek ujemanj: lastne prek
// `ruleOwnerId`, deljene prek `ruleId` iskanj, pri katerih je prejemnik. Ponudba brez vidnega
// ujemanja za klicatelja ne obstaja — tudi če je v bazi (404, ne 403).

export interface OfferLean {
  _id: Types.ObjectId;
  identityKey: string;
  providerId: ProviderId;
  airline: string;
  airlineName: string | null;
  origin: string;
  destination: string;
  outbound: { departureAt: Date; arrivalAt: Date | null; flightNumbers: string[]; stops: number };
  inbound: { departureAt: Date; arrivalAt: Date | null; flightNumbers: string[]; stops: number } | null;
  nights: number | null;
  price: Money;
  priceIncludes: string | null;
  passengers: { adults: number; children: number };
  fare: { type: string | null; baggage: string | null };
  bookingUrl: string | null;
  providerPreviousPrice?: Money | null;
  dataAt: Date;
  firstSeenAt: Date;
  lastSeenAt: Date;
  lastCheckedAt: Date;
  availability: Availability;
  lastQueryKey: string;
  previousPrice: { amount: number; currency: string; at: Date } | null;
  lastChangeType: ChangeType;
  expiresAt: Date;
}

export interface MatchLean {
  _id: Types.ObjectId;
  ruleId: Types.ObjectId;
  ruleOwnerId: Types.ObjectId;
  offerId: Types.ObjectId;
  firstMatchedAt: Date;
  lastMatchedAt: Date;
  lastChangeType: ChangeType;
  lastChangeAt: Date;
  lastRunId: Types.ObjectId;
  status: MatchStatus;
}

export interface AirportResponse {
  iata: string;
  name: string;
  city: string;
  country: string;
  countryName: string;
  latitude: number;
  longitude: number;
  timezone: string;
}

export function airportResponse(iata: string): AirportResponse {
  const a = findAirport(iata);
  if (!a) {
    return { iata, name: iata, city: iata, country: '', countryName: '', latitude: 0, longitude: 0, timezone: 'UTC' };
  }
  return {
    iata: a.iata,
    name: a.name,
    city: a.city,
    country: a.country,
    countryName: countryNameSl(a.country, a.countryName),
    latitude: a.lat,
    longitude: a.lon,
    timezone: a.tz,
  };
}

function segmentResponse(seg: OfferLean['outbound'], depTz: string, arrTz: string) {
  return {
    departureAt: seg.departureAt.toISOString(),
    departureTz: depTz,
    arrivalAt: seg.arrivalAt ? seg.arrivalAt.toISOString() : null,
    arrivalTz: arrTz,
    flightNumbers: seg.flightNumbers,
    stops: seg.stops,
  };
}

export interface OfferMatchResponse {
  searchId: string;
  searchName: string;
  isOwn: boolean;
  owner: UserSummary | null;
  changeType: ChangeType;
  firstMatchedAt: string;
  status: MatchStatus;
}

export function toOfferResponse(
  offer: OfferLean,
  matches: OfferMatchResponse[],
): Record<string, unknown> {
  const provider = providerById(offer.providerId);
  const origin = airportResponse(offer.origin);
  const destination = airportResponse(offer.destination);
  const people = offer.passengers.adults + offer.passengers.children;
  const change = offer.previousPrice
    ? classifyChange({ amount: offer.previousPrice.amount, currency: offer.previousPrice.currency }, offer.price)
    : null;
  return {
    id: String(offer._id),
    providerId: offer.providerId,
    providerLabel: provider?.label ?? offer.providerId,
    providerOfficial: provider?.official ?? false,
    airline: offer.airline,
    airlineName: offer.airlineName,
    airlines: offerAirlines(offer),
    origin,
    destination,
    outbound: segmentResponse(offer.outbound, origin.timezone, destination.timezone),
    inbound: offer.inbound ? segmentResponse(offer.inbound, destination.timezone, origin.timezone) : null,
    nights: offer.nights,
    price: offer.price,
    pricePerPerson: { amount: Math.round((offer.price.amount / Math.max(1, people)) * 100) / 100, currency: offer.price.currency },
    priceIncludes: offer.priceIncludes,
    previousPrice: offer.previousPrice ? { amount: offer.previousPrice.amount, currency: offer.previousPrice.currency } : null,
    change:
      change && change.comparable && change.type !== 'UNCHANGED'
        ? { type: change.type, absolute: change.absolute, percent: change.percent }
        : offer.lastChangeType === 'UNAVAILABLE'
          ? { type: 'UNAVAILABLE', absolute: 0, percent: 0 }
          : null,
    passengers: offer.passengers,
    fare: offer.fare,
    bookingUrl: offer.bookingUrl,
    providerPreviousPrice: offer.providerPreviousPrice ?? null,
    dataAt: offer.dataAt.toISOString(),
    lastCheckedAt: offer.lastCheckedAt.toISOString(),
    availability: offer.availability,
    matches,
  };
}

interface VisibleRules {
  ownIds: Set<string>;
  ownNames: Map<string, string>;
  shared: Map<string, SharedRuleRef>;
}

async function visibleRules(userId: string): Promise<VisibleRules> {
  const [own, shared] = await Promise.all([
    FlightSearchRuleModel.find({ userId: new Types.ObjectId(userId) })
      .select('_id name')
      .lean<Array<{ _id: Types.ObjectId; name: string }>>(),
    sharedRulesFor(userId),
  ]);
  return {
    ownIds: new Set(own.map((r) => String(r._id))),
    ownNames: new Map(own.map((r) => [String(r._id), r.name])),
    shared: new Map(shared.map((s) => [s.ruleId, s])),
  };
}

function sortSpec(sort: OfferSort): Record<string, 1 | -1> {
  switch (sort) {
    case 'price':
      return { 'price.amount': 1, 'outbound.departureAt': 1 };
    case 'departure':
      return { 'outbound.departureAt': 1, 'price.amount': 1 };
    case 'appeared':
      return { firstSeenAt: -1, 'price.amount': 1 };
    case 'change':
      // Največja pocenitev najprej: razlika se izračuna po branju (ni shranjena), zato se tu razvrsti
      // po `lastCheckedAt`, končni red pa določi `sortByChange`.
      return { lastCheckedAt: -1 };
  }
}

function changeAbsolute(offer: OfferLean): number {
  if (!offer.previousPrice || offer.previousPrice.currency !== offer.price.currency) return Number.POSITIVE_INFINITY;
  return offer.price.amount - offer.previousPrice.amount;
}

export interface OfferListResult {
  offers: Record<string, unknown>[];
  total: number;
}

/**
 * Seznam ponudb, ki jih klicatelj sme videti. Dve poizvedbi na seznam (ujemanja, ponudbe) in ena za
 * imena lastnikov deljenih iskanj — ne glede na število ponudb.
 */
export async function listOffers(userId: string, query: OffersQuery): Promise<OfferListResult> {
  const visible = await visibleRules(userId);

  let ruleIds: string[];
  if (query.scope === 'own') ruleIds = [...visible.ownIds];
  else if (query.scope === 'shared') ruleIds = [...visible.shared.keys()];
  else ruleIds = [...visible.ownIds, ...visible.shared.keys()];
  if (query.searchId) {
    if (!Types.ObjectId.isValid(query.searchId) || !ruleIds.includes(query.searchId)) return { offers: [], total: 0 };
    ruleIds = [query.searchId];
  }
  if (ruleIds.length === 0) return { offers: [], total: 0 };

  const matchFilter: Record<string, unknown> = { ruleId: { $in: ruleIds.map((id) => new Types.ObjectId(id)) } };
  matchFilter.status = query.includeUnavailable ? { $in: ['active', 'unavailable'] } : 'active';
  if (query.changed) matchFilter.lastChangeType = { $in: ['NEW', 'PRICE_DOWN', 'PRICE_UP'] };

  const matches = await FlightSearchMatchModel.find(matchFilter).lean<MatchLean[]>();
  if (matches.length === 0) return { offers: [], total: 0 };

  const byOffer = new Map<string, MatchLean[]>();
  for (const m of matches) {
    const list = byOffer.get(String(m.offerId)) ?? [];
    list.push(m);
    byOffer.set(String(m.offerId), list);
  }

  const offerFilter: Record<string, unknown> = { _id: { $in: [...byOffer.keys()].map((id) => new Types.ObjectId(id)) } };
  if (!query.includeUnavailable) offerFilter.availability = 'available';
  const total = await FlightOfferModel.countDocuments(offerFilter);
  let offers = await FlightOfferModel.find(offerFilter)
    .sort(sortSpec(query.sort))
    .limit(query.sort === 'change' ? Math.max(query.limit * 4, 200) : query.limit)
    .lean<OfferLean[]>();
  if (query.sort === 'change') offers = offers.sort((a, b) => changeAbsolute(a) - changeAbsolute(b)).slice(0, query.limit);

  const ownerIds = [...new Set([...visible.shared.values()].map((s) => s.ownerId))];
  const owners = await readUserSummaries(ownerIds);

  return {
    offers: offers.map((offer) =>
      toOfferResponse(
        offer,
        (byOffer.get(String(offer._id)) ?? []).map((m) => matchResponse(m, visible, owners)),
      ),
    ),
    total,
  };
}

function matchResponse(m: MatchLean, visible: VisibleRules, owners: Map<string, UserSummary>): OfferMatchResponse {
  const ruleId = String(m.ruleId);
  const isOwn = visible.ownIds.has(ruleId);
  const shared = visible.shared.get(ruleId);
  return {
    searchId: ruleId,
    searchName: isOwn ? (visible.ownNames.get(ruleId) ?? '') : (shared?.name ?? ''),
    isOwn,
    owner: isOwn ? null : (shared ? (owners.get(shared.ownerId) ?? null) : null),
    changeType: m.lastChangeType,
    firstMatchedAt: m.firstMatchedAt.toISOString(),
    status: m.status,
  };
}

export interface HistoryPointResponse {
  checkedAt: string;
  price: Money | null;
  previousPrice: Money | null;
  changeType: ChangeType;
}

/** Podrobnosti ene ponudbe z zgodovino; 404 brez vidnega ujemanja (FR-031). */
export async function getOfferDetail(userId: string, offerId: string): Promise<Record<string, unknown>> {
  const id = requireObjectId(offerId, 'Ponudba');
  const visible = await visibleRules(userId);
  const allVisible = [...visible.ownIds, ...visible.shared.keys()].map((r) => new Types.ObjectId(r));
  const matches = await FlightSearchMatchModel.find({ offerId: new Types.ObjectId(id), ruleId: { $in: allVisible } }).lean<MatchLean[]>();
  if (matches.length === 0) throw notFound('Ponudba ne obstaja.');

  const offer = await FlightOfferModel.findById(id).lean<OfferLean | null>();
  if (!offer) throw notFound('Ponudba ne obstaja.');

  const [history, owners] = await Promise.all([
    FlightOfferHistoryModel.find({ offerId: offer._id })
      .sort({ checkedAt: 1 })
      .lean<Array<{ checkedAt: Date; price: Money | null; previousPrice: Money | null; changeType: ChangeType }>>(),
    readUserSummaries([...new Set([...visible.shared.values()].map((s) => s.ownerId))]),
  ]);

  const points: HistoryPointResponse[] = history.map((h) => ({
    checkedAt: h.checkedAt.toISOString(),
    price: h.price,
    previousPrice: h.previousPrice,
    changeType: h.changeType,
  }));

  return {
    ...toOfferResponse(
      offer,
      matches.map((m) => matchResponse(m, visible, owners)),
    ),
    history: points,
  };
}

/** Ponudbe enega LASTNEGA iskanja (po `requireOwnRule`). */
export async function listOffersForRule(
  userId: string,
  ruleId: string,
  query: Pick<OffersQuery, 'sort' | 'includeUnavailable' | 'limit'>,
): Promise<OfferListResult> {
  return listOffers(userId, { ...query, scope: 'own', searchId: ruleId, changed: undefined });
}

import { DateTime } from 'luxon';
import type { AiAnalysis, ChangeType, Money, ResultDetailView, ResultReader, ResultView } from '../../../platform/scanner/types.js';
import { getOfferDetail, listOffersForRule } from '../services/offer-query.service.js';
import { readOfferCounts } from '../services/rule-response.service.js';
import { Types } from 'mongoose';

// Bralnik rezultatov tipa `flights` za generični prikaz (016, FR-026): ponudbe iskanja v obliki
// `Result` iz pogodbe 016, s celotno ponudbo (oblika `Offer` iz pogodbe 015) v `data`. Leti imajo
// lasten prikaz v zavihku Leti; ta bralnik je za generični kontejner in števec na seznamu.

interface OfferResponse {
  id: string;
  providerId: string;
  origin: { iata: string; timezone: string };
  destination: { iata: string };
  outbound: { departureAt: string; departureTz: string };
  price: Money;
  previousPrice: Money | null;
  change: { type: ChangeType; absolute: number; percent: number } | null;
  bookingUrl: string | null;
  dataAt: string;
  lastCheckedAt: string;
  availability: 'available' | 'unavailable';
  matches: Array<{ firstMatchedAt: string; changeType: ChangeType }>;
  aiAnalysis?: (Omit<AiAnalysis, 'analyzedAt'> & { analyzedAt: string }) | null;
  history?: Array<{ checkedAt: string; price: Money | null; changeType: ChangeType }>;
}

function toResult(offer: OfferResponse, definitionId: string): ResultView {
  const departure = DateTime.fromISO(offer.outbound.departureAt, { zone: offer.outbound.departureTz }).setLocale('sl');
  const firstMatched = offer.matches[0]?.firstMatchedAt ?? offer.dataAt;
  const lastChange = offer.matches[0]?.changeType ?? 'UNCHANGED';
  return {
    id: offer.id,
    scannerId: definitionId,
    type: 'flights',
    source: offer.providerId,
    externalId: null,
    title: `${offer.origin.iata} → ${offer.destination.iata}, ${departure.toFormat('ccc d. L. yyyy HH:mm')}`,
    url: offer.bookingUrl,
    price: offer.price,
    data: offer,
    dataAt: new Date(offer.dataAt),
    firstSeenAt: new Date(firstMatched),
    lastSeenAt: new Date(offer.lastCheckedAt),
    availability: offer.availability,
    previousPrice: offer.previousPrice ? { ...offer.previousPrice, at: new Date(offer.lastCheckedAt) } : null,
    lastChangeType: offer.availability === 'unavailable' ? 'UNAVAILABLE' : lastChange,
    change: offer.change,
    aiAnalysis: offer.aiAnalysis ? { ...offer.aiAnalysis, analyzedAt: new Date(offer.aiAnalysis.analyzedAt) } : null,
  };
}

const SORT_MAP = { seen: 'appeared', price: 'price', change: 'change' } as const;

export const flightResultReader: ResultReader = {
  async list(definitionId, userId, query) {
    const res = await listOffersForRule(userId, definitionId, { sort: SORT_MAP[query.sort], includeUnavailable: query.includeUnavailable, limit: query.limit });
    return { results: (res.offers as unknown as OfferResponse[]).map((o) => toResult(o, definitionId)), total: res.total };
  },

  async count(definitionIds) {
    return readOfferCounts(definitionIds.filter((id) => Types.ObjectId.isValid(id)).map((id) => new Types.ObjectId(id)));
  },

  async get(definitionId, resultId, userId) {
    if (!Types.ObjectId.isValid(resultId)) return null;
    try {
      const offer = (await getOfferDetail(userId, resultId)) as unknown as OfferResponse;
      const detail: ResultDetailView = {
        ...toResult(offer, definitionId),
        history: (offer.history ?? []).map((h) => ({ checkedAt: new Date(h.checkedAt), price: h.price, changeType: h.changeType })),
      };
      return detail;
    } catch {
      return null;
    }
  },
};

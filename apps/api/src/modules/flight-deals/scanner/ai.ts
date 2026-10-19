import { DateTime } from 'luxon';
import { Types } from 'mongoose';
import type { AiAnalysis, AiAnalysisHooks, AiAnalysisInput, AiCandidate, AiCandidatesContext } from '../../../platform/scanner/types.js';
import { FlightOfferModel } from '../models/flight-offer.model.js';
import { FlightSearchMatchModel } from '../models/flight-search-match.model.js';
import { FlightSearchRuleModel } from '../models/flight-search-rule.model.js';
import { offerAirlines } from '../domain/airlines.js';
import { countryNameSl, findAirport } from '../domain/airports.js';
import { providerById } from '../providers/index.js';
import type { OfferLean } from '../services/offer-query.service.js';

// Kavlja analize z umetno inteligenco za tip `flights` (017, research.md §6, §10). Leti imajo lastno
// shrambo, zato jedru povedo, KATERE ponudbe so kandidati in KAM se analiza shrani:
//  - kandidat je ponudba aktivnega ujemanja iskanja z `aiEnabled`, ki je v TEM zagonu nova ali
//    spremenjena (ujemanje `lastRunId === runId`) ali še brez analize (FR-007);
//  - analiza se shrani NA PONUDBO (skupna za vse uporabnike — ocena ponudbe je objektivna), ne na
//    ujemanje: dva uporabnika z istim ujemanjem si delita en klic.
//
// Vhod modelu (FR-003): relacija, časi v lokalnem času letališč, prestopi, prevoznik, potniki,
// cena (skupna in na osebo), kaj cena vključuje, prtljaga, vir (uraden ali ne), prejšnja cena.
// NIČ o lastniku iskanja ali prejemnikih.

type OfferForAi = OfferLean & { aiAnalysis?: AiAnalysis | null };

interface MatchRow {
  offerId: Types.ObjectId;
  ruleId: Types.ObjectId;
  lastRunId: Types.ObjectId;
  lastChangeType: string;
}

function local(date: Date | null, tz: string): string | null {
  if (!date) return null;
  return DateTime.fromJSDate(date, { zone: 'utc' }).setZone(tz).setLocale('sl').toFormat('ccc d. L. yyyy HH:mm');
}

export function flightOfferAiInput(offer: OfferLean): AiAnalysisInput {
  const origin = findAirport(offer.origin);
  const destination = findAirport(offer.destination);
  const originTz = origin?.tz ?? 'UTC';
  const destinationTz = destination?.tz ?? 'UTC';
  const provider = providerById(offer.providerId);
  const people = offer.passengers.adults + offer.passengers.children;
  const airlines = offerAirlines(offer)
    .map((a) => (a.name ? `${a.code} (${a.name})` : a.code))
    .join(', ');
  const outDeparture = local(offer.outbound.departureAt, originTz);
  const attributes: Record<string, string | number | boolean | null> = {
    origin: origin ? `${origin.iata} ${origin.city}, ${countryNameSl(origin.country, origin.countryName)}` : offer.origin,
    destination: destination ? `${destination.iata} ${destination.city}, ${countryNameSl(destination.country, destination.countryName)}` : offer.destination,
    trip_type: offer.inbound ? 'povratni' : 'enosmerni',
    outbound_departure_local: outDeparture,
    outbound_arrival_local: local(offer.outbound.arrivalAt, destinationTz),
    outbound_flights: offer.outbound.flightNumbers.join(', ') || null,
    outbound_stops: offer.outbound.stops,
    inbound_departure_local: offer.inbound ? local(offer.inbound.departureAt, destinationTz) : null,
    inbound_arrival_local: offer.inbound ? local(offer.inbound.arrivalAt, originTz) : null,
    inbound_flights: offer.inbound ? offer.inbound.flightNumbers.join(', ') || null : null,
    inbound_stops: offer.inbound ? offer.inbound.stops : null,
    nights: offer.nights,
    airlines,
    passengers: `${offer.passengers.adults} odraslih, ${offer.passengers.children} otrok`,
    price_per_person: `${Math.round((offer.price.amount / Math.max(1, people)) * 100) / 100} ${offer.price.currency}`,
    price_includes: offer.priceIncludes,
    fare_type: offer.fare?.type ?? null,
    baggage: offer.fare?.baggage ?? null,
    provider: provider?.label ?? offer.providerId,
    provider_official: provider?.official ?? false,
    booking_link_available: offer.bookingUrl !== null,
    provider_previous_price: offer.providerPreviousPrice ? `${offer.providerPreviousPrice.amount} ${offer.providerPreviousPrice.currency}` : null,
    data_at: DateTime.fromJSDate(offer.dataAt, { zone: 'utc' }).setZone('Europe/Ljubljana').toFormat('yyyy-LL-dd HH:mm'),
  };
  return {
    title: `Let ${offer.origin} → ${offer.destination}, ${outDeparture ?? ''}`.trim(),
    description: null,
    source: provider?.label ?? offer.providerId,
    url: null, // povezava do rezervacije ni podatek o ponudbi in nosi partnerske oznake
    price: offer.price,
    previousPrice: offer.previousPrice ? { amount: offer.previousPrice.amount, currency: offer.previousPrice.currency } : null,
    attributes,
    images: [],
  };
}

async function flightAiCandidates(ctx: AiCandidatesContext): Promise<AiCandidate[]> {
  const rules = await FlightSearchRuleModel.find({ active: true, aiEnabled: true }).select('_id').lean<Array<{ _id: Types.ObjectId }>>();
  if (rules.length === 0) return [];
  const runId = new Types.ObjectId(ctx.runId);
  const matches = await FlightSearchMatchModel.find({ ruleId: { $in: rules.map((r) => r._id) }, status: 'active' })
    .select('offerId ruleId lastRunId lastChangeType')
    .lean<MatchRow[]>();
  if (matches.length === 0) return [];

  // Ista ponudba pri več iskanjih: en kandidat; "spremenjena v tem zagonu" ima prednost pred "brez analize".
  const byOffer = new Map<string, { ruleId: string; changedNow: boolean }>();
  for (const m of matches) {
    const key = String(m.offerId);
    const changedNow = m.lastRunId.equals(runId) && (m.lastChangeType === 'NEW' || m.lastChangeType === 'PRICE_DOWN' || m.lastChangeType === 'PRICE_UP');
    const existing = byOffer.get(key);
    if (!existing || (changedNow && !existing.changedNow)) byOffer.set(key, { ruleId: String(m.ruleId), changedNow });
  }
  const offers = await FlightOfferModel.find({ _id: { $in: [...byOffer.keys()].map((id) => new Types.ObjectId(id))}, availability: 'available' }).lean<OfferForAi[]>();

  const candidates: Array<AiCandidate & { changedNow: boolean; firstSeenAt: Date }> = [];
  for (const offer of offers) {
    const meta = byOffer.get(String(offer._id))!;
    if (!meta.changedNow && offer.aiAnalysis) continue; // nespremenjena z analizo: ni kandidat
    candidates.push({
      ref: String(offer._id),
      definitionId: meta.ruleId,
      input: flightOfferAiInput(offer),
      previousInputHash: offer.aiAnalysis?.inputHash ?? null,
      changedNow: meta.changedNow,
      firstSeenAt: offer.firstSeenAt,
    });
  }
  candidates.sort((a, b) => Number(b.changedNow) - Number(a.changedNow) || b.firstSeenAt.getTime() - a.firstSeenAt.getTime());
  return candidates.slice(0, ctx.limit).map(({ changedNow: _c, firstSeenAt: _f, ...candidate }) => candidate);
}

async function flightAiStore(ref: string, analysis: AiAnalysis): Promise<boolean> {
  if (!Types.ObjectId.isValid(ref)) return false;
  const res = await FlightOfferModel.updateOne({ _id: new Types.ObjectId(ref), availability: 'available' }, { $set: { aiAnalysis: analysis } });
  return res.matchedCount > 0;
}

export const flightAiHooks: AiAnalysisHooks = {
  subject: 'letalsko ponudbo (osnovna vozovnica, kot jo navede vir; prtljaga in dodatki pogosto niso vključeni)',
  candidates: flightAiCandidates,
  store: flightAiStore,
};

import { Types } from 'mongoose';
import type { NotificationHooks, NotificationItem, RenderContext } from '../../../platform/scanner/types.js';
import { FlightOfferModel } from '../models/flight-offer.model.js';
import { FlightSearchRuleModel } from '../models/flight-search-rule.model.js';
import { findAirport } from '../domain/airports.js';
import { computeWindows } from '../domain/date-window.js';
import { renderDigest, type DigestItem, type RenderedDigest } from '../domain/email-template.js';
import { offerMatchesRule } from '../domain/rule-matcher.js';
import type { ChangeType, Money } from '../domain/types.js';
import { providerById } from '../providers/index.js';
import type { OfferLean } from '../services/offer-query.service.js';
import { toNormalized } from '../services/reconcile.service.js';
import { originTimezoneOf } from '../services/rule-response.service.js';
import { ruleToInput, type RuleLean } from '../services/rule-access.service.js';

// Kavlja tipa `flights` za outbox jedra (016, research.md §6). `verify` je bil do 016
// `verifyItems` v `services/notification-sender.service.ts` (FR-036, FR-042 iz 015): pred
// pošiljanjem se vsaka postavka ZNOVA preveri — iskanje obstaja in je aktivno, prejemnik je še
// lastnik ali na seznamu z vklopljenim obveščanjem, ponudba obstaja, je na voljo in še ustreza
// pravilom. Kar ne prestane, izpade; prazen dopis jedro zadrži (`no-items`).
//
// Postavka jedra nosi `definitionId` (= id iskanja), `definitionName` (= ime iskanja, lahko
// združeno z ` · `), `ownerName` in `payload { offerId, price, previousPrice }`.

interface FlightPayload {
  offerId: string;
  price: Money;
  previousPrice: Money | null;
}

export async function verifyFlightItems(items: NotificationItem[], recipientUserId: string, now: Date): Promise<DigestItem[]> {
  const out: DigestItem[] = [];
  const ruleCache = new Map<string, RuleLean | null>();

  for (const item of items) {
    const payload = item.payload as FlightPayload | null;
    if (!payload || !Types.ObjectId.isValid(payload.offerId) || !Types.ObjectId.isValid(item.definitionId)) continue;

    let rule = ruleCache.get(item.definitionId);
    if (rule === undefined) {
      rule = await FlightSearchRuleModel.findById(item.definitionId).lean<RuleLean | null>();
      ruleCache.set(item.definitionId, rule);
    }
    if (!rule || !rule.active) continue;
    const isOwner = String(rule.userId) === recipientUserId;
    const stillRecipient = rule.recipients.some((r) => String(r.userId) === recipientUserId && r.notify);
    if (!isOwner && !stillRecipient) continue;

    const offer = await FlightOfferModel.findById(payload.offerId).lean<OfferLean | null>();
    if (!offer || offer.availability !== 'available') continue;
    const input = ruleToInput(rule);
    const windows = computeWindows(input, now, originTimezoneOf(rule));
    const verdict = offerMatchesRule(toNormalized(offer), input, { windows, airports: findAirport });
    if (!verdict.ok) continue;

    const origin = findAirport(offer.origin);
    const destination = findAirport(offer.destination);
    if (!origin || !destination) continue;
    const provider = providerById(offer.providerId);
    const changeType = item.changeType as ChangeType;

    out.push({
      ruleName: item.definitionName,
      ruleOwnerName: isOwner ? null : item.ownerName,
      offerId: String(offer._id),
      origin,
      destination,
      airline: offer.airline,
      airlineName: offer.airlineName,
      outbound: {
        departureAt: offer.outbound.departureAt,
        departureTz: origin.tz,
        arrivalAt: offer.outbound.arrivalAt,
        arrivalTz: destination.tz,
        flightNumbers: offer.outbound.flightNumbers,
        stops: offer.outbound.stops,
      },
      inbound: offer.inbound
        ? {
            departureAt: offer.inbound.departureAt,
            departureTz: destination.tz,
            arrivalAt: offer.inbound.arrivalAt,
            arrivalTz: origin.tz,
            flightNumbers: offer.inbound.flightNumbers,
            stops: offer.inbound.stops,
          }
        : null,
      nights: offer.nights,
      passengers: offer.passengers,
      // Cena iz AKTUALNE ponudbe, ne iz posnetka: če se je med zagonom in pošiljanjem spremenila,
      // naj dopis pove današnjo; prejšnja ostane iz posnetka dogodka.
      price: offer.price,
      previousPrice: changeType === 'NEW' ? null : payload.previousPrice,
      priceIncludes: offer.priceIncludes,
      changeType,
      bookingUrl: offer.bookingUrl,
      providerLabel: provider?.label ?? offer.providerId,
      providerOfficial: provider?.official ?? false,
      dataAt: offer.dataAt,
    });
  }
  return out;
}

export function renderFlightDigest(items: DigestItem[], ctx: RenderContext): RenderedDigest {
  return renderDigest(items, { baseUrl: ctx.baseUrl, checkedAt: ctx.checkedAt, appName: ctx.appName });
}

export const flightNotificationHooks: NotificationHooks<DigestItem> = {
  verify: verifyFlightItems,
  render: renderFlightDigest,
};

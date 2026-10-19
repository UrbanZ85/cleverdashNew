import { createHash } from 'node:crypto';
import type { NormalizedOffer, NormalizedSegment } from './types.js';

// Stabilna identiteta ponudbe (FR-026, data-model.md "Identiteta").
//
// V nizu NI cene (sprememba cene je ista ponudba z drugo ceno) in NI časa pristanka (viri ga
// zaokrožujejo različno ali ga ne dajo — Travelpayouts vrne samo trajanje). `providerId` JE v
// nizu: ista vozovnica iz dveh virov sta dve ponudbi z dvema cenama in dvema povezavama
// (research.md §7). Čas odhoda je na minuto v UTC.

function segmentPart(seg: NormalizedSegment | null): string {
  if (!seg) return '-|-|-';
  const minute = new Date(Math.floor(seg.departureAt.getTime() / 60_000) * 60_000).toISOString();
  const flights = [...seg.flightNumbers].map((f) => f.replace(/\s+/g, '').toUpperCase()).sort().join('+') || '-';
  return `${minute}|${flights}|${seg.stops}`;
}

export function canonicalIdentity(offer: NormalizedOffer): string {
  return [
    offer.providerId,
    offer.origin,
    offer.destination,
    segmentPart(offer.outbound),
    segmentPart(offer.inbound),
    offer.airline.toUpperCase(),
    offer.passengers.adults,
    offer.passengers.children,
    offer.fare.type ?? '-',
    offer.fare.baggage ?? '-',
    offer.price.currency,
  ].join('|');
}

/** 32 šestnajstiških znakov — dovolj za enoličnost in kratko za indeks. */
export function identityKey(offer: NormalizedOffer): string {
  return createHash('sha256').update(canonicalIdentity(offer)).digest('hex').slice(0, 32);
}

import { DateTime } from 'luxon';
import type { SearchInput } from './rule-input.js';
import { weekdayAllowed, type Windows } from './date-window.js';
import type { Airport, NormalizedOffer } from './types.js';

// Ali ponudba ustreza pravilom iskanja (FR-010 do FR-013). Čista funkcija (člen IX), klicana ob
// zagonu (reconcile) in znova pred vključitvijo v dopis (FR-036).
//
// Čas je VEDNO lokalni čas letališča (FR-011): ura odhoda v coni odhodnega, ura povratka v coni
// ciljnega letališča. Nočitve so koledarski dnevi v coni CILJNEGA letališča — zato prehod na
// zimski čas ne spremeni števila nočitev (research.md §11). `minStayHours` je razlika dveh
// trenutkov, ne dveh lokalnih ur.

export type MatchResult = { ok: true } | { ok: false; reason: MatchFailReason };

export type MatchFailReason =
  | 'origin'
  | 'destination'
  | 'excluded'
  | 'oneWayMismatch'
  | 'outboundDate'
  | 'outboundWeekday'
  | 'outboundTime'
  | 'inboundDate'
  | 'inboundWeekday'
  | 'inboundTime'
  | 'nights'
  | 'minStay'
  | 'stops'
  | 'airline'
  | 'baggage'
  | 'passengers'
  | 'currency'
  | 'pricePerPerson'
  | 'priceTotal'
  | 'unknownAirport';

export type AirportLookup = (iata: string) => Airport | null;

export interface MatchContext {
  windows: Windows;
  airports: AirportLookup;
}

function localDay(instant: Date, tz: string): string {
  return DateTime.fromJSDate(instant, { zone: 'utc' }).setZone(tz).toFormat('yyyy-LL-dd');
}

function localTime(instant: Date, tz: string): string {
  return DateTime.fromJSDate(instant, { zone: 'utc' }).setZone(tz).toFormat('HH:mm');
}

function inRange(dayStr: string, range: { from: string; to: string }): boolean {
  return dayStr >= range.from && dayStr <= range.to;
}

function timeAllowed(window: { earliest: string | null; latest: string | null }, hhmm: string): boolean {
  if (window.earliest && hhmm < window.earliest) return false;
  if (window.latest && hhmm > window.latest) return false;
  return true;
}

/** Koledarske noči na destinaciji po coni ciljnega letališča. Brez časa pristanka se vzame dan
 * odhoda iz izhodišča, pretvorjen v cono cilja — za nizkocenovne lete znotraj Evrope je to isti
 * dan. */
export function nightsAtDestination(offer: NormalizedOffer, destTz: string): number | null {
  if (!offer.inbound) return null;
  const arrive = offer.outbound.arrivalAt ?? offer.outbound.departureAt;
  const a = DateTime.fromJSDate(arrive, { zone: 'utc' }).setZone(destTz).startOf('day');
  const b = DateTime.fromJSDate(offer.inbound.departureAt, { zone: 'utc' }).setZone(destTz).startOf('day');
  return Math.round(b.diff(a, 'days').days);
}

export function offerMatchesRule(offer: NormalizedOffer, rule: SearchInput, ctx: MatchContext): MatchResult {
  const origin = ctx.airports(offer.origin);
  const dest = ctx.airports(offer.destination);
  if (!origin || !dest) return { ok: false, reason: 'unknownAirport' };

  if (!rule.departureAirports.includes(offer.origin)) return { ok: false, reason: 'origin' };

  if (rule.excluded.airports.includes(offer.destination) || rule.excluded.countries.includes(dest.country)) {
    return { ok: false, reason: 'excluded' };
  }
  if (rule.destination.mode === 'airports' && !rule.destination.airports.includes(offer.destination)) {
    return { ok: false, reason: 'destination' };
  }
  if (rule.destination.mode === 'countries' && !rule.destination.countries.includes(dest.country)) {
    return { ok: false, reason: 'destination' };
  }
  // Isto letališče kot odhodno nikoli ni cilj, tudi pri "kamor koli".
  if (offer.destination === offer.origin) return { ok: false, reason: 'destination' };

  const { windows } = ctx;
  if (windows.oneWay !== (offer.inbound === null)) return { ok: false, reason: 'oneWayMismatch' };

  const outDay = localDay(offer.outbound.departureAt, origin.tz);
  if (!inRange(outDay, windows.outbound)) return { ok: false, reason: 'outboundDate' };
  if (!weekdayAllowed(rule.outbound, outDay)) return { ok: false, reason: 'outboundWeekday' };
  if (!timeAllowed(rule.outbound, localTime(offer.outbound.departureAt, origin.tz))) {
    return { ok: false, reason: 'outboundTime' };
  }

  if (offer.inbound && windows.inbound && windows.nights) {
    const inDay = localDay(offer.inbound.departureAt, dest.tz);
    if (!inRange(inDay, windows.inbound)) return { ok: false, reason: 'inboundDate' };
    if (!weekdayAllowed(rule.inbound, inDay)) return { ok: false, reason: 'inboundWeekday' };
    if (!timeAllowed(rule.inbound, localTime(offer.inbound.departureAt, dest.tz))) {
      return { ok: false, reason: 'inboundTime' };
    }
    const nights = nightsAtDestination(offer, dest.tz);
    if (nights === null || nights < windows.nights.min || nights > windows.nights.max) {
      return { ok: false, reason: 'nights' };
    }
    if (rule.minStayHours !== null) {
      const arrive = offer.outbound.arrivalAt ?? offer.outbound.departureAt;
      const hours = (offer.inbound.departureAt.getTime() - arrive.getTime()) / 3_600_000;
      if (hours < rule.minStayHours) return { ok: false, reason: 'minStay' };
    }
    if (offer.inbound.stops > rule.maxStops) return { ok: false, reason: 'stops' };
  }

  if (offer.outbound.stops > rule.maxStops) return { ok: false, reason: 'stops' };
  if (rule.airlines.length > 0 && !rule.airlines.includes(offer.airline)) return { ok: false, reason: 'airline' };

  // Prtljaga se upošteva le, kadar vir podatek DA (FR-012); neznano ni razlog za zavrnitev.
  if (rule.baggage === 'checked' && offer.fare.baggage !== null && !/check|odd|regist/i.test(offer.fare.baggage)) {
    return { ok: false, reason: 'baggage' };
  }

  const people = rule.passengers.adults + rule.passengers.childrenAges.length;
  if (offer.passengers.adults !== rule.passengers.adults || offer.passengers.children !== rule.passengers.childrenAges.length) {
    return { ok: false, reason: 'passengers' };
  }

  if (offer.price.currency !== rule.price.currency) {
    // Cena v drugi valuti se ne pretvarja na slepo (edge case) — cenovna meja v EUR o ceni v GBP
    // ne pove ničesar, zato ponudba meji ne ustreza.
    if (rule.price.maxPerPerson !== null || rule.price.maxTotal !== null) return { ok: false, reason: 'currency' };
  } else {
    if (rule.price.maxPerPerson !== null && offer.price.amount / people > rule.price.maxPerPerson) {
      return { ok: false, reason: 'pricePerPerson' };
    }
    if (rule.price.maxTotal !== null && offer.price.amount > rule.price.maxTotal) {
      return { ok: false, reason: 'priceTotal' };
    }
  }

  return { ok: true };
}

/** Slovenska razlaga razloga — za `lastCheck.message` in dnevnik, nikoli tehnična. */
export function describeMatchFail(reason: MatchFailReason): string {
  const map: Record<MatchFailReason, string> = {
    origin: 'drugo odhodno letališče',
    destination: 'cilj ni med izbranimi',
    excluded: 'cilj je izključen',
    oneWayMismatch: 'enosmerno proti povratnemu',
    outboundDate: 'odhod zunaj obdobja',
    outboundWeekday: 'odhod na nedovoljen dan',
    outboundTime: 'odhod ob nedovoljeni uri',
    inboundDate: 'povratek zunaj obdobja',
    inboundWeekday: 'povratek na nedovoljen dan',
    inboundTime: 'povratek ob nedovoljeni uri',
    nights: 'trajanje zunaj meja',
    minStay: 'prekratek čas na destinaciji',
    stops: 'preveč prestopov',
    airline: 'drug prevoznik',
    baggage: 'brez zahtevane prtljage',
    passengers: 'druga sestava potnikov',
    currency: 'druga valuta',
    pricePerPerson: 'cena na osebo nad mejo',
    priceTotal: 'skupna cena nad mejo',
    unknownAirport: 'neznano letališče',
  };
  return map[reason];
}

import { describe, expect, it } from 'vitest';
import { computeWindows } from '../../../src/modules/flight-deals/domain/date-window.js';
import { findAirport } from '../../../src/modules/flight-deals/domain/airports.js';
import { nightsAtDestination, offerMatchesRule } from '../../../src/modules/flight-deals/domain/rule-matcher.js';
import type { SearchInput } from '../../../src/modules/flight-deals/domain/rule-input.js';
import { NOW, local, offer, weekendRule } from './_fixtures.js';

// FR-010 do FR-013 in FR-011 (lokalni čas letališča): ujemanje ponudbe s pravili (US2, acceptance
// 3 in 4; quality gate: prehod na zimski čas 25. 10. 2026).

function ctx(rule: SearchInput) {
  return { windows: computeWindows(rule, NOW, 'Europe/Ljubljana'), airports: findAirport };
}

describe('offerMatchesRule — vikend LJU → kamor koli', () => {
  it('petek 15:10 LJU → nedelja ustreza', () => {
    expect(offerMatchesRule(offer(), weekendRule(), ctx(weekendRule()))).toEqual({ ok: true });
  });

  it('petek 14:30 po lokalnem času LJU NE ustreza "po 15:00" (acceptance US2.3)', () => {
    const o = offer({ outbound: { ...offer().outbound, departureAt: local('2026-10-23T14:30', 'Europe/Ljubljana') } });
    expect(offerMatchesRule(o, weekendRule(), ctx(weekendRule()))).toEqual({ ok: false, reason: 'outboundTime' });
  });

  it('ura se presoja po coni letališča, ne po UTC: 15:10 LJU je 13:10 UTC in še vedno ustreza', () => {
    const o = offer();
    expect(o.outbound.departureAt.toISOString()).toBe('2026-10-23T13:10:00.000Z');
    expect(offerMatchesRule(o, weekendRule(), ctx(weekendRule())).ok).toBe(true);
  });

  it('nedelja 00:10 po lokalnem času (sobota po UTC) je nedelja — povratek ustreza', () => {
    const o = offer({ inbound: { ...offer().inbound!, departureAt: local('2026-10-25T00:10', 'Europe/London') } });
    expect(offerMatchesRule(o, weekendRule(), ctx(weekendRule())).ok).toBe(true);
  });

  it('prehod na zimski čas 25. 10. 2026: nočitve ostanejo 2 (koledarski dnevi, ne ure / 24)', () => {
    const o = offer();
    expect(nightsAtDestination(o, 'Europe/London')).toBe(2);
    // ura med pristankom in povratkom je 49, kar bi pri "ure / 24" dalo 2,04 → zaokroženo napačno
    const hours = (o.inbound!.departureAt.getTime() - o.outbound.arrivalAt!.getTime()) / 3_600_000;
    expect(hours).toBeGreaterThan(48);
  });

  it('povratek v petek (4 noči) ne ustreza dnevu in trajanju', () => {
    const o = offer({ inbound: { ...offer().inbound!, departureAt: local('2026-10-27T17:40', 'Europe/London') } });
    expect(offerMatchesRule(o, weekendRule(), ctx(weekendRule()))).toEqual({ ok: false, reason: 'inboundWeekday' });
  });

  it('cena 250 € za dva pri meji 120 €/osebo NE ustreza, 230 € ustreza (acceptance US2.4)', () => {
    expect(offerMatchesRule(offer({ price: { amount: 250, currency: 'EUR' } }), weekendRule(), ctx(weekendRule()))).toEqual({
      ok: false,
      reason: 'pricePerPerson',
    });
    expect(offerMatchesRule(offer({ price: { amount: 230, currency: 'EUR' } }), weekendRule(), ctx(weekendRule())).ok).toBe(true);
  });

  it('skupna meja', () => {
    const rule = weekendRule({ price: { maxPerPerson: null, maxTotal: 150, currency: 'EUR' } });
    expect(offerMatchesRule(offer(), rule, ctx(rule))).toEqual({ ok: false, reason: 'priceTotal' });
  });

  it('druga valuta ne ustreza cenovni meji (edge case)', () => {
    expect(offerMatchesRule(offer({ price: { amount: 100, currency: 'GBP' } }), weekendRule(), ctx(weekendRule()))).toEqual({
      ok: false,
      reason: 'currency',
    });
  });

  it('druga sestava potnikov ne ustreza', () => {
    expect(offerMatchesRule(offer({ passengers: { adults: 1, children: 0 } }), weekendRule(), ctx(weekendRule()))).toEqual({
      ok: false,
      reason: 'passengers',
    });
  });

  it('prestopi: maxStops 0 zavrne let s prestopom; maxStops 1 ga sprejme', () => {
    const o = offer({ outbound: { ...offer().outbound, stops: 1 } });
    expect(offerMatchesRule(o, weekendRule(), ctx(weekendRule()))).toEqual({ ok: false, reason: 'stops' });
    const rule = weekendRule({ maxStops: 1 });
    expect(offerMatchesRule(o, rule, ctx(rule)).ok).toBe(true);
  });

  it('prevozniki: seznam omeji, prazen seznam dovoli vse', () => {
    const rule = weekendRule({ airlines: ['W6'] });
    expect(offerMatchesRule(offer(), rule, ctx(rule))).toEqual({ ok: false, reason: 'airline' });
    expect(offerMatchesRule(offer(), weekendRule(), ctx(weekendRule())).ok).toBe(true);
  });

  it('izključena država in izključeno letališče', () => {
    const r1 = weekendRule({ excluded: { countries: ['GB'], airports: [] } });
    expect(offerMatchesRule(offer(), r1, ctx(r1))).toEqual({ ok: false, reason: 'excluded' });
    const r2 = weekendRule({ excluded: { countries: [], airports: ['STN'] } });
    expect(offerMatchesRule(offer(), r2, ctx(r2))).toEqual({ ok: false, reason: 'excluded' });
  });

  it('način držav: GB da, IT ne; način letališč', () => {
    const gb = weekendRule({ destination: { mode: 'countries', countries: ['GB'], airports: [] } });
    expect(offerMatchesRule(offer(), gb, ctx(gb)).ok).toBe(true);
    const it_ = weekendRule({ destination: { mode: 'countries', countries: ['IT'], airports: [] } });
    expect(offerMatchesRule(offer(), it_, ctx(it_))).toEqual({ ok: false, reason: 'destination' });
    const bgy = weekendRule({ destination: { mode: 'airports', countries: [], airports: ['BGY'] } });
    expect(offerMatchesRule(offer(), bgy, ctx(bgy))).toEqual({ ok: false, reason: 'destination' });
  });

  it('odhodno letališče, ki ni med izbranimi', () => {
    expect(offerMatchesRule(offer({ origin: 'ZAG' }), weekendRule(), ctx(weekendRule()))).toEqual({ ok: false, reason: 'origin' });
  });

  it('minimalni čas na destinaciji je razlika instantov', () => {
    const rule = weekendRule({ minStayHours: 60 });
    expect(offerMatchesRule(offer(), rule, ctx(rule))).toEqual({ ok: false, reason: 'minStay' });
    const rule2 = weekendRule({ minStayHours: 40 });
    expect(offerMatchesRule(offer(), rule2, ctx(rule2)).ok).toBe(true);
  });

  it('enosmerno pravilo ne sprejme povratne ponudbe in obratno', () => {
    const oneWay = weekendRule({ minNights: null, maxNights: null, inbound: { weekdays: [], earliest: null, latest: null } });
    expect(offerMatchesRule(offer(), oneWay, ctx(oneWay))).toEqual({ ok: false, reason: 'oneWayMismatch' });
    expect(offerMatchesRule(offer({ inbound: null }), weekendRule(), ctx(weekendRule()))).toEqual({ ok: false, reason: 'oneWayMismatch' });
  });

  it('prtljaga: zahteva "checked" zavrne znano ročno; neznano prepusti', () => {
    const rule = weekendRule({ baggage: 'checked' });
    expect(offerMatchesRule(offer({ fare: { type: null, baggage: 'samo majhna ročna torba' } }), rule, ctx(rule))).toEqual({ ok: false, reason: 'baggage' });
    expect(offerMatchesRule(offer(), rule, ctx(rule)).ok).toBe(true);
  });

  it('odhod zunaj okna', () => {
    const o = offer({
      outbound: { ...offer().outbound, departureAt: local('2026-11-06T15:10', 'Europe/Ljubljana') },
      inbound: { ...offer().inbound!, departureAt: local('2026-11-08T17:40', 'Europe/London') },
    });
    expect(offerMatchesRule(o, weekendRule(), ctx(weekendRule()))).toEqual({ ok: false, reason: 'outboundDate' });
  });
});

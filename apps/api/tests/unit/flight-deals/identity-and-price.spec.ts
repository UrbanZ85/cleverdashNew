import { describe, expect, it } from 'vitest';
import { canonicalIdentity, identityKey } from '../../../src/modules/flight-deals/domain/identity.js';
import { classifyChange, isNotifiable, percentChange } from '../../../src/platform/scanner/domain/price-change.js';
import { sanitizeBookingUrl } from '../../../src/modules/flight-deals/domain/booking-url.js';
import { offer } from './_fixtures.js';

// FR-026 (identiteta), FR-027/FR-030 (vrste sprememb, primeri iz specifikacije), varna povezava.

describe('identityKey', () => {
  it('ista vozovnica po dveh poteh → en ključ; cena in čas pristanka ne vplivata', () => {
    const a = offer();
    const b = offer({ price: { amount: 999, currency: 'EUR' }, outbound: { ...offer().outbound, arrivalAt: null } });
    expect(identityKey(a)).toBe(identityKey(b));
    expect(identityKey(a)).toMatch(/^[0-9a-f]{32}$/);
  });

  it('druga sestava potnikov, druga valuta ali drug vir → drug ključ', () => {
    expect(identityKey(offer({ passengers: { adults: 1, children: 0 } }))).not.toBe(identityKey(offer()));
    expect(identityKey(offer({ price: { amount: 200, currency: 'GBP' } }))).not.toBe(identityKey(offer()));
    expect(identityKey(offer({ providerId: 'ryanair' }))).not.toBe(identityKey(offer()));
  });

  it('vrstni red številk letov in presledki v njih ne vplivajo', () => {
    const a = offer({ outbound: { ...offer().outbound, flightNumbers: ['FR 1234', 'FR 9'] } });
    const b = offer({ outbound: { ...offer().outbound, flightNumbers: ['FR9', 'FR1234'] } });
    expect(identityKey(a)).toBe(identityKey(b));
    expect(canonicalIdentity(a)).toContain('FR1234+FR9');
  });

  it('enosmerna in povratna z istim odhodom sta različni', () => {
    expect(identityKey(offer({ inbound: null }))).not.toBe(identityKey(offer()));
  });
});

describe('classifyChange (FR-030, primera iz specifikacije)', () => {
  it('120 → 89 je POCENITEV za −31 (−25,8 %)', () => {
    expect(classifyChange({ amount: 120, currency: 'EUR' }, { amount: 89, currency: 'EUR' })).toEqual({
      type: 'PRICE_DOWN',
      absolute: -31,
      percent: -25.8,
      comparable: true,
    });
  });

  it('89 → 110 je PODRAŽITEV za +21 (+23,6 %)', () => {
    expect(classifyChange({ amount: 89, currency: 'EUR' }, { amount: 110, currency: 'EUR' })).toEqual({
      type: 'PRICE_UP',
      absolute: 21,
      percent: 23.6,
      comparable: true,
    });
  });

  it('enaka cena je NESPREMENJENO; brez prejšnje je NOVO brez primerjave', () => {
    expect(classifyChange({ amount: 89, currency: 'EUR' }, { amount: 89, currency: 'EUR' }).type).toBe('UNCHANGED');
    expect(classifyChange(null, { amount: 89, currency: 'EUR' })).toEqual({ type: 'NEW', absolute: null, percent: null, comparable: false });
  });

  it('druga valuta se ne primerja', () => {
    expect(classifyChange({ amount: 89, currency: 'GBP' }, { amount: 110, currency: 'EUR' }).comparable).toBe(false);
  });

  it('centi se primerjajo brez zaokroževanja, odstotek na eno decimalko', () => {
    expect(classifyChange({ amount: 89.99, currency: 'EUR' }, { amount: 89.98, currency: 'EUR' }).type).toBe('PRICE_DOWN');
    expect(percentChange(3, 4)).toBe(33.3);
  });

  it('obvestilo sprožijo NEW, PRICE_DOWN, PRICE_UP', () => {
    expect(['NEW', 'PRICE_DOWN', 'PRICE_UP'].every((t) => isNotifiable(t as never))).toBe(true);
    expect(isNotifiable('UNCHANGED')).toBe(false);
    expect(isNotifiable('UNAVAILABLE')).toBe(false);
  });
});

describe('sanitizeBookingUrl', () => {
  const hosts = ['aviasales.com', 'ryanair.com'];
  it('gostitelj vira ali njegova poddomena ostane', () => {
    expect(sanitizeBookingUrl('https://www.aviasales.com/search/LJU2310STN25101?x=1', hosts)).toBe(
      'https://www.aviasales.com/search/LJU2310STN25101?x=1',
    );
  });
  it('tuj gostitelj, javascript: in neveljaven niz → null', () => {
    expect(sanitizeBookingUrl('https://evil.example/aviasales.com', hosts)).toBeNull();
    expect(sanitizeBookingUrl('javascript:alert(1)', hosts)).toBeNull();
    expect(sanitizeBookingUrl('/relativna/pot', hosts)).toBeNull();
    expect(sanitizeBookingUrl(null, hosts)).toBeNull();
  });
});

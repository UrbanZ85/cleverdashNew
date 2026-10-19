import { describe, expect, it } from 'vitest';
import {
  EMAIL_GREEN,
  EMAIL_RED,
  changeLabel,
  digestSubject,
  formatMoneySl,
  renderDigest,
  type DigestItem,
} from '../../../src/modules/flight-deals/domain/email-template.js';
import { findAirport } from '../../../src/modules/flight-deals/domain/airports.js';
import { NOW, local } from './_fixtures.js';

// FR-035, FR-030: vsebina dopisa — vse postavke iz naročila, prečrtana stara cena, barvi, brez
// e-naslova prejemnika.

function item(overrides: Partial<DigestItem> = {}): DigestItem {
  return {
    ruleName: 'Vikend',
    ruleOwnerName: null,
    offerId: '64b000000000000000000001',
    origin: findAirport('LJU')!,
    destination: findAirport('STN')!,
    airline: 'FR',
    airlineName: 'Ryanair',
    outbound: {
      departureAt: local('2026-10-23T15:10', 'Europe/Ljubljana'),
      departureTz: 'Europe/Ljubljana',
      arrivalAt: local('2026-10-23T16:20', 'Europe/London'),
      arrivalTz: 'Europe/London',
      flightNumbers: ['FR1234'],
      stops: 0,
    },
    inbound: {
      departureAt: local('2026-10-25T17:40', 'Europe/London'),
      departureTz: 'Europe/London',
      arrivalAt: null,
      arrivalTz: 'Europe/Ljubljana',
      flightNumbers: ['FR1235'],
      stops: 0,
    },
    nights: 2,
    passengers: { adults: 2, children: 0 },
    price: { amount: 89, currency: 'EUR' },
    previousPrice: { amount: 120, currency: 'EUR' },
    priceIncludes: 'Osnovna vozovnica brez prtljage.',
    changeType: 'PRICE_DOWN',
    bookingUrl: 'https://www.ryanair.com/gb/en/trip/flights/select?x=1',
    providerLabel: 'Ryanair (neuradni iskalnik cen)',
    providerOfficial: false,
    dataAt: NOW,
    ...overrides,
  };
}

const ctx = { baseUrl: 'https://app.si', checkedAt: NOW, appName: 'CleverDash' };

describe('renderDigest', () => {
  it('vsebuje vse postavke iz FR-035', () => {
    const { html, text } = renderDigest([item()], ctx);
    for (const needle of ['Vikend', 'Ljubljana', 'LJU', 'STN', 'Ryanair', 'pet., 23. 10. 2026 ob 15:10', 'ned., 25. 10. 2026 ob 17:40', 'Europe/Ljubljana', 'Europe/London', '2 nočitvi', '2 odrasla', '89 €', '120 €', '−31 €', '25,8 %', 'POCENITEV', 'https://www.ryanair.com/gb/en/trip/flights/select', 'https://app.si/flight-deals/offers/64b000000000000000000001', 'Preverjeno', 'neuradni vir']) {
      expect(html, needle).toContain(needle);
      expect(text, needle).toContain(needle.replace(/&amp;/g, '&'));
    }
  });

  it('stara cena je prečrtana, nova zelena pri pocenitvi in rdeča pri podražitvi', () => {
    const down = renderDigest([item()], ctx).html;
    expect(down).toContain('<s style="color:#6b7280">120 €</s>');
    expect(down).toContain(`color:${EMAIL_GREEN};font-weight:700`);
    const up = renderDigest([item({ price: { amount: 110, currency: 'EUR' }, previousPrice: { amount: 89, currency: 'EUR' }, changeType: 'PRICE_UP' })], ctx).html;
    expect(up).toContain('<s style="color:#6b7280">89 €</s>');
    expect(up).toContain(`color:${EMAIL_RED};font-weight:700`);
    expect(up).toContain('+21 €');
    expect(up).toContain('+23,6 %');
  });

  it('NOVO nima prejšnje cene in nima prečrtanega', () => {
    const html = renderDigest([item({ changeType: 'NEW', previousPrice: null })], ctx).html;
    expect(html).toContain('NOVO');
    expect(html).not.toContain('<s ');
  });

  it('zadeva šteje po vrstah; pri deljenem iskanju je naveden lastnik', () => {
    const items = [item({ changeType: 'NEW', previousPrice: null }), item({ changeType: 'NEW', previousPrice: null, offerId: 'b' }), item(), item({ ruleOwnerName: 'Ana Novak', changeType: 'PRICE_UP' })];
    expect(digestSubject(items, 'CleverDash')).toBe('CleverDash - [Leti] 2 novi ponudbi, 1 pocenitev, 1 podražitev');
    expect(renderDigest(items, ctx).html).toContain('deli Ana Novak');
  });

  it('v telesu ni e-naslova in HTML v imenih je ubežan', () => {
    const { html, text } = renderDigest([item({ ruleName: '<script>x</script> Vikend' })], ctx);
    expect(html).not.toMatch(/[\w.+-]+@[\w-]+\.\w+/);
    expect(text).not.toMatch(/[\w.+-]+@[\w-]+\.\w+/);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('formatMoneySl in oznake', () => {
    expect(formatMoneySl({ amount: 89, currency: 'EUR' })).toBe('89 €');
    expect(formatMoneySl({ amount: 89.5, currency: 'GBP' })).toBe('89,50 GBP');
    expect(changeLabel('UNAVAILABLE')).toBe('NI VEČ NA VOLJO');
  });
});

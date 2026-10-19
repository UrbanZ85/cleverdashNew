import { describe, expect, it } from 'vitest';
import { AIRLINE_NAMES, airlineName, airlinesLabel, offerAirlines } from '../../../src/modules/flight-deals/domain/airlines.js';
import { travelpayoutsProvider } from '../../../src/modules/flight-deals/providers/travelpayouts.provider.js';
import { findAirport } from '../../../src/modules/flight-deals/domain/airports.js';
import { loadEnv, resetEnvCacheForTests } from '../../../src/platform/config/env.js';
import { NOW } from './_fixtures.js';

// Lastnikova zahteva 19. 10. 2026: pri ponudbi naj piše, s katero družbo se leti, in to z vsemi, kadar jih je več.

const base = { airline: 'FR', airlineName: null, outbound: { flightNumbers: ['FR1234'] }, inbound: null };

describe('airlines', () => {
  it('tabela: kode so 2 znaka in velike črke, imena neprazna; znane kode', () => {
    for (const [code, name] of Object.entries(AIRLINE_NAMES)) {
      expect(code, code).toMatch(/^[A-Z0-9]{2}$/);
      expect(name.trim().length, code).toBeGreaterThan(1);
    }
    expect(airlineName('FR')).toBe('Ryanair');
    expect(airlineName('w6')).toBe('Wizz Air');
    expect(airlineName('OU')).toBe('Croatia Airlines');
    expect(airlineName('ZZ')).toBeNull();
    expect(airlineName(null)).toBeNull();
  });

  it('offerAirlines: glavni prevoznik prvi, nato iz številk letov obeh smeri, brez dvojnikov', () => {
    expect(offerAirlines(base)).toEqual([{ code: 'FR', name: 'Ryanair' }]);
    const mixed = offerAirlines({ airline: 'FR', airlineName: null, outbound: { flightNumbers: ['FR1234'] }, inbound: { flightNumbers: ['W6 4561', 'U2 8081A'] } });
    expect(mixed).toEqual([
      { code: 'FR', name: 'Ryanair' },
      { code: 'W6', name: 'Wizz Air' },
      { code: 'U2', name: 'easyJet' },
    ]);
    // Ime, ki ga da vir, ima prednost pred tabelo; neznana koda ostane brez imena.
    expect(offerAirlines({ ...base, airline: 'FR', airlineName: 'Ryanair DAC' })[0]).toEqual({ code: 'FR', name: 'Ryanair DAC' });
    expect(offerAirlines({ ...base, airline: 'ZZ', outbound: { flightNumbers: ['ZZ12', 'ni-let'] } })).toEqual([{ code: 'ZZ', name: null }]);
  });

  it('airlinesLabel za dopis', () => {
    expect(airlinesLabel([{ code: 'FR', name: 'Ryanair' }, { code: 'W6', name: 'Wizz Air' }])).toBe('Ryanair (FR) + Wizz Air (W6)');
    expect(airlinesLabel([{ code: 'ZZ', name: null }])).toBe('ZZ');
  });

  it('Travelpayouts: airlineName se napolni iz tabele', () => {
    resetEnvCacheForTests();
    const env = loadEnv({
      NODE_ENV: 'test', PORT: '3000', TZ: 'Europe/Ljubljana', PUBLIC_BASE_URL: 'https://app.si', MONGO_URI: 'mongodb://x/y',
      SESSION_COOKIE_SECRET: 'c'.repeat(32), KEYCLOAK_ISSUER_URL: 'https://sso.example.com/realms/x', KEYCLOAK_CLIENT_ID: 'x',
      KEYCLOAK_CLIENT_SECRET: 'y', CREDENTIALS_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'), FLIGHT_TRAVELPAYOUTS_TOKEN: 'tok',
    });
    const query = {
      providerId: 'travelpayouts' as const, origin: 'LJU', destination: null, outbound: { from: '2026-10-01', to: '2026-10-31' }, inbound: null,
      direct: false, currency: 'EUR', adults: 1, children: 0, minNights: null, maxNights: null, priceCapPerPerson: null,
    };
    const row = { origin: 'LJU', destination: 'STN', price: 59, airline: 'fr', flight_number: '1234', departure_at: '2026-10-23T15:10:00+02:00', transfers: 0 };
    const result = travelpayoutsProvider.parse({ success: true, data: [row, { ...row, airline: 'ZZ' }] }, query, findAirport, NOW, env);
    expect(result.offers.map((o) => [o.airline, o.airlineName])).toEqual([['FR', 'Ryanair'], ['ZZ', null]]);
  });
});

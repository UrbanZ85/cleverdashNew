import { describe, expect, it } from 'vitest';
import {
  airportsNear,
  allAirports,
  distanceKm,
  findAirport,
  listCountries,
  missingAirports,
  searchAirports,
} from '../../../src/modules/flight-deals/domain/airports.js';

// FR-003, FR-004: nabor letališč in iskanje po njem (US1, acceptance 6).

describe('vgrajen nabor letališč', () => {
  it('vsebuje letališča iz naročila s cono', () => {
    for (const code of ['LJU', 'ZAG', 'TRS', 'VCE', 'TSF', 'GRZ', 'KLU']) {
      const a = findAirport(code);
      expect(a, code).not.toBeNull();
      expect(a?.tz, code).toMatch(/^Europe\//);
    }
    expect(findAirport('LJU')?.tz).toBe('Europe/Ljubljana');
    expect(findAirport('ZAG')?.tz).toBe('Europe/Zagreb');
  });

  it('vsak zapis ima IATA kodo, koordinati in cono', () => {
    for (const a of allAirports()) {
      expect(a.iata).toMatch(/^[A-Z]{3}$/);
      expect(Number.isFinite(a.lat) && Number.isFinite(a.lon)).toBe(true);
      expect(a.tz.length).toBeGreaterThan(0);
    }
    expect(allAirports().length).toBeGreaterThan(2000);
  });

  it('iskanje najde Trst po kodi, po imenu in po mestu, neobčutljivo na velike črke', () => {
    expect(searchAirports('TRS', 10).airports[0]?.iata).toBe('TRS');
    expect(searchAirports('trs', 10).airports[0]?.iata).toBe('TRS');
    expect(searchAirports('trieste', 10).airports.map((a) => a.iata)).toContain('TRS');
    expect(searchAirports('ronchi', 10).airports.map((a) => a.iata)).toContain('TRS');
    expect(searchAirports('trst', 10).airports[0]?.iata).toBe('TRS');
    expect(searchAirports('benetke', 10).airports.map((a) => a.iata)).toContain('VCE');
    expect(searchAirports('gradec', 10).airports[0]?.iata).toBe('GRZ');
  });

  it('iskanje zlaga šumnike: "pucnik" najde Ljubljano', () => {
    expect(searchAirports('pucnik', 10).airports.map((a) => a.iata)).toContain('LJU');
  });

  it('prazna poizvedba ne vrne ničesar', () => {
    expect(searchAirports('   ', 10)).toEqual({ airports: [], total: 0 });
  });

  it('radij 150 km od Ljubljane vsebuje letališča iz naročila z razdaljo', () => {
    const lju = findAirport('LJU')!;
    const { airports } = airportsNear(lju.lat, lju.lon, 150, 50);
    const codes = airports.map((a) => a.iata);
    for (const code of ['LJU', 'ZAG', 'TRS', 'GRZ', 'KLU']) expect(codes, code).toContain(code);
    expect(airports[0]?.iata).toBe('LJU');
    expect(airports[0]?.distanceKm).toBe(0);
    const zag = airports.find((a) => a.iata === 'ZAG');
    expect(zag?.distanceKm).toBeGreaterThan(100);
    expect(zag?.distanceKm).toBeLessThan(150);
  });

  it('radij 200 km zajame še Benetke in Treviso', () => {
    const lju = findAirport('LJU')!;
    const codes = airportsNear(lju.lat, lju.lon, 200, 50).airports.map((a) => a.iata);
    expect(codes).toContain('VCE');
    expect(codes).toContain('TSF');
  });

  it('haversine: LJU–STN je približno 1 230 km', () => {
    const lju = findAirport('LJU')!;
    const stn = findAirport('STN')!;
    const d = distanceKm(lju.lat, lju.lon, stn.lat, stn.lon);
    expect(d).toBeGreaterThan(1150);
    expect(d).toBeLessThan(1300);
  });

  it('missingAirports vrne samo kode, ki jih v naboru ni', () => {
    expect(missingAirports(['LJU', 'XXX', 'ZAG', 'QQQ'])).toEqual(['XXX', 'QQQ']);
  });

  it('seznam držav ima slovenska imena in je po njih razvrščen', () => {
    const countries = listCountries();
    const si = countries.find((c) => c.code === 'SI');
    expect(si?.name).toBe('Slovenija');
    expect(si?.airportCount).toBeGreaterThanOrEqual(1);
    const names = countries.map((c) => c.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'sl')));
  });
});

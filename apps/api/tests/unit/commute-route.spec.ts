import { describe, expect, it } from 'vitest';
import {
  NoRouteError,
  ROUTES_FIELD_MASK,
  buildComputeRoutesBody,
  commuteCacheKey,
  isPlaceUsable,
  parseComputeRoutesResponse,
  parseDurationSeconds,
  placeToWaypoint,
  type CommutePlace,
} from '../../src/domain/commute-route.js';

// Ploščica "Pot" pokaže tri števila: koliko traja pot zdaj, koliko bi trajala brez prometa
// in kolikšna je razlika. Vsa tri nastanejo tukaj, brez omrežja — klic je ločen
// (modules/dashboard/clients/google-routes.client.ts), da je prav ta izračun preverljiv.

const home: CommutePlace = { label: 'Doma', address: null, latitude: 46.062382, longitude: 14.560178 };
const work: CommutePlace = { label: 'Služba', address: null, latitude: 45.9610473, longitude: 14.2979519 };
const byAddress: CommutePlace = { label: 'Služba', address: ' Dunajska cesta 1, Ljubljana ', latitude: null, longitude: null };
const empty: CommutePlace = { label: 'Doma', address: null, latitude: null, longitude: null };

describe('isPlaceUsable', () => {
  it.each([
    [home, true, 'koordinati'],
    [byAddress, true, 'naslov'],
    [empty, false, 'nič od tega'],
    [{ label: 'x', address: '   ', latitude: null, longitude: null } as CommutePlace, false, 'prazen naslov'],
    // Samo ena koordinata ni kraj — polovica para je enako neuporabna kot nič.
    [{ label: 'x', address: null, latitude: 46.1, longitude: null } as CommutePlace, false, 'samo širina'],
  ])('%#: %s → %s (%s)', (place, expected) => {
    expect(isPlaceUsable(place as CommutePlace)).toBe(expected);
  });
});

describe('placeToWaypoint', () => {
  it('koordinati imata prednost pred naslovom — Googlu ni treba geokodirati', () => {
    const withBoth: CommutePlace = { ...home, address: 'Dunajska 1' };
    expect(placeToWaypoint(withBoth)).toEqual({
      location: { latLng: { latitude: 46.062382, longitude: 14.560178 } },
    });
  });

  it('naslov se obreže', () => {
    expect(placeToWaypoint(byAddress)).toEqual({ address: 'Dunajska cesta 1, Ljubljana' });
  });

  it('nedoločen kraj vrne null', () => {
    expect(placeToWaypoint(empty)).toBeNull();
  });
});

describe('buildComputeRoutesBody', () => {
  const at = new Date('2026-09-02T06:30:00.000Z');

  it('pošlje obe točki, način vožnje in čas odhoda', () => {
    const body = buildComputeRoutesBody(home, work, at);
    expect(body).toEqual({
      origin: { location: { latLng: { latitude: 46.062382, longitude: 14.560178 } } },
      destination: { location: { latLng: { latitude: 45.9610473, longitude: 14.2979519 } } },
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_AWARE',
      departureTime: '2026-09-02T06:30:00.000Z',
    });
  });

  it('brez TRAFFIC_AWARE in časa odhoda promet ne bi bil upoštevan', () => {
    // Varovalka pred "poenostavitvijo": brez teh dveh polj vrne vir duration = staticDuration
    // in zamuda je vedno nič — ploščica bi delovala, a bi vedno lagala.
    const body = buildComputeRoutesBody(home, work, at);
    expect(body.routingPreference).toBe('TRAFFIC_AWARE');
    expect(typeof body.departureTime).toBe('string');
  });

  it('nedoločen kraj vrže napako, namesto da bi poslal polovično zahtevo', () => {
    expect(() => buildComputeRoutesBody(empty, work, at)).toThrowError(/začetek in cilj/);
  });

  it('maska polj zahteva natanko tri polja, ki jih ploščica pokaže', () => {
    // Brez te glave vir vrne 400; vsako dodatno polje je večji (in lahko dražji) odgovor.
    expect(ROUTES_FIELD_MASK).toBe('routes.duration,routes.staticDuration,routes.distanceMeters');
  });
});

describe('parseDurationSeconds', () => {
  it.each([
    ['1234s', 1234],
    ['0s', 0],
    ['1234.5s', 1235],
    [' 900s ', 900],
  ])('%s → %s', (raw, expected) => {
    expect(parseDurationSeconds(raw)).toBe(expected);
  });

  it.each(['1234', 'PT20M', '', undefined])('nerazumljivo (%s) → null', (raw) => {
    expect(parseDurationSeconds(raw as string | undefined)).toBeNull();
  });
});

describe('parseComputeRoutesResponse', () => {
  it('izračuna zamudo kot razliko med dejanskim in prostim trajanjem', () => {
    const travel = parseComputeRoutesResponse({
      routes: [{ duration: '2400s', staticDuration: '1800s', distanceMeters: 18_400 }],
    });
    expect(travel).toEqual({
      durationSeconds: 2400,
      staticDurationSeconds: 1800,
      delaySeconds: 600,
      distanceMeters: 18_400,
    });
  });

  it('hitrejše od običajnega ni negativna zamuda, ampak nič', () => {
    const travel = parseComputeRoutesResponse({
      routes: [{ duration: '1700s', staticDuration: '1800s', distanceMeters: 18_000 }],
    });
    expect(travel.delaySeconds).toBe(0);
  });

  it('brez staticDuration šteje, da zamude ni (in ne izmišlja števila)', () => {
    const travel = parseComputeRoutesResponse({ routes: [{ duration: '1800s', distanceMeters: 1000 }] });
    expect(travel.staticDurationSeconds).toBe(1800);
    expect(travel.delaySeconds).toBe(0);
  });

  it('neuporabljena polja v odgovoru ne podrejo razčlenjevanja', () => {
    // Isti dogovor kot pri ARSO (`.passthrough()`): sprememba v delu odgovora, ki ga ne
    // beremo, ne sme sesuti ploščice.
    const travel = parseComputeRoutesResponse({
      routes: [{ duration: '600s', staticDuration: '600s', distanceMeters: 5000, polyline: { encodedPolyline: 'abc' } }],
      geocodingResults: { origin: {} },
    });
    expect(travel.durationSeconds).toBe(600);
  });

  it('odgovor brez poti je NoRouteError in ne napaka vira', () => {
    // Razlika je pomembna: "med tema krajema ni ceste" je uporabnikov podatek, "vir ne
    // odgovarja" pa naša napaka — ploščica ju izpiše različno.
    expect(() => parseComputeRoutesResponse({ routes: [] })).toThrowError(NoRouteError);
    expect(() => parseComputeRoutesResponse({})).toThrowError(NoRouteError);
  });

  it('pot brez trajanja je prav tako NoRouteError', () => {
    expect(() => parseComputeRoutesResponse({ routes: [{ distanceMeters: 100 }] })).toThrowError(NoRouteError);
  });

  it('odgovor, ki ni te oblike, je napaka vira', () => {
    expect(() => parseComputeRoutesResponse({ routes: 'nekaj' })).toThrowError(/pričakovani obliki/);
  });
});

describe('commuteCacheKey', () => {
  it('vsebuje uporabnika in smer — predpomnilnik je skupen vsem uporabnikom', () => {
    const key = commuteCacheKey('user-1', 'to-work', home, work);
    expect(key.startsWith('commute:user-1:to-work:')).toBe(true);
  });

  it('dva uporabnika z istima krajema imata različna ključa', () => {
    expect(commuteCacheKey('user-1', 'to-work', home, work)).not.toBe(
      commuteCacheKey('user-2', 'to-work', home, work),
    );
  });

  it('obe smeri imata različna ključa, čeprav sta kraja ista', () => {
    expect(commuteCacheKey('user-1', 'to-work', home, work)).not.toBe(
      commuteCacheKey('user-1', 'to-home', work, home),
    );
  });

  it('sprememba kraja pomeni nov ključ — sicer bi pet minut kazal čas za prejšnjo pot', () => {
    const moved: CommutePlace = { ...work, latitude: 46.5 };
    expect(commuteCacheKey('user-1', 'to-work', home, work)).not.toBe(
      commuteCacheKey('user-1', 'to-work', home, moved),
    );
  });

  it('imena kraja v ključu ni — preimenovanje ni nova pot', () => {
    const renamed: CommutePlace = { ...work, label: 'Pisarna' };
    expect(commuteCacheKey('user-1', 'to-work', home, work)).toBe(
      commuteCacheKey('user-1', 'to-work', home, renamed),
    );
  });

  it('naslova ni v ključu v berljivi obliki', () => {
    const key = commuteCacheKey('user-1', 'to-work', byAddress, work);
    expect(key).not.toContain('Dunajska');
  });
});

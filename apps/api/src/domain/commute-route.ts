// Člen IX: čista funkcija, brez omrežja in brez baze. Vse, kar ploščica "Pot" ve o poti,
// nastane tukaj — klic sam je v modules/dashboard/clients/google-routes.client.ts.
//
// Vir je Google Routes API (`directions/v2:computeRoutes`). Trije podatki so pomembni in
// vsi trije so v odgovoru:
//   duration        — koliko traja pot ZDAJ, z upoštevanim prometom,
//   staticDuration  — koliko bi trajala brez prometa,
//   distanceMeters  — dolžina poti.
// Razlika prvih dveh JE zamuda zaradi prometa; to je edini razlog, da se sploh zahteva
// `staticDuration` (brez nje bi bilo "35 min" brez pomena — ne bi vedeli, ali je to običajno).

import { createHash } from 'node:crypto';
import { z } from 'zod';

/** Kraj, kot ga uporabnik nastavi: naslov ALI koordinati (glej `placeToWaypoint`). */
export interface CommutePlace {
  label: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
}

export type CommuteDirection = 'to-work' | 'to-home';

export interface CommuteTravel {
  /** Trajanje z upoštevanim prometom. */
  durationSeconds: number;
  /** Trajanje brez prometa — brez tega "35 min" ne pove, ali je to običajno. */
  staticDurationSeconds: number;
  /** `duration - staticDuration`, nikoli negativno (hitrejše od običajnega ni "zamuda"). */
  delaySeconds: number;
  distanceMeters: number;
}

/**
 * Brez te glave Routes API vrne 400 — polja so obvezna in ne privzeta. Zahtevamo natanko
 * tri, ki jih ploščica pokaže; vsako dodatno polje je večji odgovor in po Googlovem
 * cenovnem redu lahko tudi dražja zahteva.
 */
export const ROUTES_FIELD_MASK = 'routes.duration,routes.staticDuration,routes.distanceMeters';

/** Zahteva ne sme iti ven, dokler ni jasno, da je kraj sploh nastavljen. */
export function isPlaceUsable(place: CommutePlace | null | undefined): boolean {
  if (!place) return false;
  if (place.address !== null && place.address.trim().length > 0) return true;
  return typeof place.latitude === 'number' && typeof place.longitude === 'number';
}

/**
 * Kraj v obliko, ki jo razume Routes API. Koordinati imata prednost pred naslovom: naslov
 * mora Google najprej razrešiti (geokodiranje), kar je dodatna negotovost in po cenovnem
 * redu dodatna storitev — koordinati sta natanko to, kar smo mislili.
 */
export function placeToWaypoint(place: CommutePlace): Record<string, unknown> | null {
  if (typeof place.latitude === 'number' && typeof place.longitude === 'number') {
    return { location: { latLng: { latitude: place.latitude, longitude: place.longitude } } };
  }
  const address = place.address?.trim() ?? '';
  return address.length > 0 ? { address } : null;
}

/**
 * Telo zahteve za eno smer.
 *
 * `TRAFFIC_AWARE` (in ne `TRAFFIC_AWARE_OPTIMAL`) je zavestna izbira: razliko med njima
 * plačamo, ploščica pa potrebuje oceno trajanja, ne optimalne razporeditve poti.
 * `departureTime` je "zdaj" — brez njega promet ni upoštevan in `duration` bi bil enak
 * `staticDuration`, torej zamuda vedno nič.
 */
export function buildComputeRoutesBody(
  from: CommutePlace,
  to: CommutePlace,
  departureAt: Date,
): Record<string, unknown> {
  const origin = placeToWaypoint(from);
  const destination = placeToWaypoint(to);
  if (!origin || !destination) {
    throw new Error('Za izračun poti sta potrebna začetek in cilj z naslovom ali koordinatama.');
  }
  return {
    origin,
    destination,
    travelMode: 'DRIVE',
    routingPreference: 'TRAFFIC_AWARE',
    departureTime: departureAt.toISOString(),
  };
}

/**
 * Ključ predpomnilnika za eno smer.
 *
 * V ključu MORATA biti uporabnik IN oba kraja: predpomnilnik (`platform/cache/model.ts`) je
 * skupen vsem uporabnikom, pot pa je oseben podatek — brez uporabnika v ključu bi drugi
 * videl čas moje poti. Kraja sta v ključu zato, da sprememba naslova takoj pomeni nov
 * izračun in ne pet minut starega časa za povsem drugo pot (isti razlog kot pri
 * `sourceKey()` v platform/sources/resolution.service.ts).
 *
 * Zgoščevanje in ne cel naslov: ključ ostane kratek, naslov doma pa ne konča v ključu
 * zapisa, ki ga je mogoče prebrati iz baze ali dnevnika.
 */
export function commuteCacheKey(
  userId: string,
  direction: CommuteDirection,
  from: CommutePlace,
  to: CommutePlace,
): string {
  const shape = JSON.stringify([from.address, from.latitude, from.longitude, to.address, to.latitude, to.longitude]);
  const digest = createHash('sha256').update(shape).digest('hex').slice(0, 16);
  return `commute:${userId}:${direction}:${digest}`;
}

// Trajanja Routes API vrača kot protobufov `Duration`, torej niz s sekundami in pripono
// "s" ("1234s", tudi "1234.5s"). `.passthrough()`, ker se bere samo, kar ploščica pokaže —
// dodatna polja v odgovoru ne smejo podreti razčlenjevanja (isti dogovor kot pri ARSO).
const routeSchema = z
  .object({
    duration: z.string().optional(),
    staticDuration: z.string().optional(),
    distanceMeters: z.number().optional(),
  })
  .passthrough();

const responseSchema = z
  .object({
    routes: z.array(routeSchema).optional(),
  })
  .passthrough();

/** "1234s" → 1234. Vrne `null` za manjkajočo ali nerazumljivo vrednost. */
export function parseDurationSeconds(raw: string | undefined): number | null {
  if (!raw) return null;
  const match = /^(\d+(?:\.\d+)?)s$/.exec(raw.trim());
  if (!match) return null;
  return Math.round(Number(match[1]));
}

export class NoRouteError extends Error {}

/**
 * Iz odgovora vzame prvo pot in izračuna zamudo. Odgovor brez poti (npr. cilj na drugem
 * otoku, brez ceste) NI napaka vira — vrže `NoRouteError`, da klicatelj to loči od izpada
 * in pokaže "poti ni mogoče izračunati" namesto "vir ne odgovarja".
 */
export function parseComputeRoutesResponse(payload: unknown): CommuteTravel {
  const parsed = responseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error('Odgovor Routes API ni v pričakovani obliki.');
  }

  const route = parsed.data.routes?.[0];
  if (!route) throw new NoRouteError('Med tema krajema ni bilo mogoče izračunati poti.');

  const durationSeconds = parseDurationSeconds(route.duration);
  const staticDurationSeconds = parseDurationSeconds(route.staticDuration) ?? durationSeconds;
  if (durationSeconds === null || staticDurationSeconds === null) {
    throw new NoRouteError('Odgovor ni vseboval trajanja poti.');
  }

  return {
    durationSeconds,
    staticDurationSeconds,
    // Hitrejše od običajnega se ne izpisuje kot negativna zamuda — pomeni "brez zamude".
    delaySeconds: Math.max(0, durationSeconds - staticDurationSeconds),
    distanceMeters: route.distanceMeters ?? 0,
  };
}

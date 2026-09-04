import { badRequest } from '../../../platform/errors/problem.js';

// Preverjanje krajev ploščice "Pot" (`Settings.commute`). Kraj je "doma" in "služba"; smeri
// (v službo / domov) se iz njiju izpeljeta in se ne nastavljata.

export interface CommutePlacePatch {
  label?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export type CommuteLayout = 'vertical' | 'horizontal';

export interface CommutePatch {
  home?: CommutePlacePatch;
  work?: CommutePlacePatch;
  /** Višina posameznega zemljevida v ploščici. */
  mapHeightPx?: number | null;
  /** Zemljevida drug pod drugim (`vertical`) ali drug ob drugem (`horizontal`). */
  layout?: CommuteLayout | null;
}

/** Meje višine zemljevida. Spodnja je toliko, da je na zemljevidu še kaj videti, zgornja
 * toliko, da ena ploščica ne zasede cele nadzorne plošče. Isti števili uveljavlja odjemalec,
 * da uporabnik napako vidi takoj (apps/web/.../features/dashboard/commute.model.ts). */
export const MIN_MAP_HEIGHT_PX = 100;
export const MAX_MAP_HEIGHT_PX = 600;
export const DEFAULT_MAP_HEIGHT_PX = 170;

const DEFAULT_LABELS: Record<'home' | 'work', string> = { home: 'Doma', work: 'Služba' };
const FIELD_LABELS: Record<'home' | 'work', string> = { home: 'Kraj “doma”', work: 'Kraj “služba”' };

const MAX_LABEL = 40;
const MAX_ADDRESS = 200;

function validatePlace(key: 'home' | 'work', patch: CommutePlacePatch): CommutePlacePatch {
  const result: CommutePlacePatch = {};
  const where = FIELD_LABELS[key];

  if (patch.label !== undefined) {
    const label = (patch.label ?? '').trim();
    if (label.length > MAX_LABEL) {
      throw badRequest(`${where}: ime naj bo dolgo največ ${MAX_LABEL} znakov.`);
    }
    // Prazno ime ni prazna ploščica: vrne se na privzeto, da oznaka nad zemljevidom nikoli
    // ni prazen prostor.
    result.label = label.length > 0 ? label : DEFAULT_LABELS[key];
  }

  if (patch.address !== undefined) {
    const address = (patch.address ?? '').trim();
    if (address.length > MAX_ADDRESS) {
      throw badRequest(`${where}: naslov naj bo dolg največ ${MAX_ADDRESS} znakov.`);
    }
    result.address = address.length > 0 ? address : null;
  }

  // Koordinati sta PAR in se preverjata skupaj: shranjena samo ena bi pomenila kraj, ki ga
  // ni mogoče poslati ne Routes API-ju ne zemljevidu — in ker je druga polovica `null`, bi
  // bila napaka vidna šele kot manjkajoč čas poti.
  const hasLat = patch.latitude !== undefined;
  const hasLon = patch.longitude !== undefined;
  if (hasLat !== hasLon) {
    throw badRequest(`${where}: zemljepisno širino in dolžino je treba navesti skupaj.`);
  }
  if (hasLat && hasLon) {
    const lat = patch.latitude;
    const lon = patch.longitude;
    const bothEmpty = lat === null && lon === null;
    const bothNumbers = typeof lat === 'number' && typeof lon === 'number';
    if (!bothEmpty && !bothNumbers) {
      throw badRequest(`${where}: zemljepisno širino in dolžino je treba navesti skupaj.`);
    }
    if (bothNumbers) {
      if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
        throw badRequest(`${where}: zemljepisna širina mora biti med -90 in 90.`);
      }
      if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
        throw badRequest(`${where}: zemljepisna dolžina mora biti med -180 in 180.`);
      }
    }
    result.latitude = bothNumbers ? lat : null;
    result.longitude = bothNumbers ? lon : null;
  }

  return result;
}

/**
 * Preveri in obreže kraja iz `PUT /settings`.
 *
 * Pomen vrednosti (isti dogovor kot pri `sources`):
 *  - `undefined` → tega polja ta zahteva ne spreminja;
 *  - `null` ali prazen niz → polje se izprazni (`label` se vrne na privzeto ime).
 *
 * Kraj SME ostati nepopoln (samo ime, brez naslova in koordinat) — takrat ploščica pove, da
 * pot ni nastavljena, namesto da bi shranjevanje zavrnili in uporabnika pustili brez poti
 * naprej.
 */
export function validateCommuteSettings(patch: CommutePatch): CommutePatch {
  const result: CommutePatch = {};
  for (const key of ['home', 'work'] as const) {
    const place = patch[key];
    if (place === undefined) continue;
    result[key] = validatePlace(key, place);
  }

  if (patch.mapHeightPx !== undefined) {
    // `null` pomeni "vrni na privzeto" — enako kot prazno ime kraja. Vrednost izven mej je
    // zavrnjena in ne tiho obrezana: uporabnik mora vedeti, da 2000 px ni bilo shranjenih.
    if (patch.mapHeightPx === null) {
      result.mapHeightPx = DEFAULT_MAP_HEIGHT_PX;
    } else {
      const height = patch.mapHeightPx;
      if (!Number.isFinite(height) || height < MIN_MAP_HEIGHT_PX || height > MAX_MAP_HEIGHT_PX) {
        throw badRequest(
          `Višina zemljevida mora biti med ${MIN_MAP_HEIGHT_PX} in ${MAX_MAP_HEIGHT_PX} slikovnimi točkami.`,
        );
      }
      result.mapHeightPx = Math.round(height);
    }
  }

  if (patch.layout !== undefined) {
    if (patch.layout === null) {
      result.layout = 'vertical';
    } else if (patch.layout !== 'vertical' && patch.layout !== 'horizontal') {
      throw badRequest('Postavitev zemljevidov je lahko samo “vertical” ali “horizontal”.');
    } else {
      result.layout = patch.layout;
    }
  }

  return result;
}

import { badRequest } from '../../../platform/errors/problem.js';
import { isValidStationId } from '../../../domain/arso-station.js';

export interface MeteoSettingsPatch {
  /** Oznaka ARSO postaje; `null` ali prazen niz pomeni "naj velja privzetek namestitve". */
  station?: string | null;
}

/**
 * Preveri izbrano ARSO postajo.
 *
 * Pomen vrednosti je isti kot pri `sources` (glej source-overrides.service.ts):
 *  - `null` ali prazen niz → povrni na privzetek namestitve (`ARSO_DEFAULT_STATION`);
 *  - `undefined` → ta zahteva postaje ne spreminja.
 *
 * Preverja se OBLIKA oznake in ne, ali postaja pri ARSO resnično obstaja: obstoj bi zahteval
 * klic zunanjega vira med shranjevanjem nastavitev (člen VIII — nastavitve niso pot do ARSO),
 * neobstoječa postaja pa se pokaže takoj in razumljivo pri branju meritev (503 z razlago) ter
 * je v vmesniku tako ali tako izbrana s seznama pravih postaj (`GET /meteo/stations`).
 */
export function validateMeteoSettings(patch: MeteoSettingsPatch): MeteoSettingsPatch {
  const result: MeteoSettingsPatch = {};
  if (patch.station === undefined) return result;

  if (patch.station === null || patch.station.trim() === '') {
    result.station = null;
    return result;
  }

  const station = patch.station.trim().toUpperCase();
  if (!isValidStationId(station)) {
    throw badRequest(
      'Oznaka postaje ni veljavna. Izberi postajo s seznama (velike črke, števke, "-" in "_"), npr. VRHNIKA.',
    );
  }
  result.station = station;
  return result;
}

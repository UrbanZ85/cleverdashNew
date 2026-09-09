import { badRequest } from '../../../platform/errors/problem.js';
import {
  MAX_SELECTED_STATIONS,
  formatStationRef,
  parseStationRef,
} from '../../../domain/meteo-station-ref.js';

export interface MeteoSettingsPatch {
  /** Ena postaja — starejša oblika, ohranjena zaradi združljivosti (glej spodaj). */
  station?: string | null;
  /** Izbrane postaje kot sklici `<ponudnik>:<oznaka>`; prazen seznam pomeni "naj velja
   * privzetek namestitve". */
  stations?: string[] | null;
}

/** Kar se dejansko zapiše v dokument. Oboje ali nič — seznam in njegova prva postaja se ne
 * smeta razhajati (razlog v `normalizeMeteoSettings`). */
export interface MeteoSettingsWrite {
  station: string | null;
  stations: string[];
}

/**
 * Preveri in poenoti izbrane postaje.
 *
 * Pomen vrednosti je isti kot pri `sources` (glej source-overrides.service.ts):
 *  - `null` ali prazen seznam → povrni na privzetek namestitve (`ARSO_DEFAULT_STATION`);
 *  - `undefined` → ta zahteva izbire ne spreminja.
 *
 * Preverja se OBLIKA sklica in ne, ali postaja pri ponudniku resnično obstaja: obstoj bi
 * zahteval klic zunanjega vira med shranjevanjem nastavitev (člen VIII — nastavitve niso pot
 * do ARSO), neobstoječa postaja pa se pokaže takoj in razumljivo pri branju meritev (503 z
 * razlago) ter je v vmesniku tako ali tako izbrana s seznama pravih postaj.
 *
 * ZAKAJ SE PIŠE OBOJE (`stations` in `station`): `station` je ostanek časa, ko je bila postaja
 * ena sama in oznaka gola (`VRHNIKA`). Če bi ob shranjevanju seznama ostal nedotaknjen, bi
 * odjemalec, ki bere še staro polje, kazal postajo, ki je uporabnik morda ni več izbral — in
 * to tiho. Zato se `station` vedno prepiše s PRVO postajo seznama: ena resnica, dva zapisa.
 */
export function normalizeMeteoSettings(patch: MeteoSettingsPatch): MeteoSettingsWrite | null {
  const requested = requestedValues(patch);
  if (requested === undefined) return null;

  const refs: string[] = [];
  for (const value of requested) {
    const trimmed = value.trim();
    if (trimmed.length === 0) continue;
    const ref = parseStationRef(trimmed);
    if (!ref) {
      throw badRequest(
        `Oznaka postaje "${trimmed}" ni veljavna. Izberi postajo s seznama — sklic je oblike ` +
          '"arso:VRHNIKA" ali "neverin:sveta-marina".',
      );
    }
    const formatted = formatStationRef(ref);
    // Podvojena postaja ni napaka, ampak dvakrat isti čip v preklopniku — tiho se izpusti.
    if (!refs.includes(formatted)) refs.push(formatted);
  }

  if (refs.length > MAX_SELECTED_STATIONS) {
    throw badRequest(
      `Hkrati je lahko izbranih največ ${MAX_SELECTED_STATIONS} postaj; izbranih je ${refs.length}.`,
    );
  }

  return { station: refs[0] ?? null, stations: refs };
}

/**
 * Kaj je klicatelj sploh poslal.
 *
 * Sprejemata se OBE obliki, ker člen III pravi, da mora HTTP klic zmoči isto kot vmesnik —
 * in avtomatizacija, napisana pred to razširitvijo, pošilja `{"station":"VRHNIKA"}`. Kadar
 * prideta obe, obvelja `stations`: to je oblika, ki jo pošilja današnji vmesnik.
 */
function requestedValues(patch: MeteoSettingsPatch): string[] | undefined {
  if (patch.stations !== undefined) return patch.stations ?? [];
  if (patch.station !== undefined) return patch.station === null ? [] : [patch.station];
  return undefined;
}

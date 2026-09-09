import { loadEnv } from '../config/env.js';
import { getOrCreateSettingsForUser } from '../../modules/settings/model.js';
import {
  DEFAULT_STATION_REF,
  type MeteoStationRef,
  parseStationRef,
  parseStationRefs,
} from '../../domain/meteo-station-ref.js';

// Izbrane postaje iz OSEBNIH nastavitev (drug modul).
//
// Zakaj v platform/ in ne v modules/meteo/: uvoz med moduli prepoveduje člen I (uveljavlja ga
// pravilo `cleverdash/module-boundary` v eslint.config.js). Enako sta urejena
// `platform/settings/commute.service.ts` in `platform/sources/resolution.service.ts`.
//
// Tri ravni, v tem vrstnem redu: osebna izbira → `ARSO_DEFAULT_STATION` iz okolja → konstanta
// v kodi. Sredinska raven obstaja zato, da namestitev za družino na Vrhniki lahko vsem novim
// uporabnikom postavi domačo postajo, ne da bi kdo popravljal kodo; najnižja pa zato, da modul
// deluje takoj po `docker compose up` z izpolnjenim samo `.env` (vrata 4).

export interface ResolvedMeteoStations {
  /** Izbrane postaje v vrstnem redu, v katerem jih je uporabnik izbral. Nikoli prazen —
   * kadar izbire ni, vsebuje privzetek namestitve. */
  stations: MeteoStationRef[];
  /** Ali je izbiro opravil UPORABNIK sam. `false` pomeni privzetek — vmesnik to pove, da
   * človek ve, da gleda Ljubljano, ker svoje postaje še ni izbral, in ne po pomoti. */
  chosen: boolean;
}

/**
 * `userId` je `null` za klicatelja z API ključem (avtomatizacija) — ta osebnih nastavitev
 * nima, zato dobi privzetek namestitve (isti dogovor kot `resolveTabs` in
 * `resolveWeatherSource`).
 */
export async function resolveMeteoStations(userId: string | null): Promise<ResolvedMeteoStations> {
  const fallback = installationDefault();
  if (!userId) return { stations: [fallback], chosen: false };

  const settings = await getOrCreateSettingsForUser(userId);
  const meteo = settings.meteo;

  // Shranjene vrednosti se preverijo ob BRANJU in ne samo ob shranjevanju: dokument v bazi je
  // lahko starejši od pravil (enako kot pri naslovih vtičnikov, glej plugins.router.ts).
  // Neveljavne se odvržejo, ne zavrnejo — ena postaja, ki je vir ne pozna več, ne sme
  // pomeniti praznega zavihka za vse ostale.
  const selected = parseStationRefs([...(meteo?.stations ?? [])]);
  if (selected.length > 0) return { stations: selected, chosen: true };

  // Selitev ob branju: dokler je bil ponudnik en sam, je bila izbira gola oznaka v `station`
  // (`VRHNIKA`). Dokumenti s to obliko so še v bazi in ostanejo veljavni, dokler uporabnik
  // izbire ne shrani znova — takrat settings router zapiše obe polji hkrati.
  const legacy = typeof meteo?.station === 'string' ? parseStationRef(meteo.station) : null;
  if (legacy) return { stations: [legacy], chosen: true };

  return { stations: [fallback], chosen: false };
}

/**
 * Ena postaja — tista, ki velja, kadar klicatelj ne pove svoje.
 *
 * To je PRVA izbrana postaja in ne poljubna: ploščica na nadzorni plošči ima prostor za eno,
 * zavihek pa se odpre na eni, in "prva na seznamu" je edini vrstni red, ki ga uporabnik vidi
 * in nadzoruje.
 */
export async function resolveMeteoStation(
  userId: string | null,
): Promise<{ station: MeteoStationRef; chosen: boolean }> {
  const resolved = await resolveMeteoStations(userId);
  return { station: resolved.stations[0] ?? installationDefault(), chosen: resolved.chosen };
}

function installationDefault(): MeteoStationRef {
  // `ARSO_DEFAULT_STATION` je gola ARSO oznaka in ne sklic s ponudnikom: takšna je bila, ko je
  // bil ponudnik en sam, in obstoječih `.env` datotek zaradi tega ni treba popravljati.
  // `parseStationRef` golo obliko razume, sprejme pa tudi `arso:VRHNIKA`, če jo kdo napiše.
  return parseStationRef(loadEnv().ARSO_DEFAULT_STATION) ?? DEFAULT_STATION_REF;
}

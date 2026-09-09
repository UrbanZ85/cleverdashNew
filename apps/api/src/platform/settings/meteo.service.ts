import { loadEnv } from '../config/env.js';
import { getOrCreateSettingsForUser } from '../../modules/settings/model.js';
import { DEFAULT_STATION_ID, isValidStationId } from '../../domain/arso-station.js';

// Izbrana ARSO postaja iz OSEBNIH nastavitev (drug modul).
//
// Zakaj v platform/ in ne v modules/meteo/: uvoz med moduli prepoveduje člen I (uveljavlja ga
// pravilo `cleverdash/module-boundary` v eslint.config.js). Enako sta urejena
// `platform/settings/commute.service.ts` in `platform/sources/resolution.service.ts`.
//
// Tri ravni, v tem vrstnem redu: osebna nastavitev → `ARSO_DEFAULT_STATION` iz okolja →
// konstanta v kodi. Sredinska raven obstaja zato, da namestitev za družino na Vrhniki lahko
// vsem novim uporabnikom postavi domačo postajo, ne da bi kdo popravljal kodo; najnižja pa
// zato, da modul deluje takoj po `docker compose up` z izpolnjenim samo `.env` (vrata 4).

export interface ResolvedMeteoStation {
  /** Oznaka postaje za naslov (glej domain/arso-station.ts). */
  id: string;
  /** Ali je postajo izbral UPORABNIK sam. `false` pomeni privzetek — vmesnik to pove, da
   * človek ve, da gleda Ljubljano, ker svoje postaje še ni izbral, in ne po pomoti. */
  chosen: boolean;
}

/**
 * `userId` je `null` za klicatelja z API ključem (avtomatizacija) — ta osebnih nastavitev
 * nima, zato dobi privzetek namestitve (isti dogovor kot `resolveTabs` in
 * `resolveWeatherSource`).
 */
export async function resolveMeteoStation(userId: string | null): Promise<ResolvedMeteoStation> {
  const fallback = installationDefault();
  if (!userId) return { id: fallback, chosen: false };

  const settings = await getOrCreateSettingsForUser(userId);
  const stored = settings.meteo?.station;
  // Shranjena vrednost se preveri ob BRANJU in ne samo ob shranjevanju: dokument v bazi je
  // lahko starejši od pravil (enako kot pri naslovih vtičnikov, glej plugins.router.ts).
  if (typeof stored === 'string' && isValidStationId(stored)) {
    return { id: stored, chosen: true };
  }
  return { id: fallback, chosen: false };
}

function installationDefault(): string {
  const configured = loadEnv().ARSO_DEFAULT_STATION;
  return isValidStationId(configured) ? configured : DEFAULT_STATION_ID;
}

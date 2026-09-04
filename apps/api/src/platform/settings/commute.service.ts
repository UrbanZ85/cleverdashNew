import { getOrCreateSettingsForUser } from '../../modules/settings/model.js';
import { isPlaceUsable, type CommutePlace } from '../../domain/commute-route.js';

// Kraja ploščice "Pot" iz OSEBNIH nastavitev (drug modul).
//
// Zakaj v platform/ in ne v modules/dashboard/: uvoz med moduli prepoveduje člen I
// (uveljavlja ga pravilo `cleverdash/module-boundary` v eslint.config.js). Enako sta urejena
// `platform/sources/resolution.service.ts` in `platform/settings/consent.service.ts`.

export interface ResolvedCommute {
  home: CommutePlace;
  work: CommutePlace;
  /** Ali sta OBA kraja dovolj določena, da se pot sploh da izračunati. */
  configured: boolean;
}

const DEFAULTS: ResolvedCommute = {
  home: { label: 'Doma', address: null, latitude: null, longitude: null },
  work: { label: 'Služba', address: null, latitude: null, longitude: null },
  configured: false,
};

/**
 * `userId` je `null` za klicatelja z API ključem — ta osebnih nastavitev nima, zato tudi
 * krajev ne (isti dogovor kot `resolveTabs` in `resolveWeatherSource`). Pot je oseben
 * podatek in sistemskega privzetka v `.env` namenoma NIMA: naslov doma ne sodi v
 * konfiguracijo namestitve.
 */
export async function resolveCommutePlaces(userId: string | null): Promise<ResolvedCommute> {
  if (!userId) return DEFAULTS;

  const settings = await getOrCreateSettingsForUser(userId);
  const home: CommutePlace = {
    label: settings.commute?.home?.label ?? DEFAULTS.home.label,
    address: settings.commute?.home?.address ?? null,
    latitude: settings.commute?.home?.latitude ?? null,
    longitude: settings.commute?.home?.longitude ?? null,
  };
  const work: CommutePlace = {
    label: settings.commute?.work?.label ?? DEFAULTS.work.label,
    address: settings.commute?.work?.address ?? null,
    latitude: settings.commute?.work?.latitude ?? null,
    longitude: settings.commute?.work?.longitude ?? null,
  };

  return { home, work, configured: isPlaceUsable(home) && isPlaceUsable(work) };
}

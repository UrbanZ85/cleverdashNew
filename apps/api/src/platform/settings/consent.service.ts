import { loadEnv } from '../config/env.js';
import { getOrCreateSettingsForUser } from '../../modules/settings/model.js';

// Osebne privolitve, ki jih potrebuje modul, a živijo v NASTAVITVAH (drug modul).
//
// Zakaj v platform/ in ne v modules/notes/: uvoz med moduli prepoveduje člen I (uveljavlja ga
// pravilo `cleverdash/module-boundary` v eslint.config.js). Skupna infrastruktura je prava
// pot — enako sta urejena `platform/sources/resolution.service.ts` (bere `Settings.sources`)
// in `platform/tabs/resolver.ts` (bere `Settings.tabs`).
//
// Sama ODLOČITEV, ali je dejanje dovoljeno, tu ni: to je čista funkcija v modulu, ki dejanje
// izvede (modules/notes/domain/transcription-gate.ts). Tukaj se stanje samo PREBERE.

export interface ServerTranscriptionConsent {
  /** Ali je zunanja storitev za prepis nastavljena v okolju te namestitve. */
  configured: boolean;
  /** Ali je uporabnik pošiljanje posnetkov ven izrecno dovolil v svojih nastavitvah. */
  enabled: boolean;
}

/**
 * Prebere oba pogoja za prepis govora na strežniku.
 *
 * Ločena sta namenoma in nikoli združena v eno zastavico: ključ v okolju je dovoljenje
 * NAMESTITVE, stikalo v nastavitvah pa privolitev OSEBE, katere glas je na posnetku. Prisoten
 * ključ zato sam po sebi ne dovoli ničesar.
 *
 * `userId` je `null` za klicatelja z API ključem (avtomatizacija) — ta osebnih nastavitev
 * nima, zato tudi privolitve ne more imeti in `enabled` je `false` (isti dogovor kot
 * `resolveTabs` in `resolveWeatherSource`).
 */
export async function readServerTranscriptionConsent(userId: string | null): Promise<ServerTranscriptionConsent> {
  const env = loadEnv();
  const configured = Boolean(env.NOTES_TRANSCRIPTION_URL && env.NOTES_TRANSCRIPTION_API_KEY);
  if (!userId) return { configured, enabled: false };

  const settings = await getOrCreateSettingsForUser(userId);
  return { configured, enabled: settings.notes?.serverTranscription === true };
}

import { badRequest } from '../../../platform/errors/problem.js';

export interface TabOverride {
  enabled?: boolean;
  order?: number;
}

/**
 * Zavihki, ki jih uporabnik NE sme izklopiti.
 *
 * Samo `settings`, in razlog je konkreten: `PUT /settings { tabs: { settings: { enabled:
 * false } } }` uporabnika zaklene iz aplikacije. `resolveTabs` Nastavitve izpusti iz
 * menija, `tabGuard` (apps/web/src/app/core/tabs/tab-guard.ts) pot zavrne in preusmeri na
 * dashboard — vklopiti nazaj pa jih ni mogoče nikjer v vmesniku, ker je vmesnik za to prav
 * na tem zavihku.
 *
 * `dashboard` NI na seznamu, čeprav bi ga človek pričakoval: `tabGuard` zanj naredi
 * izrecno izjemo ("dashboard je začetni zaslon NAD zavihki") in ga vedno spusti skozi,
 * poleg tega tja kažeta preusmeritvi za '' in '**'. Izklop ga torej samo skrije iz menija,
 * ne odreže — in to je legitimna izbira uporabnika, ki ima na dashboardu vse ploščice
 * skrite. Obstoječi pogodbeni test (tests/contract/settings.spec.ts) se nanjo zanaša.
 *
 * Uveljavljeno je na STREŽNIKU, ne samo v vmesniku — omejitev, ki jo je mogoče obiti z eno
 * zahtevo, ni omejitev.
 */
export const UNDISABLEABLE_TAB_IDS: ReadonlySet<string> = new Set(['settings']);

/**
 * Zlije prekritja zavihkov PO ZAVIHKIH (delno prekritje ne sme pobrisati shranjenega
 * `order`) in zavrne poskus izklopa zavihka, brez katerega aplikacija ni uporabna.
 */
export function validateTabOverrides(
  current: Record<string, TabOverride>,
  patch: Record<string, TabOverride>,
): Record<string, TabOverride> {
  const merged: Record<string, TabOverride> = { ...current };

  for (const [tabId, override] of Object.entries(patch)) {
    if (override.enabled === false && UNDISABLEABLE_TAB_IDS.has(tabId)) {
      throw badRequest(
        `Zavihka "${tabId}" ni mogoče izklopiti — brez njega aplikacije ne bi bilo mogoče več upravljati.`,
      );
    }
    merged[tabId] = { ...merged[tabId], ...override };
  }

  return merged;
}

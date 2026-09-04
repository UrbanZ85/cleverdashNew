import { TAB_REGISTRY, type TabDefinition } from './registry.js';
import { collectTabDetails, type TabDetail } from './extension.js';
import { UNDISABLEABLE_TAB_IDS } from '../../modules/settings/services/tab-overrides.service.js';
import { getOrCreateSettingsForUser, type TabOverride } from '../../modules/settings/model.js';

export type ResolvedTab = Omit<TabDefinition, 'enabled'> & { detail?: TabDetail };

/** Razreši register s prekritji `enabled`/`order` iz OSEBNIH nastavitev tega uporabnika
 * (004: `Settings` ni več singleton, glej data-model.md), filtrira po obsegih in vrne samo
 * vklopljene zavihke, urejene po `order` (FR-002, FR-003, FR-010). Prekritje za neobstoječ
 * `id` se ignorira — zanka gre samo prek `TAB_REGISTRY`, nikoli prek ključev shranjenih
 * prekritij, zato tuj `id` v `settings.tabs` preprosto nima učinka. */
export async function resolveTabs(callerScopes: string[], userId: string | null): Promise<ResolvedTab[]> {
  // API ključi (avtomatizacija) nimajo osebnih nastavitev — samo prijavljen uporabnik ima
  // prekritja `enabled`/`order` (FR-010); brez userId se uporabijo privzetki iz registra.
  const settings = userId ? await getOrCreateSettingsForUser(userId) : null;
  const overrides = (settings?.tabs ?? {}) as Record<string, TabOverride>;

  // 005: modul lahko svojemu zavihku pripne podnaslov in stanje vira (glej extension.ts).
  // Zbere se enkrat, ne na zavihek, in nikoli ne vrže — meni je pomembnejši od okrasa.
  const details = await collectTabDetails(userId);

  return TAB_REGISTRY.map((tab) => {
    const override = overrides[tab.id];
    return {
      ...tab,
      enabled: override?.enabled ?? tab.enabled,
      order: override?.order ?? tab.order,
    };
  })
    .filter((tab) => tab.enabled)
    .filter((tab) => !tab.requiredScopes || tab.requiredScopes.every((s) => callerScopes.includes(s)))
    .sort((a, b) => a.order - b.order)
    .map(({ enabled: _enabled, ...rest }) => {
      const detail = details.get(rest.id);
      return detail ? { ...rest, detail } : rest;
    });
}

/** Vsi zavihki iz registra, tudi izklopljeni — vključno z `enabled` in razrešenim `order`.
 *
 * `resolveTabs` izklopljene NAMENOMA izpusti (meni jih ne sme pokazati), zaradi česar
 * zaslon za urejanje menija iz njega ne more sestaviti seznama: zavihka, ki si ga izklopil,
 * ne bi bilo več mogoče najti in vklopiti nazaj. Ta funkcija je zato ločena, ne zastavica
 * na prvi — dve različni vprašanji sta.
 *
 * Dodatkov modulov (`detail`) tu ni: gre za seznam za urejanje, ne za meni. */
export async function listAllTabsForUser(
  callerScopes: string[],
  userId: string | null,
): Promise<Array<Omit<TabDefinition, 'enabled'> & { enabled: boolean; undisableable: boolean }>> {
  const settings = userId ? await getOrCreateSettingsForUser(userId) : null;
  const overrides = (settings?.tabs ?? {}) as Record<string, TabOverride>;

  return TAB_REGISTRY.map((tab) => {
    const override = overrides[tab.id];
    return {
      ...tab,
      enabled: override?.enabled ?? tab.enabled,
      order: override?.order ?? tab.order,
      undisableable: UNDISABLEABLE_TAB_IDS.has(tab.id),
    };
  })
    .filter((tab) => !tab.requiredScopes || tab.requiredScopes.every((s) => callerScopes.includes(s)))
    .sort((a, b) => a.order - b.order);
}

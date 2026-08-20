import { TAB_REGISTRY, type TabDefinition } from './registry.js';
import { getOrCreateSettings, type TabOverride } from '../../modules/settings/model.js';

export type ResolvedTab = Omit<TabDefinition, 'enabled'>;

/** Razreši register s prekritji `enabled`/`order` iz nastavitev, filtrira po obsegih in
 * vrne samo vklopljene zavihke, urejene po `order` (FR-002, FR-003). Prekritje za
 * neobstoječ `id` se ignorira — zanka gre samo prek `TAB_REGISTRY`, nikoli prek ključev
 * shranjenih prekritij, zato tuj `id` v `settings.tabs` preprosto nima učinka. */
export async function resolveTabs(callerScopes: string[]): Promise<ResolvedTab[]> {
  const settings = await getOrCreateSettings();
  const overrides = (settings.tabs ?? {}) as Record<string, TabOverride>;

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
    .map(({ enabled: _enabled, ...rest }) => rest);
}

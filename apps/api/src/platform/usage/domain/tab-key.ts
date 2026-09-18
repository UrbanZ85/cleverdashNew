import { TAB_REGISTRY } from '../../tabs/registry.js';

/**
 * Oznaka zavihka, ki jo je dovoljeno zabeležiti (FR-031).
 *
 * Zbirka, v katero lahko klicatelj vpiše poljuben ključ, ni telemetrija, ampak odprt predal:
 * neomejeno mnogo različnih vrednosti pomeni neomejeno mnogo vrstic na osebo na dan, in vsaka
 * lestvica zavihkov bi bila polna izmišljenih imen. Meja je zato register, ne dolžina niza.
 *
 * Register je SEZNAM VSEH zavihkov, ne razrešenih za tega uporabnika (`resolveTabs`): ogled
 * zavihka, ki si ga je uporabnik medtem izklopil ali za katerega nima obsega, se zabeleži — do
 * njega tako ali tako ne bi prišel, če bi bil zares zaprt, nas pa zanima uporaba, ne dovolilnica.
 */
export function isKnownTabId(tabId: string): boolean {
  return TAB_REGISTRY.some((tab) => tab.id === tabId);
}

/** Vse znane oznake — za polnjenje lestvic z ničlami in za sporočila ob zavrnitvi. */
export function knownTabIds(): string[] {
  return TAB_REGISTRY.map((tab) => tab.id);
}

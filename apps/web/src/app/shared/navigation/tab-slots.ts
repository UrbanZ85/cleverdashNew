// Koliko zavihkov gre v spodnjo vrstico na telefonu — in kateri.
//
// Logika je tu in ne v komponenti, ker je edino, o čemer se pri spodnji vrstici da zmotiti,
// in ker se tako preveri brez TestBed (isti dogovor kot todos/domain/task-order.ts).
//
// Zakaj sploh obstaja: register ima privzeto sedem vklopljenih zavihkov (api:
// platform/tabs/registry.ts), uporabnik pa jih lahko vklopi še več. `ion-tab-bar` razdeli
// širino na enake dele, zato je pri sedmih na 360 px zaslonu na gumb ~51 px — iz "Evidenca
// delovnega časa" ostanejo tri pike. Vrstica zato pokaže samo toliko zavihkov, kolikor jih
// je berljivih, zadnje mesto pa porabi za "Več", ki odpre meni z vsemi.

/** Zgornja meja gumbov v vrstici. Pet je meja, pri kateri je na 360 px na gumb še ~72 px. */
export const MAX_TAB_SLOTS = 5;

/** Najmanj, kar mora zavihek povedati o sebi, da ga je mogoče razporediti. */
export interface RoutedTab {
  route: string;
}

/**
 * Ali je pot `url` znotraj zavihka `route`.
 *
 * Podstran šteje za svoj zavihek: pri odprtem Urniku (`/time-tracking/schedule`) mora ostati
 * osvetljen zavihek Beleženje časa (`/time-tracking`), sicer je vrstica videti, kot da nismo
 * nikjer. Zato `startsWith` s poševnico — brez nje bi `/notes` ujel tudi `/notes-arhiv`.
 */
export function isTabActive(route: string, url: string): boolean {
  const path = (url.split('?')[0] ?? '').split('#')[0] ?? '';
  return path === route || path.startsWith(`${route}/`);
}

export interface TabSlots<T extends RoutedTab> {
  /** Zavihki, ki dobijo svoj gumb. */
  visible: T[];
  /** Ali je potreben gumb "Več" (torej: ali kak zavihek ni med vidnimi). */
  overflow: boolean;
}

/**
 * Razporedi zavihke po mestih v spodnji vrstici.
 *
 * Do `MAX_TAB_SLOTS` zavihkov gredo vsi v vrstico. Če jih je več, zadnje mesto pripade gumbu
 * "Več" in vidnih je `MAX_TAB_SLOTS - 1` po vrstnem redu registra — z eno izjemo: zavihek, na
 * katerem uporabnik JE, je vedno med vidnimi. Brez te izjeme bi bila ob odprti Evidenci
 * (deveti po vrsti) vrstica videti, kot da ni izbrano nič, in vrnitev nanjo bi bila mogoča
 * samo skozi meni.
 */
export function tabSlots<T extends RoutedTab>(tabs: readonly T[], url: string): TabSlots<T> {
  if (tabs.length <= MAX_TAB_SLOTS) return { visible: [...tabs], overflow: false };

  const visible = tabs.slice(0, MAX_TAB_SLOTS - 1);
  const active = tabs.find((tab) => isTabActive(tab.route, url));
  // Dejaven zavihek zamenja ZADNJEGA vidnega, ne prvega: prvi je po vrstnem redu registra
  // najpomembnejši (nadzorna plošča) in ga ni vredno izriniti.
  if (active && !visible.includes(active)) visible[visible.length - 1] = active;

  return { visible, overflow: true };
}

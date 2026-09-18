/** Zavihek, ki mu pripada ta naslov — čista funkcija, testabilna brez brskalnika (člen IX). */
export interface RouteLike {
  id: string;
  route: string;
}

/**
 * Preslikava naslova v oznako zavihka.
 *
 * NAJDALJŠE UJEMANJE in ne prvo: `/time-tracking/schedule` mora pripasti zavihku
 * `time-tracking`, ne pa zavihku, katerega pot je `/` ali kaka krajša predpona. Podstrani
 * modula štejejo k svojemu zavihku — človek, ki je na Urniku, je v Beleženju časa.
 *
 * Neznana pot vrne `null` in se NE pošlje. Javne strani (`/d/`, `/u/`, `/r/`) niso zavihki in
 * njihovih obiskov ta telemetrija ne meri — obiskovalec tam nima računa, ki bi mu jih pripisali.
 */
export function tabIdForUrl(url: string, tabs: readonly RouteLike[]): string | null {
  // Poizvedba in sidro nista del poti. `/notes?q=tajno` ne sme vplivati na to, kaj se zabeleži —
  // in ničesar od tega tudi ne zapustimo, ker se shrani samo oznaka zavihka.
  const path = url.split(/[?#]/)[0] ?? '';
  const normalized = path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;

  let best: RouteLike | null = null;
  for (const tab of tabs) {
    if (normalized === tab.route || normalized.startsWith(`${tab.route}/`)) {
      if (!best || tab.route.length > best.route.length) best = tab;
    }
  }
  return best?.id ?? null;
}

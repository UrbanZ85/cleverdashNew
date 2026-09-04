// Člen IX (razširjen duh): čista funkcija, brez baze in brez omrežja. FR-004, FR-014,
// research.md §8, Story 6.
//
// "Znotraj ročnega vrstnega reda velja časovna oznaka" (FR-014) — kamere z ujemajočo
// časovno oznako pridejo pred neujemajoče, `always` pa OSTANE na svojem mestu (indeksu), ne
// glede na to, kaj se premika okoli nje. Zato ta funkcija najprej zapomni indekse `always`
// kamer, jih pusti na miru, in preostale proste indekse zapolni z razvrščenimi
// dopoldan/popoldan kamerami (ujemajoče najprej, znotraj vsake skupine stabilno po
// vhodnem vrstnem redu).

export interface TimeOfDayCamera {
  timeOfDay: 'morning' | 'afternoon' | 'always';
}

/** Poldne je meja — `localHour < 12` pomeni dopoldan. Klicatelj poda `localHour` v
 * `Europe/Ljubljana` (domain/timezone.ts), ta funkcija sama ne pozna časovne cone. */
export function sortCamerasByTimeOfDay<T extends TimeOfDayCamera>(
  cameras: readonly T[],
  localHour: number,
): T[] {
  const matchingPeriod: 'morning' | 'afternoon' = localHour < 12 ? 'morning' : 'afternoon';

  const result: T[] = new Array(cameras.length);
  const alwaysIndexes = new Set<number>();
  const others: T[] = [];

  cameras.forEach((camera, index) => {
    if (camera.timeOfDay === 'always') {
      result[index] = camera;
      alwaysIndexes.add(index);
    } else {
      others.push(camera);
    }
  });

  const matching = others.filter((c) => c.timeOfDay === matchingPeriod);
  const nonMatching = others.filter((c) => c.timeOfDay !== matchingPeriod);
  const orderedOthers = [...matching, ...nonMatching];

  let cursor = 0;
  for (let i = 0; i < cameras.length; i++) {
    if (alwaysIndexes.has(i)) continue;
    // Netočno: `cursor` teče do `orderedOthers.length - 1`, ker je bilo natanko toliko
    // ne-"always" kamer prešteto zgoraj — indeks je torej vedno v mejah.
    result[i] = orderedOthers[cursor] as T;
    cursor += 1;
  }

  return result;
}

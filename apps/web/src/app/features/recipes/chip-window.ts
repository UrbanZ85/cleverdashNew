// Čista funkcija, testirana brez brskalnika (člen IX). Stran jo samo kliče.
//
// Vrstici filtrov (kategorije, oznake) sta se na telefonu prelomili v štiri ali pet vrstic in
// potisnili prvi recept pod rob zaslona — pol zaslona je bilo porabljenega, preden si videl en
// sam recept. Namesto preloma se pokaže prvih nekaj, ostalo pa se skriva za števcem "+N", ki jih
// na tap razpre.

/** Koliko čipov ostane vidnih, preden se ostali skrijejo za "+N". Pet je toliko, kolikor jih na
 * telefonu gre v eno vrstico skupaj s čipom "Vse". */
export const CHIP_LIMIT = 5;

export interface ChipWindow<T> {
  shown: T[];
  /** Koliko jih je skritih; `0` pomeni, da števca ni treba izrisati. */
  hidden: number;
}

/**
 * Izbere čipe, ki se pokažejo.
 *
 * Tri pravila, vsako iz svojega razloga:
 *
 *  1. Kadar je vrstica RAZPRTA ali zaslon ni ozek, se pokažejo vsi. Skrivanje na širokem zaslonu
 *     bi reševalo težavo, ki je tam ni.
 *  2. Sicer se pokaže prvih `limit`.
 *  3. IZBRANI čip se pokaže VEDNO, tudi kadar je zunaj prvih `limit`. To ni okrasek: filter po
 *     deveti oznaki bi se sicer ob prvem izrisu skril, uporabnik pa bi gledal skrajšan seznam
 *     receptov brez vidnega razloga in filtra ne bi imel kje izklopiti. Vrine se na konec vidnih,
 *     da se vrstni red ostalih ne premeša.
 */
export function chipWindow<T>(
  all: readonly T[],
  options: {
    keyOf: (item: T) => string;
    active: string | null;
    expanded: boolean;
    narrow: boolean;
    limit?: number;
  },
): ChipWindow<T> {
  const limit = options.limit ?? CHIP_LIMIT;

  if (!options.narrow || options.expanded || all.length <= limit) {
    return { shown: [...all], hidden: 0 };
  }

  const shown = all.slice(0, limit);
  const rest = all.slice(limit);

  const activeInRest =
    options.active === null ? undefined : rest.find((item) => options.keyOf(item) === options.active);

  if (activeInRest !== undefined) {
    shown.push(activeInRest);
    return { shown, hidden: rest.length - 1 };
  }

  return { shown, hidden: rest.length };
}

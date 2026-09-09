// Čista domenska plast modula (člen IX): brez baze, brez omrežja, brez express.
//
// research.md §6: iskanje mora najti "Beleženje časa" z vnosom `cas`. Mongov besedilni indeks
// (`$text`) tega ne zna — ne pozna iskanja po delu besede in slovenščine ne podpira — zato se
// ob vsakem pisanju izračuna polje `searchText`, nad katerim teče nesidran regularni izraz.
//
// Zlaganje je preslikava BREZ tabele: `normalize('NFD')` razstavi `č` na `c` + kljukico, in
// kljukico odstranimo z eno zamenjavo. Tako pridejo `č→c`, `š→s`, `ž→z` in vse ostalo, kar
// Unicode pozna, ne le trije slovenski znaki.
//
// ISTO pravilo je še enkrat v `apps/web/src/app/core/search/fold-text.ts`. Podvojitev je
// zavestna (plan.md, Complexity Tracking): `apps/api` in `apps/web` sta ločena paketa in uvoz
// med njima ni mogoč; funkcija je pet vrstic in ima na obeh straneh isti nabor testov.

/** Male črke brez diakritike — oblika, v kateri se primerja vse, kar uporabnik vtipka. */
export function foldForSearch(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Izpeljano polje `searchText` (data-model.md). Zajame ime, NASLOV in komentar hkrati —
 * FR-030 zahteva vse tri, ker `arso` mora najti zapis, kjer je niz samo v naslovu. */
export function buildSearchText(parts: {
  title: string;
  url: string;
  comment?: string | null;
}): string {
  return foldForSearch([parts.title, parts.url, parts.comment ?? ''].join(' ')).trim();
}

/** Uporabnikov niz gre v `$regex`, zato mora biti ubežen: brez tega bi vnos `c++` ali `(`
 * vrgel napako regularnega izraza, `.` in `.*` pa bi tiho vrnila vse. Prepisano dobesedno iz
 * `modules/notes/domain/note-input.ts` (research.md §15). */
export function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

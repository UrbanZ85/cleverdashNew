// Čista domenska plast modula (člen IX): brez baze, brez omrežja, brez express.
//
// research.md §10: iskanje mora najti "buča" z vnosom `buca`. Mongov besedilni indeks (`$text`)
// tega ne zna — ne pozna iskanja po delu besede in slovenščine ne podpira — zato se ob vsakem
// pisanju izračuna polje `searchText`, nad katerim teče nesidran regularni izraz.
//
// Zlaganje je preslikava BREZ tabele: `normalize('NFD')` razstavi `č` na `c` + kljukico, in
// kljukico odstranimo z eno zamenjavo. Tako pridejo `č→c`, `š→s`, `ž→z` in vse ostalo, kar
// Unicode pozna, ne le trije slovenski znaki.
//
// ISTO pravilo je še na dveh mestih: `modules/saved-links/domain/search-text.ts` (drug modul,
// člen I prepoveduje uvoz) in `apps/web/src/app/core/search/fold-text.ts` (drug paket, uvoz ni
// mogoč). Podvojitev je zavestna: funkcija je pet vrstic in ima povsod isti nabor testov.

/** Male črke brez diakritike — oblika, v kateri se primerja vse, kar uporabnik vtipka. */
export function foldForSearch(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/**
 * Izpeljano polje `searchText` (data-model.md).
 *
 * Zajame ime, opis, SESTAVINE in oznake hkrati (FR-050). Sestavine so tu bistvene in ne
 * dodatek: "kaj naredim iz buče" je poizvedba po sestavini, ne po imenu — recept se najpogosteje
 * išče po tem, kar je v hladilniku.
 *
 * KORAKOV tu NI. Vključeni bi bili največji del polja in bi vanj prinesli besede kot "segrej",
 * "premešaj" in "peci", ki so v skoraj vsakem receptu — iskanje bi po njih vrnilo vse. Korak je
 * navodilo, ne lastnost jedi.
 */
export function buildSearchText(parts: {
  title: string;
  description?: string | null;
  ingredients?: readonly string[];
  tags?: readonly string[];
  categories?: readonly string[];
}): string {
  return foldForSearch(
    [
      parts.title,
      parts.description ?? '',
      (parts.ingredients ?? []).join(' '),
      (parts.tags ?? []).join(' '),
      // Kategorije so tu, čeprav imajo SVOJ filter (FR-082): človek, ki v iskalnik vpiše "juhe",
      // pričakuje juhe — ne praznega seznama z nasvetom, naj namesto tega uporabi čip.
      (parts.categories ?? []).join(' '),
    ].join(' '),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

/** Uporabnikov niz gre v `$regex`, zato mora biti ubežen: brez tega bi vnos `c++` ali `(` vrgel
 * napako regularnega izraza, `.` in `.*` pa bi tiho vrnila vse. */
export function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Oznaka, kakor se HRANI za primerjavo (zložena), medtem ko se prikazuje, kot jo je vpisal
 * uporabnik (FR-006).
 *
 * Presledki gredo v vezaj, ločila proč: `Sladice` in `sladice` sta ista oznaka, `hitra kosila`
 * in `Hitra-Kosila` prav tako. Brez tega bi se seznam oznak razpršil v različice istega.
 */
export function foldTag(input: string): string {
  return foldForSearch(input)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ISTO pravilo zlaganja kot `apps/api/src/modules/saved-links/domain/search-text.ts`.
//
// Podvojitev je ZAVESTNA in zapisana v plan.md (Complexity Tracking): `apps/api` in `apps/web`
// sta ločena paketa in uvoz med njima ni mogoč. Skupen paket v `packages/` samo za pet vrstic
// bi bil več infrastrukture kot koristi. Oba izvoda imata isti nabor enotskih testov
// (`apps/web/tests/unit/fold-text.spec.ts` in `apps/api/tests/unit/search-text.spec.ts`) —
// če se pravili razideta, se iskanje na zaslonu in iskanje prek HTTP ne ujemata več.
//
// Datoteka je v `core/search/` in ne v `core/saved-links/`, ker zlaganje besedila ni pojem
// shranjenih linkov: prvi naslednji zavihek, ki bo iskal po slovenskem besedilu, ga bo
// potreboval enako (beležke danes iščejo brez zlaganja in so kandidat za prevzem —
// research.md §15).

/**
 * Male črke brez diakritike — oblika, v kateri se primerja vse, kar uporabnik vtipka.
 *
 * `normalize('NFD')` razstavi `č` na `c` + kljukico, ki jo nato odstranimo. Tabele preslikav
 * ni in ne sme biti: `č→c`, `š→s`, `ž→z` in vse ostalo pride iz Unicode normalizacije same.
 */
export function foldForSearch(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Ali zapis ustreza poizvedbi. Ujemanje gre po vseh treh podatkih hkrati (FR-030) in je
 * DOBESEDNO — uporabnikov vnos ni regularni izraz, zato `.` pomeni piko. */
export function matchesQuery(
  fields: { title: string; url: string; comment?: string | null },
  query: string,
): boolean {
  const folded = foldForSearch(query.trim());
  if (folded.length === 0) return true;
  return foldForSearch(`${fields.title} ${fields.url} ${fields.comment ?? ''}`).includes(folded);
}

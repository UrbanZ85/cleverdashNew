// Čista logika razporeditve ploščic — brez uvozov iz @angular/*, zato tudi ločeno od
// `tile-registry.ts`, ki uvaža komponente (isti razlog kot pri core/settings/settings.model.ts:
// logika, ki se lahko zmoti, mora biti preverljiva brez ogrodja).

/**
 * Vrsta vnosa razporeditve, ki NI vgrajena ploščica, a je veljavna: uporabniško definirana
 * ploščica (vtičnik, 005). Vtičnikov je poljubno mnogo in so osebni, zato niso v seznamu
 * vgrajenih vrst — njihovi vnosi pa morajo v razporeditvi obstati.
 *
 * Živi tukaj in ne v `tile-registry.ts`, ker ga potrebuje ta čista logika; register ga od tu
 * izvozi naprej kot `PLUGIN_TILE_TYPE`, da je vrednost na enem mestu.
 */
export const PLUGIN_LAYOUT_TYPE = 'plugin';

export interface TileLayoutEntry {
  type: string;
  position: number;
  visible: boolean;
  config?: Record<string, unknown>;
}

/**
 * Shranjena razporeditev, dopolnjena z vrstami, ki jih še ne vsebuje — te se pripnejo na
 * konec in so vidne. FR-020: nova VGRAJENA vrsta ploščice se pojavi brez izgube stanja.
 *
 * Prazna razporeditev (prvi zagon) pomeni "vse vgrajene vrste po vrstnem redu registra".
 *
 * Skrite ploščice se s tem NE prižgejo: skrita ploščica v razporeditvi obstaja
 * (`visible: false`) in zato ni manjkajoča. Vnosov vtičnikov to ne zadeva — njihove vrste
 * (`plugin`) klicatelj v `builtInTypes` ne poda, ker jih v razporeditev doda zaslon, ki
 * vtičnik ustvari.
 */
export function mergeMissingTypes(
  layout: readonly TileLayoutEntry[],
  builtInTypes: readonly string[],
  extraTypes: readonly string[] = [PLUGIN_LAYOUT_TYPE],
): TileLayoutEntry[] {
  // Vrste, ki jih aplikacija še pozna. Privzetek vključuje vtičnike, ker jih klicatelj v
  // `builtInTypes` namenoma ne poda — brez tega bi vsak klic brez tretjega argumenta zavrgel
  // vse vtičnike z nadzorne plošče.
  const allowed = new Set([...builtInTypes, ...extraTypes]);

  // Vnos ODSTRANJENE vrste se zavrže. Do 011 se je tak vnos ohranil, ker je bil pogoj samo
  // "dopolni manjkajoče": po odstranitvi ploščice "Vreme" bi na nadzorni plošči ostala
  // prazna vrzel (dashboard.page vrste brez komponente tiho preskoči), v nastavitvah pa
  // vnos z imenom "weather" — angleški identifikator v slovenskem vmesniku (člen X), ki ga
  // ni mogoče niti izrisati niti pojasniti. Ob prvem shranjevanju razporeditve vnos izgine
  // tudi iz baze.
  const kept = layout.filter((entry) => allowed.has(entry.type));

  const base =
    kept.length > 0 ? [...kept] : builtInTypes.map((type, i) => ({ type, position: i, visible: true }));

  const known = new Set(base.map((t) => t.type));

  // Nov položaj izhaja iz NAJVEČJEGA obstoječega, ne iz dolžine polja.
  //
  // Prava napaka: shranjena razporeditev ima lahko vrzel v položajih — izbris vtičnika je
  // ne zapolni (plugins.router.ts tega namenoma ne počne). Pri [{weather,0},{radar,2}] je
  // dolžina polja 2, kar bi novi ploščici dodelilo položaj 2 — istega, kot ga ima radar.
  // Tak seznam se izriše brez težav, ob shranjevanju pa ga strežnik zavrne s 400
  // ("Podvojen position"), ker je enoličnost položaja njegov pogoj.
  //
  // Napaka je obstajala od 001, pokazala pa se je šele pri 010: to je prva ploščica, katere
  // nastavitev se ZAPIŠE nazaj v razporeditev, in prvi zapis je padel s 400.
  const highest = base.reduce((max, t) => (t.position > max ? t.position : max), -1);

  const missing = builtInTypes
    .filter((type) => !known.has(type))
    .map((type, i) => ({ type, position: highest + 1 + i, visible: true }));

  return [...base, ...missing].sort((a, b) => a.position - b.position);
}

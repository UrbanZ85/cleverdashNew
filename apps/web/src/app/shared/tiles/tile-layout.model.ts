// Čista logika razporeditve ploščic — brez uvozov iz @angular/*, zato tudi ločeno od
// `tile-registry.ts`, ki uvaža komponente (isti razlog kot pri core/settings/settings.model.ts:
// logika, ki se lahko zmoti, mora biti preverljiva brez ogrodja).

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
): TileLayoutEntry[] {
  const base =
    layout.length > 0
      ? [...layout]
      : builtInTypes.map((type, i) => ({ type, position: i, visible: true }));

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

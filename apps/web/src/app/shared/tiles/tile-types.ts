// Imena VGRAJENIH vrst ploščic, po privzetem vrstnem redu.
//
// Ločeno od `tile-registry.ts` iz enega samega, konkretnega razloga: `tile-registry.ts` uvaža
// komponente ploščic, zato ga ploščica sama ne more uvoziti nazaj — nastane krožni uvoz, ki
// ob neugodnem vrstnem redu nalaganja modulov pade z `ReferenceError` (register bi bral
// razred komponente, ki je še v časovni mrtvi coni). Ta datoteka ne uvaža ničesar, zato jo
// sme uvoziti kdorkoli, tudi ploščica.
//
// Vrstni red je pomenljiv: `mergeMissingTypes` po njem razporedi ploščice ob prvem zagonu in
// vanj pripne vrste, ki jih shranjena razporeditev še ne pozna (FR-020).
//
// 011: `weather` je iz seznama ODSTRANJEN (ploščica `meteo` pokaže isto in več, iz merilne
// postaje). Shranjene razporeditve starejših uporabnikov vnos `weather` še vsebujejo — ta se
// tiho preskoči, ker `getTileComponent('weather')` ne vrne ničesar (ista pot kot za neznano
// vrsto ploščice, FR-020), in izgine ob prvem shranjevanju razporeditve.
//
// Da se ta seznam in `TILE_REGISTRY` ne razideta, ju primerja enotski test
// `apps/web/tests/unit/tile-registry.spec.ts` — razhajanje bi pomenilo ploščico, ki se izriše,
// a je razporeditev ne pozna (ali obratno).
export const BUILT_IN_TILE_TYPES = [
  'forecast',
  'radar',
  'commute',
  'todos',
  'saved-links',
  'meteo',
] as const;

export type BuiltInTileType = (typeof BUILT_IN_TILE_TYPES)[number];

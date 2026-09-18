// Tabela merjenih virov — edino mesto, kjer analitika ve, kje v bazi so bajti.
//
// ZAKAJ IMENA ZBIRK IN NE MODELI (research.md §2):
//
// `import { RecipeImageModel } from '../../recipes/models/...'` je uvoz med moduloma in ga
// `cleverdash/module-boundary` v `eslint.config.js` zavrne kot napako (člen I). Tudi če ga ne bi,
// bi pomenil, da brisanje modula 013 podre analitiko — nasprotno od tega, kar zahteva SC-007.
//
// Cena je, da teh nizov prevajalnik ne varuje. Varovalo je zato test
// `apps/api/tests/unit/analytics-sources.spec.ts`, ki vsako ime preveri proti zbirkam zagnane
// aplikacije. Prepis brez varovala bi bil tiha napaka (člen VII); prepis z varovalom je isto, kar
// modul 013 počne z vzorcem deljenja iz modula 010.

/** Polje, v katerem ima zbirka lastnika. Dve različni imeni sta dejstvo obstoječih shem, ne izbira. */
export type OwnerField = 'userId' | 'ownerId';

export interface StorageSourceDef {
  id: string;
  /** Slovensko ime za prikaz (člen X). */
  label: string;
  collection: string;
  ownerField: OwnerField;
  /**
   * Izraz za seštevanje bajtov v `$group`. `null` pomeni, da se vir SAMO ŠTEJE — besedilni zapisi
   * so reda nekaj kilobajtov in bi bili v pregledu, katerega enota je gigabajt, natančen šum
   * (research.md §13). Njihovo število pa na vprašanje "koliko je tega" odgovarja.
   */
  sizeExpression: unknown | null;
  /** Dodatna omejitev, kadar ena zbirka nosi dva vira (prejete datoteke proti lastnim). */
  match?: Record<string, unknown>;
}

/**
 * Pomanjšava slike recepta nima svojega `byteSize` (model 013 ga ne hrani), a je prostor na
 * disku in FR-006 zahteva, da ni izpuščena.
 *
 * `$binarySize` prebere velikost polja na strežniku in bajtov ne prenese — `select: false` na
 * `thumb` zato za to pot ni ovira. Alternativa (novo polje `thumbByteSize` v tujem modelu) bi bila
 * poseg v modul 013 zaradi analitike, torej natanko tisto, kar člen I prepoveduje, in bi obenem
 * pustila vse obstoječe slike brez vrednosti (research.md §3).
 *
 * `$ifNull`, ker `thumb` je `null` pri vsaki sliki, ki je odjemalec ni pomanjšal — `$binarySize`
 * nad `null` vrne `null` in bi vsota postala `null` za cel vir.
 */
const RECIPE_IMAGE_BYTES = {
  $add: ['$byteSize', { $ifNull: [{ $binarySize: '$thumb' }, 0] }],
};

export const STORAGE_SOURCES: StorageSourceDef[] = [
  {
    id: 'recipe-images',
    label: 'Slike receptov',
    collection: 'recipeimages',
    ownerField: 'ownerId',
    sizeExpression: RECIPE_IMAGE_BYTES,
  },
  {
    id: 'note-audio',
    label: 'Posnetki beležk',
    collection: 'noteaudios',
    ownerField: 'userId',
    sizeExpression: '$byteSize',
  },
  {
    id: 'shared-files',
    label: 'Deljene datoteke',
    collection: 'sharedfiles',
    ownerField: 'userId',
    sizeExpression: '$byteSize',
    // 009b: datoteka, ki jo je oddal nekdo brez računa, je od trenutka oddaje navadna
    // uporabnikova datoteka — a je za pregled porabe drug podatek. "Kdo mi pošilja" in "kaj
    // delim" nista isto vprašanje, zato sta vira dva nad isto zbirko.
    match: { inboxId: null },
  },
  {
    id: 'shared-files-received',
    label: 'Prejete datoteke',
    collection: 'sharedfiles',
    ownerField: 'userId',
    sizeExpression: '$byteSize',
    match: { inboxId: { $ne: null } },
  },
  {
    id: 'recipes',
    label: 'Recepti',
    collection: 'recipes',
    ownerField: 'ownerId',
    sizeExpression: null,
  },
  {
    id: 'notes',
    label: 'Beležke',
    collection: 'notes',
    ownerField: 'userId',
    sizeExpression: null,
  },
];

/**
 * Zbirka uporabnikov. Tu kot NIZ in ne kot `UserModel`, iz istega razloga kot vse ostalo:
 * `modules/auth/models/user.model.ts` je tuj modul (člen I).
 *
 * `platform/users/directory.service.ts` sme `UserModel` uvoziti in ga tudi uvaža, a ponuja imenik
 * za IZBIRNIK — samo osebe, ki so se že vsaj enkrat prijavile (FR-070 modula 010). Pregled porabe
 * mora pokazati vsak račun, tudi tistega, ki se še ni prijavil, sicer bi bajti brez vrstice
 * izginili v "neznanega lastnika" in bi bilo videti kot napaka.
 */
export const USERS_COLLECTION = 'users';

/** Vsa imena zbirk, ki jih ta modul bere — brez ponovitev. Podlaga za varovalni test. */
export function referencedCollections(): string[] {
  return [...new Set([...STORAGE_SOURCES.map((s) => s.collection), USERS_COLLECTION])];
}

/**
 * Kateri viri so v TEJ namestitvi merljivi (FR-012).
 *
 * Vir, katerega zbirke ni, se ne izračuna — a iz odgovora NE IZGINE: ostane z `present: false` in
 * ničlami. Razlika med "ni vsebine" in "ni modula" je za administratorja pomembna in bi se ob
 * izpuščanju vrstice izgubila (člen VII).
 */
export function markPresence(
  sources: StorageSourceDef[],
  existingCollections: readonly string[],
): Array<StorageSourceDef & { present: boolean }> {
  const existing = new Set(existingCollections);
  return sources.map((source) => ({ ...source, present: existing.has(source.collection) }));
}

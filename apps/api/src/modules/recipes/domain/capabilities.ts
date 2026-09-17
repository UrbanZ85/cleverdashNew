// Čista domenska plast modula (člen IX): brez uvozov iz express, mongoose ali platform/errors,
// zato testabilna brez baze in brez strežnika. Usmerjevalnik jo samo kliče.
//
// Tu je CEL model pravic tega modula. Vsaka odločitev "kdo sme kaj" gre skozi `denyReason`;
// nikjer drugje v modulu ni pogoja oblike `if (role === 'edit')`. Razlog je preverljivost:
// matriko 3 vlog × 9 zmožnosti je mogoče v celoti pokriti s tabelnim testom, raztresenih
// pogojev pa ne.
//
// Vzorec je PREPISAN iz modules/todos/domain/capabilities.ts, ne uvožen (člen I, uveljavlja ga
// pravilo `cleverdash/module-boundary` v eslint.config.js). Imena so prevzeta poimensko, da je
// koda berljiva vštric z opravili.
//
// DVE razliki do 010, obe namerni (research.md §2):
//  1. Stopnji sta DVE (`view`, `edit`), ne tri. Vmesna stopnja `check` v opravilih obstaja, ker
//     je odkljukanje smiselno ločeno od urejanja besedila. Pri receptu take vmesne poteze ni —
//     "skuhano" je premalo, da bi zaslužilo svojo stopnjo, in je zato pravica urejanja (FR-034).
//  2. Zaklepa (`locked`) NI. Zaklep v opravilih rešuje seznam, po katerem več ljudi hkrati
//     kljuka; recept je zapis, ki ga eden napiše in drugi berejo. Dodati ga bo mogoče pozneje
//     brez spremembe modela, ker gre vsaka odločitev že zdaj skozi eno samo funkcijo.

export const MEMBER_ROLES = ['view', 'edit'] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

/** Vloga klicatelja na receptu. Lastništvo NI stopnja soudeleženca — je lastnost recepta. */
export type RecipeRole = 'owner' | MemberRole;

export const RECIPE_CAPABILITIES = [
  'readRecipe',
  'editRecipe',
  'manageImages',
  'markCooked',
  'rateRecipe',
  'deleteRecipe',
  'manageSharing',
  'managePublicLink',
  'leaveRecipe',
] as const;
export type RecipeCapability = (typeof RECIPE_CAPABILITIES)[number];

/**
 * Zakaj dejanje ni dovoljeno.
 *
 * Trenutno je razlog en sam (`role`), medtem ko jih ima isti vzorec v opravilih dva (`role` in
 * `locked`). Tip je vseeno unija in ne dobesedna vrednost: kadar bo zaklep dodan, mora biti to
 * razširitev tega tipa in ne sprememba podpisa vsake funkcije, ki ga vrača.
 */
export type DenyReason = 'role';

interface RecipeLike {
  ownerId: unknown;
  members: readonly { userId: unknown; role: MemberRole }[];
}

/**
 * Vloga uporabnika na že prebranem posnetku recepta, ali `null`, če je tujec.
 *
 * Lastništvo se preveri PRVO in neodvisno od `members`: če bi se v zapis kdaj prikradel vnos
 * lastnika med soudeleženci (pisanja tega ne dovolijo, FR-037), ga to ne sme znižati.
 */
export function roleFor(recipe: RecipeLike, userId: string): RecipeRole | null {
  if (String(recipe.ownerId) === userId) return 'owner';
  const member = recipe.members.find((m) => String(m.userId) === userId);
  return member ? member.role : null;
}

/**
 * Katere stopnje soudeleženca smejo zmožnost. Lastnika v tabeli NI — njegove pravice določa
 * `denyReason` posebej, ker niso podmnožica nobene stopnje (edine zmožnosti, ki je nima, je
 * odhod s svojega recepta).
 *
 * `rateRecipe` je prazen namenoma in ne po pomoti: ocena je LASTNIKOVA lastnost recepta
 * (FR-035, research.md §3). Ocena na članstvu bi odprla povprečja in s tem recenzijski sistem,
 * ki ga nihče ni naročil.
 */
const ROLES_ALLOWED: Record<RecipeCapability, readonly MemberRole[]> = {
  readRecipe: ['view', 'edit'],
  editRecipe: ['edit'],
  manageImages: ['edit'],
  markCooked: ['edit'],
  rateRecipe: [],
  deleteRecipe: [],
  manageSharing: [],
  managePublicLink: [],
  leaveRecipe: ['view', 'edit'],
};

/**
 * Razlog zavrnitve, ali `null`, kadar je dejanje dovoljeno.
 *
 * Lastnik sme vse razen zapustiti svoj recept: tega mu ne odvzame nobena nastavitev, ampak
 * lastništvo samo — lastnik recepta ne more zapustiti, lahko ga samo izbriše (FR-032).
 */
export function denyReason(role: RecipeRole, capability: RecipeCapability): DenyReason | null {
  if (role === 'owner') {
    return capability === 'leaveRecipe' ? 'role' : null;
  }
  return ROLES_ALLOWED[capability].includes(role) ? null : 'role';
}

/** Slovensko pojasnilo za uporabnika. Pove, kaj storiti ali koga vprašati — ne ponovi statusne
 * kode z drugimi besedami (člen VI). */
export function describeDeny(capability: RecipeCapability): string {
  switch (capability) {
    case 'readRecipe':
      return 'Do tega recepta nimaš dostopa.';
    case 'editRecipe':
      return 'Pri tem receptu imaš pravico samo za ogled. Za urejanje prosi lastnika.';
    case 'manageImages':
      return 'Slike lahko dodaja in briše samo, kdor ima pravico urejanja.';
    case 'markCooked':
      return 'Kot skuhano lahko označi samo, kdor ima pravico urejanja.';
    case 'rateRecipe':
      return 'Oceno recepta določa samo lastnik — deljena ocena bi bila nekaj drugega od te.';
    case 'deleteRecipe':
      return 'Recept lahko izbriše samo lastnik. Ti ga lahko zapustiš.';
    case 'manageSharing':
      return 'Kdo ima dostop do recepta, določa samo lastnik.';
    case 'managePublicLink':
      return 'Javno povezavo lahko izda ali prekliče samo lastnik.';
    case 'leaveRecipe':
      return 'Lastnik recepta ga ne more zapustiti — lahko ga samo izbriše.';
  }
}

/** Kaj ta klicatelj na tem receptu sme, v enem objektu za odgovor API-ja. Vmesnik iz tega izriše
 * kontrole in ničesar ne ugiba (člen XI, FR-064, SC-007). */
export function capabilitiesFor(role: RecipeRole): Record<RecipeCapability, boolean> {
  const out = {} as Record<RecipeCapability, boolean>;
  for (const capability of RECIPE_CAPABILITIES) {
    out[capability] = denyReason(role, capability) === null;
  }
  return out;
}

/**
 * Stopnje, ki jih sme filter zapisa sprejeti za dano zmožnost.
 *
 * Obstaja zato, da pogoj v poizvedbi in `denyReason` ne moreta razhajati: oba izhajata iz iste
 * tabele. Brez tega bi bila sprememba pravic sprememba na dveh mestih, druga pa bi se tiho
 * pozabila.
 */
export function rolesWith(capability: RecipeCapability): MemberRole[] {
  return [...ROLES_ALLOWED[capability]];
}

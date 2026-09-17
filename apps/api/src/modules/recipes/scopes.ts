// Obsegi so per-modulski (enak vzorec kot modules/todos/scopes.ts in modules/notes/scopes.ts),
// ne centralno registrirani v platform/auth/scopes.ts — ta vsebuje samo generični
// requireScopes() in ADMIN_SCOPE.
//
// Vsi trije nizi so PREPISANI (ne uvoženi) tudi v `platform/keycloak/role-mapping.ts`,
// `BASE_USER_SCOPES` — brez tega bi zavihek delal samo administratorju
// (docs/adding-a-tab.md, korak 5). Podvojitev je namerna: odstranitev tega modula pusti
// neuporabljen niz v role-mapping.ts namesto pokvarjenega uvoza (člen I, research.md §11).
//
// `share` je LOČEN obseg in ni del `write` (FR-061). Deljenje je edina operacija v tem modulu,
// ki zadene človeka, ki NI klicatelj — in edina, ki podatek odpre nekomu zunaj te namestitve,
// ker pod isti obseg sodi tudi izdaja javne povezave. Člen III postavlja API ključ za
// prvorazrednega odjemalca, kar pomeni, da mora biti obseg njegovega UČINKA nastavljiv: z enim
// samim obsegom za pisanje bi "n8n sme shraniti recept" nujno pomenilo tudi "n8n sme recept
// razobesiti na javno povezavo" (research.md §11).
export const RECIPE_SCOPES = {
  read: 'recipes:read',
  write: 'recipes:write',
  share: 'recipes:share',
} as const;

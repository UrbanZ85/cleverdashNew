// Obsegi so per-modulski (enak vzorec kot modules/notes/scopes.ts in modules/cameras/scopes.ts),
// ne centralno registrirani v platform/auth/scopes.ts — ta vsebuje samo generični
// requireScopes() in ADMIN_SCOPE.
//
// `share` je LOČEN obseg in ni del `write`. Deljenje je edina operacija v tem modulu, ki
// zadene človeka, ki NI klicatelj, in edina, ki tujemu uporabniku odpre dostop do zapisa.
// Člen III postavlja API ključ za prvorazrednega odjemalca, kar pomeni, da mora biti obseg
// njegovega UČINKA nastavljiv: z enim samim obsegom za pisanje bi "n8n lahko doda opravilo"
// nujno pomenilo tudi "n8n lahko seznam podari" (FR-091, research.md §11).
export const TODO_SCOPES = {
  read: 'todos:read',
  write: 'todos:write',
  share: 'todos:share',
} as const;

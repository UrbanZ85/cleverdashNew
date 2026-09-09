// Obsegi so per-modulski (enak vzorec kot modules/notes/scopes.ts in
// modules/cameras/scopes.ts), ne centralno registrirani v platform/auth/scopes.ts — ta
// vsebuje samo generični requireScopes() in ADMIN_SCOPE.
//
// Oba niza sta PREPISANA (ne uvožena) tudi v `platform/keycloak/role-mapping.ts`,
// `BASE_USER_SCOPES` — brez tega bi zavihek delal samo administratorju
// (docs/adding-a-tab.md, korak 5). Podvojitev je namerna: odstranitev tega modula pusti
// neuporabljen niz v role-mapping.ts namesto pokvarjenega uvoza (člen I, research.md §12).
export const SAVED_LINK_SCOPES = {
  read: 'saved-links:read',
  write: 'saved-links:write',
} as const;

// Obsegi so per-modulski (enak vzorec kot modules/notes/scopes.ts in modules/cameras/scopes.ts),
// ne centralno registrirani v platform/auth/scopes.ts — ta vsebuje samo generični
// requireScopes() in ADMIN_SCOPE.
//
// POZOR (research.md §19): javne poti `/share/*` obsegov NE zahtevajo in jih ne smejo — prejemnik
// nima računa, torej nima nobenega obsega. Ta objekt se v `public.router.ts` ne uvaža.
export const FILE_SHARE_SCOPES = {
  read: 'file-sharing:read',
  write: 'file-sharing:write',
} as const;

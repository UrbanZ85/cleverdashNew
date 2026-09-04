// Obsegi so per-modulski (enak vzorec kot modules/cameras/scopes.ts in
// modules/time-tracking/scopes.ts), ne centralno registrirani v platform/auth/scopes.ts —
// ta vsebuje samo generični requireScopes() in ADMIN_SCOPE.
export const NOTE_SCOPES = {
  read: 'notes:read',
  write: 'notes:write',
} as const;

// research.md §10: obsegi so per-modulski (enak vzorec kot modules/time-tracking/scopes.ts),
// ne centralno registrirani v platform/auth/scopes.ts — ta vsebuje samo generično
// requireScopes() in ADMIN_SCOPE.
export const CAMERA_SCOPES = {
  read: 'cameras:read',
  write: 'cameras:write',
} as const;

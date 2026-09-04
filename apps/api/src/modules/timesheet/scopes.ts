// Enak vzorec kot modules/time-tracking/scopes.ts: mehanizem obsegov je skupen
// (platform/auth/scopes.ts), imena so besedišče tega modula in živijo tu, da se v
// usmerjevalniku ne tipka istih nizov na roko. `platform/auth/scopes.ts` se ne spreminja.
export const TIMESHEET_SCOPES = {
  /** Izdelava evidence (.xlsx in predogled) — tudi za avtomatizacijo z `X-API-Key`. */
  generate: 'timesheet:generate',
  /** Branje shranjenih privzetkov. */
  read: 'timesheet:read',
  /** Spreminjanje shranjenih privzetkov. */
  write: 'timesheet:write',
} as const;

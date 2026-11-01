// Čiste funkcije vnosa ure `HH:MM` (brez Angularja, testirano v tests/unit/time-field.spec.ts).
//
// Zakaj: `<ion-input type="time">` na telefonu pogosto ne pokaže ne tipkovnice ne izbirnika ure, zato ure
// ni mogoče vnesti. Polje za uro je zato navadno besedilo s številsko tipkovnico, ki samo oblikuje vnos.

/** Samo števke, največ štiri (HHMM). */
export function timeDigits(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 4);
}

/** Prikaz med tipkanjem: `1730` → `17:30`, `17` → `17`, `173` → `17:3`. */
export function formatTimeInput(raw: string): string {
  const d = timeDigits(raw);
  return d.length > 2 ? `${d.slice(0, 2)}:${d.slice(2)}` : d;
}

const VALID = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Ali je niz popolna veljavna ura `HH:MM` (00:00–23:59). */
export function isValidTime(value: string): boolean {
  return VALID.test(value);
}

/**
 * Dopolni nepopoln vnos ob zapustitvi polja: `9` → `09:00`, `17` → `17:00`, `930` → `09:30`, `1730` → `17:30`.
 * Neveljavno (npr. `25`, `9:7`, `1260`) vrne prazen niz — nič se ne ugiba.
 */
export function completeTime(raw: string): string {
  const d = timeDigits(raw);
  let hhmm: string;
  if (d.length === 1) hhmm = `0${d}:00`;
  else if (d.length === 2) hhmm = `${d}:00`;
  else if (d.length === 3) hhmm = `0${d[0]}:${d.slice(1)}`;
  else if (d.length === 4) hhmm = `${d.slice(0, 2)}:${d.slice(2)}`;
  else return '';
  return isValidTime(hhmm) ? hhmm : '';
}

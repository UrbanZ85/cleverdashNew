// Obsegi tega modula (enak vzorec kot modules/notes/scopes.ts in modules/todos/scopes.ts).
//
// SAMO BRANJE in to ni pomanjkljivost: modul ničesar ne shrani. Postaja, ki jo uporabnik
// izbere, živi v NASTAVITVAH (skupna storitev, člen I), meritve pa so ARSO-jeve — ta modul
// jih samo prenese prek predpomnilnika in preračuna. Ko bi kdaj nastala lastna kolekcija
// (npr. shranjeni pragovi za opozorila), bo `meteo:write` dodan takrat, ne vnaprej.
export const METEO_SCOPES = {
  read: 'meteo:read',
} as const;

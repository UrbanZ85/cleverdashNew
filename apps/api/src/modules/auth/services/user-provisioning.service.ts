import { UserModel, type UserDoc } from '../models/user.model.js';

// FR-003, FR-009, research.md §11: prvi uspešen priklic tega za nov `keycloakSubject`
// ustvari uporabnikov profil (privzete osebne nastavitve pride pozneje, glej
// migration.service.ts in settings/model.ts `getOrCreateSettingsForUser`). Obstoječ subjekt
// se samo osveži — `keycloakSubject` je edini identifikator, po katerem iščemo, zato
// sprememba e-pošte/imena v Keycloaku NIKOLI ne ustvari podvojenega uporabnika.
//
// `scopes` se tu shrani samo kot "zadnje znano stanje" (uporabno npr. za migration.service.ts,
// da ve, ali je ta uporabnik trenutno admin) — avtoritativni vir za avtorizacijo posamezne
// zahteve je VEDNO živa introspekcija (access-token.service.ts), ne to polje.
export async function findOrCreateUser(params: {
  keycloakSubject: string;
  email: string;
  displayName: string;
  scopes: string[];
}): Promise<UserDoc & { _id: unknown }> {
  const user = await UserModel.findOneAndUpdate(
    { keycloakSubject: params.keycloakSubject },
    {
      $set: {
        email: params.email,
        displayName: params.displayName,
        scopes: params.scopes,
        lastLoginAt: new Date(),
      },
      $setOnInsert: { keycloakSubject: params.keycloakSubject },
    },
    { upsert: true, new: true },
  );
  return user;
}

import { Schema, model, type InferSchemaType } from 'mongoose';

// data-model.md "User" (004): Keycloak je zdaj vir identitete. `keycloakSubject` (Keycloakov
// stabilen `sub` claim) je PRIMARNI identifikator — NE e-pošta, ker se ta v Keycloaku lahko
// spremeni (FR-003, research.md §11). `scopes` se ob vsaki prijavi/obnovitvi znova izpelje iz
// Keycloak vlog/skupin (platform/keycloak/role-mapping.ts) — ni ročno urejano polje.
const userSchema = new Schema(
  {
    keycloakSubject: { type: String, required: true, unique: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    displayName: { type: String, required: true },
    scopes: { type: [String], default: [] },
    lastLoginAt: { type: Date, default: null },
    // research.md §7, FR-013/FR-014: nastavljeno, ko ta uporabnik (z `admin` scope-om)
    // prevzame podatke iz enouporabniške dobe. `null` = še ni prevzel/ni admin.
    migratedLegacyDataAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);

export type UserDoc = InferSchemaType<typeof userSchema>;
export const UserModel = model('User', userSchema);

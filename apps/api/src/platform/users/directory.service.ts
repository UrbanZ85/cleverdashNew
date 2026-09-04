import { Types } from 'mongoose';
import { UserModel } from '../../modules/auth/models/user.model.js';
import { compareSlovenian, initialsOf, maskEmail } from './user-directory.js';

// Imenik uporabnikov, ki ga potrebuje modul opravil, a živi v `User` (drug modul).
//
// Zakaj v platform/ in ne v modules/todos/: uvoz med moduli prepoveduje člen I (uveljavlja ga
// pravilo `cleverdash/module-boundary` v eslint.config.js). Skupna infrastruktura je prava pot
// — enako sta urejena `platform/settings/consent.service.ts` (bere `Settings` za modul beležk)
// in `platform/auth/automation-owner.ts` (bere `User`).
//
// Sama ODLOČITEV, komu se sme kaj deliti, tu ni: to je čista funkcija v modulu, ki deljenje
// izvede (modules/todos/domain/capabilities.ts). Tukaj se stanje samo BERE.

export interface UserSummary {
  id: string;
  displayName: string;
  /** Za kroglico z začetnicami v vmesniku — izpeljano, ne shranjeno. */
  initials: string;
  /** Zamaskirana e-pošta, IZKLJUČNO za razločevanje soimenjakov (FR-072). */
  emailHint: string;
}

/** Projekcija je EKSPLICITNA in kratka. `scopes` in `keycloakSubject` sta varnostna podatka,
 * `migratedLegacyDataAt` je notranje stanje — nič od tega ne sme uiti v odgovor, ki ga vidi
 * vsak prijavljen uporabnik (FR-073). */
const PROJECTION = '_id displayName email';

interface UserRow {
  _id: Types.ObjectId;
  displayName: string;
  email: string;
}

function toSummary(row: UserRow): UserSummary {
  return {
    id: String(row._id),
    displayName: row.displayName,
    initials: initialsOf(row.displayName),
    emailHint: maskEmail(row.email),
  };
}

/**
 * Uporabniki, ki jih je smiselno ponuditi v izbirniku za deljenje.
 *
 * Pogoj `lastLoginAt: { $ne: null }` je zapisan, čeprav zapis v `users` nastane šele ob prvi
 * prijavi (modules/auth/services/user-provisioning.service.ts): zapis lahko nastane tudi drugod
 * (platform/migration/legacy-userless-migration.service.ts), izbirnik, ki ponudi človeka, ki se
 * ne more prijaviti, pa je obljuba, ki je ni mogoče izpolniti (FR-070).
 *
 * Razvrstitev je v Node in ne v Mongu: pri peščici uporabnikov je ceneje, `Intl.Collator` pa
 * pravilno uvrsti č, š in ž, ne glede na to, ali ima namestitev naložen slovenski nabor za
 * zbirko.
 */
export async function listDirectoryUsers(params: {
  excludeUserId?: string;
  query?: string;
  limit?: number;
}): Promise<UserSummary[]> {
  const filter: Record<string, unknown> = { lastLoginAt: { $ne: null } };

  if (params.excludeUserId && Types.ObjectId.isValid(params.excludeUserId)) {
    filter._id = { $ne: new Types.ObjectId(params.excludeUserId) };
  }

  const rows = await UserModel.find(filter).select(PROJECTION).limit(params.limit ?? 200).lean<UserRow[]>();

  const needle = params.query?.trim().toLocaleLowerCase('sl');
  return rows
    .map(toSummary)
    // Filtriranje po imenu je v Node, da se ujema z isto slovensko primerjavo kot razvrstitev —
    // regularni izraz v Mongu bi "Č" in "C" obravnaval kot različna znaka.
    .filter((u) => !needle || u.displayName.toLocaleLowerCase('sl').includes(needle))
    .sort((a, b) => compareSlovenian(a.displayName, b.displayName));
}

/**
 * Imena za PRIKAZ po identifikatorjih, v ENI poizvedbi.
 *
 * Vrne `Map`, da klicatelj ne naredi N+1: seznam s petimi soudeleženci bi sicer pomenil pet
 * poizvedb ob vsakem izpisu.
 *
 * Pri prikazu ŽE DODANIH soudeležencev e-pošte ni (FR-074) — klicatelj vzame `displayName` in
 * `initials` ter `emailHint` izpusti.
 */
export async function readUserSummaries(
  userIds: readonly string[],
): Promise<Map<string, UserSummary>> {
  const valid = [...new Set(userIds)].filter((id) => Types.ObjectId.isValid(id));
  if (valid.length === 0) return new Map();

  const rows = await UserModel.find({ _id: { $in: valid.map((id) => new Types.ObjectId(id)) } })
    .select(PROJECTION)
    .lean<UserRow[]>();

  return new Map(rows.map((row) => [String(row._id), toSummary(row)]));
}

/** Ali ta uporabnik obstaja in se je že vsaj enkrat prijavil — pogoj za deljenje (FR-070). */
export async function isShareableUser(userId: string): Promise<boolean> {
  if (!Types.ObjectId.isValid(userId)) return false;
  const found = await UserModel.exists({ _id: new Types.ObjectId(userId), lastLoginAt: { $ne: null } });
  return found !== null;
}

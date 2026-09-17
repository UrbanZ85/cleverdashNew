import { Types } from 'mongoose';
import { forbidden, notFound } from '../../../platform/errors/problem.js';
import {
  denyReason,
  describeDeny,
  roleFor,
  type MemberRole,
  type RecipeCapability,
  type RecipeRole,
} from '../domain/capabilities.js';
import { RecipeModel } from '../models/recipe.model.js';

// EDINA vrata do recepta v tem modulu. Vsaka pot v `router.ts` gre skozi `requireRecipe`; nikjer
// drugje se `RecipeModel.findOne` ne kliče z ročno sestavljenim pogojem dostopa.
//
// To ni slogovno pravilo. Model dostopa je tu sestavljen (lastnik ALI soudeleženec, in vloga
// odloči, kaj sme), in razpršen po dvajsetih poteh bi se prej ali slej razšel — ena pot bi
// pozabila `members`, druga bi vrnila 403 tam, kjer mora biti 404.
//
// Razlika do modulov 007/008, ki je razlog za obstoj te datoteke: tam je dostop `{ _id, userId }`
// in ga je mogoče ponoviti v vsaki poti brez napake. Tu ni.

/** Kar poti potrebujejo iz recepta, preden karkoli storijo. Namenoma `lean`: hidriran dokument
 * bi vabil v `doc.field = x; save()`, kar je natanko vzorec brati-spremeniti-pisati, ki ga ta
 * modul nikjer ne uporablja (research.md §14). */
export interface RecipeAccess {
  recipeId: string;
  ownerId: string;
  role: RecipeRole;
  members: { userId: string; role: MemberRole; seenAt: Date | null }[];
  coverImageId: string | null;
  publicShareToken: string | null;
}

interface RecipeAccessLean {
  _id: Types.ObjectId;
  ownerId: Types.ObjectId;
  members: { userId: Types.ObjectId; role: MemberRole; seenAt: Date | null }[];
  coverImageId: Types.ObjectId | null;
  publicShare: { token: string; revokedAt: Date | null } | null;
}

/** Neveljaven ObjectId bi v Mongoose vrgel CastError, ki se navzven pokaže kot 500 — za
 * uporabnika, ki je odprl staro povezavo, je to 404 (enak vzorec kot modules/notes/router.ts). */
export function requireObjectId(value: string, what: string): string {
  if (!Types.ObjectId.isValid(value)) throw notFound(`${what} ne obstaja.`);
  return value;
}

/**
 * Recept, do katerega ima ta uporabnik dostop za to zmožnost — ali napaka.
 *
 * DVE RAZLIČNI NAPAKI, ki ju je treba strogo ločevati:
 *
 *  - **404**, kadar recepta ni ALI kadar klicatelj ni ne lastnik ne soudeleženec. Obstoj tujega
 *    zapisa ni podatek, ki bi ga API smel razkriti (FR-063) — `403` bi povedal "ta recept
 *    obstaja, samo tvoj ni", kar je razlika, ki jo je mogoče izkoristiti za štetje.
 *  - **403**, kadar klicatelj dostop IMA, a mu vloga tega dejanja ne dovoli. Tu je razkritje
 *    namerno in nujno: bralec mora izvedeti, da recept obstaja in da naj za urejanje prosi
 *    lastnika, sicer bi bil 404 zanj videti kot izgubljen recept.
 */
export async function requireRecipe(
  userId: string,
  recipeId: string,
  capability: RecipeCapability,
): Promise<RecipeAccess> {
  const recipe = await RecipeModel.findById(requireObjectId(recipeId, 'Recept'))
    .select('_id ownerId members coverImageId publicShare')
    .lean<RecipeAccessLean | null>();

  if (!recipe) throw notFound('Recept ne obstaja.');

  const role = roleFor(recipe, userId);
  // Tujec dobi ISTI odgovor kot za neobstoječ recept — glej zgoraj.
  if (!role) throw notFound('Recept ne obstaja.');

  const reason = denyReason(role, capability);
  if (reason) throw forbidden(describeDeny(capability));

  return {
    recipeId: String(recipe._id),
    ownerId: String(recipe.ownerId),
    role,
    members: recipe.members.map((m) => ({
      userId: String(m.userId),
      role: m.role,
      seenAt: m.seenAt ?? null,
    })),
    coverImageId: recipe.coverImageId ? String(recipe.coverImageId) : null,
    publicShareToken: recipe.publicShare && !recipe.publicShare.revokedAt ? recipe.publicShare.token : null,
  };
}

/**
 * Doda soudeleženca ali mu spremeni vlogo — v ENEM atomarnem pisanju na vsako od obeh poti.
 *
 * Vrne `false`, kadar pisanje ni našlo tarče. To NI napaka te funkcije: pomeni, da je bil recept
 * med tem izbrisan ali da je vzporeden klic že opravil isto. Klicatelj se odloči, kaj to pomeni.
 *
 * Zakaj dve pisanji in ne eno: Mongo nima "vstavi v polje ali posodobi obstoječi element". Poskusi
 * se najprej POSODOBITEV (pogojena na obstoj elementa), in šele če ta ni zadela, VSTAVLJANJE
 * (pogojeno na NEobstoj). Vrstni red je pomemben — obratni bi ob hkratnih klicih dopustil dva
 * vnosa za istega človeka, kar je stanje, na katero `roleFor` nima enoličnega odgovora
 * (data-model.md).
 */
export async function upsertMember(
  recipeId: string,
  memberUserId: string,
  role: MemberRole,
  actorUserId: string,
): Promise<boolean> {
  const updated = await RecipeModel.updateOne(
    { _id: recipeId, 'members.userId': memberUserId },
    {
      $set: {
        'members.$.role': role,
        lastModifiedBy: actorUserId,
      },
    },
  );
  if (updated.matchedCount > 0) return true;

  // `$ne` je tu EDINO, kar preprečuje podvojeno članstvo — enoličnega indeksa nad
  // `members.userId` ni in ne sme biti (prepovedal bi članstvo v dveh receptih, data-model.md).
  const inserted = await RecipeModel.updateOne(
    { _id: recipeId, 'members.userId': { $ne: new Types.ObjectId(memberUserId) } },
    {
      $push: {
        members: {
          userId: new Types.ObjectId(memberUserId),
          role,
          addedAt: new Date(),
          // `null` = še ni odprl, zato je recept pri njem označen kot NOV (FR-038).
          seenAt: null,
        },
      },
      $set: { lastModifiedBy: actorUserId },
    },
  );
  return inserted.matchedCount > 0;
}

/** Odstrani soudeleženca. Uporablja se za oboje — lastnik odvzame dostop in soudeleženec odide
 * sam (FR-031, FR-032) — ker je to ista sprememba zapisa; razlikujeta se samo pravici, ki ju je
 * `requireRecipe` preveril prej. */
export async function removeMember(
  recipeId: string,
  memberUserId: string,
  actorUserId: string,
): Promise<boolean> {
  const result = await RecipeModel.updateOne(
    { _id: recipeId },
    {
      $pull: { members: { userId: new Types.ObjectId(memberUserId) } },
      $set: { lastModifiedBy: actorUserId },
    },
  );
  return result.modifiedCount > 0;
}

/**
 * Pobriše oznako "novo" za tega soudeleženca (FR-038).
 *
 * Za lastnika je to prazno dejanje in ne napaka: lastnik med soudeleženci ni (FR-037), zato
 * `arrayFilters` ne zadene ničesar. Klicatelju tega ni treba vedeti — pot `POST /recipes/{id}/seen`
 * sme poklicati vsak, ki recept vidi.
 *
 * `$set` z `arrayFilters` se na strežniku dotakne natanko enega elementa polja. Izgubljen popravek
 * je posledica brati-spremeniti-pisati, ki je v tem modulu nedosegljiv.
 */
export async function markSeen(recipeId: string, userId: string): Promise<void> {
  await RecipeModel.updateOne(
    { _id: recipeId, 'members.userId': userId, 'members.seenAt': null },
    { $set: { 'members.$[m].seenAt': new Date() } },
    { arrayFilters: [{ 'm.userId': new Types.ObjectId(userId) }] },
  );
}

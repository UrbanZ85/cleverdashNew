import { Types } from 'mongoose';
import { SharedFileModel } from '../models/shared-file.model.js';

// FR-009: kvota prostora na uporabnika — POIZVEDBENI del. Presoja sama je čista funkcija v
// `domain/quota.ts`.
//
// Ta datoteka je nastala v 009b, ko je poti do nove datoteke na disku postalo dve: lastnikova
// (`router.ts`) in javna oddaja v predal (`public.router.ts`). Prej je bil ta seštevek zaseben
// pomočnik v lastnikovem usmerjevalniku. Prepis v drugo datoteko bi bil dve izvedbi razsodbe
// med vzporednima napovedma — natanko tam, kjer ena od njiju teče brez prijave.

/**
 * Zasedeno se VEDNO sešteje z agregacijo, nikoli iz števca na uporabniku — števec bi se ob
 * prvi pozabljeni poti tiho razsinhroniziral (domain/quota.ts).
 *
 * `upTo` omeji seštevek na zapise, ki so nastali PRED danim (in nanj samega) — podlaga za
 * razsodbo med vzporednima napovedma, glej `fitsAfterReserving`.
 */
export async function usedBytesFor(userId: string, upTo?: unknown): Promise<number> {
  const match: Record<string, unknown> = { userId: new Types.ObjectId(userId) };
  if (upTo !== undefined) match._id = { $lte: upTo };
  const [row] = await SharedFileModel.aggregate<{ total: number }>([
    { $match: match },
    { $group: { _id: null, total: { $sum: '$byteSize' } } },
  ]);
  return row?.total ?? 0;
}

/**
 * Razsodba po zapisu rezervacije: ali je zapis `insertedId` še znotraj kvote.
 *
 * Dve VZPOREDNI napovedi bi obe prebrali kvoto, preden bi katera od njiju pisala, in obe bi šli
 * skozi. Zato po zapisu še enkrat — a seštejemo samo zapise, ki so nastali PRED tem (in tega). S
 * tem je razsodnik `_id`, ki je enolično urejen: pri dveh napovedih uspe natanko tista, ki je
 * bila prva, druga pa se pobriše. Brez tega bi bila potrebna transakcija ali števec na
 * uporabniku — oboje dražje od ene poizvedbe.
 */
export async function fitsAfterReserving(userId: string, insertedId: unknown, limitBytes: number): Promise<boolean> {
  return (await usedBytesFor(userId, insertedId)) <= limitBytes;
}

/** Koliko prostora je uporabniku še na voljo. Nikoli negativno — znižana kvota ne sme dati
 * sporočila z negativno številko. */
export async function availableBytesFor(userId: string, limitBytes: number): Promise<number> {
  return Math.max(0, limitBytes - (await usedBytesFor(userId)));
}

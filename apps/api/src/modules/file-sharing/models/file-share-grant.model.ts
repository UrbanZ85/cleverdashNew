import { Schema, model, type InferSchemaType } from 'mongoose';

// Dovolilnica za prevzem: dokazilo, da je bilo za TO datoteko vpisano pravilno geslo
// (research.md §8). Vrednost potuje kot piškotek `cd_share`, omejen na
// `Path=/api/v1/share/<token>` — dovolilnica ene datoteke se tako sploh ne pošlje pri zahtevi
// za drugo (FR-016).
//
// Zakaj ZAPIS in ne podpisan žeton: FR-026 zahteva, da preklic razveljavi tudi ŽE IZDANO
// dovolilnico. Podpisanega žetona ni mogoče preklicati brez seznama preklicanih — kar je isti
// zapis, le z več koraki.

const fileShareGrantSchema = new Schema(
  {
    fileId: { type: Schema.Types.ObjectId, ref: 'SharedFile', required: true },
    /** 32 naključnih bajtov v base64url. */
    grant: { type: String, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

fileShareGrantSchema.index({ grant: 1 }, { unique: true });
// Preklic izbriše vse dovolilnice datoteke z eno operacijo.
fileShareGrantSchema.index({ fileId: 1 });
// TTL je SAMO pospravljanje zbirke. Nobena avtorizacijska odločitev se nanj ne zanaša: vsaka
// poizvedba dovolilnice ima `expiresAt: { $gt: now }` v pogoju, ker TTL monitor teče na ~60 s
// in zamika ne obljublja (research.md §13).
fileShareGrantSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type FileShareGrantDoc = InferSchemaType<typeof fileShareGrantSchema>;
export const FileShareGrantModel = model('FileShareGrant', fileShareGrantSchema);

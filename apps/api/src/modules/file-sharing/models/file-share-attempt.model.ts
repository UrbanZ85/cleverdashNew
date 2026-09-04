import { Schema, model, type InferSchemaType } from 'mongoose';

// Trajen števec zgrešenih poskusov gesla (research.md §9, domain/attempt-window.ts).
//
// Trajen zato, ker se pomnilniški ob vsakem ponovnem zagonu ponastavi — kar je za napadalca
// izhod, ponovni zagon pa ni redek dogodek (vsaka posodobitev). Isti razlog navaja člen V za
// scheduler: stanje je zapis, ne spremenljivka.
//
// `key` je ene od dveh vrst:
//  - `link:<fileId>` — ugibanje po eni povezavi;
//  - `ip:<naslov>`   — ugibanje z enega naslova po mnogo povezavah.
// Meji tečeta vzporedno in prva izpolnjena zavrne. Samo prva bi dovolila napad z eno povezavo
// na naslov; samo druga bi ena pisarna za NAT-om zaklenila vse za sabo.

const fileShareAttemptSchema = new Schema(
  {
    key: { type: String, required: true },
    windowStartedAt: { type: Date, required: true },
    count: { type: Number, required: true, default: 0 },
    lockedUntil: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true, versionKey: false },
);

fileShareAttemptSchema.index({ key: 1 }, { unique: true });
// TTL samo pospravlja; odločitve o zaklepu se nanj ne zanašajo (research.md §13).
fileShareAttemptSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type FileShareAttemptDoc = InferSchemaType<typeof fileShareAttemptSchema>;
export const FileShareAttemptModel = model('FileShareAttempt', fileShareAttemptSchema);

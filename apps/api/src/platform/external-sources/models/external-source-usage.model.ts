import { Schema, model, type InferSchemaType } from 'mongoose';

// Dnevni proračun zahtev po zunanjem viru: en zapis na (vir, dan Europe/Ljubljana) za CELO namestitev.
// Meja je na ključ pri ponudniku, zato je števec skupen vsem tipom skenerjev (npr. eBay za LEGO in
// zbirateljski skener). Rezervacija je atomaren `findOneAndUpdate` z `requests < limit` v filtru
// (usage.ts), ne števec v pomnilniku (člen V). Namestitveni zapis brez lastnika.
//
// Hrambo uveljavlja TTL indeks, ne pometač.

export const EXTERNAL_USAGE_RETENTION_DAYS = 400;
export const EXTERNAL_USAGE_SOURCES = ['rebrickable', 'bricklink', 'ebay', 'tcgdex', 'pricecharting'] as const;

const externalSourceUsageSchema = new Schema(
  {
    source: { type: String, enum: EXTERNAL_USAGE_SOURCES, required: true },
    /** `yyyy-LL-dd` v coni Europe/Ljubljana. */
    day: { type: String, required: true },
    requests: { type: Number, required: true, default: 0 },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: false, versionKey: false },
);

externalSourceUsageSchema.index({ source: 1, day: 1 }, { unique: true });
externalSourceUsageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type ExternalSourceUsageDoc = InferSchemaType<typeof externalSourceUsageSchema>;
export const ExternalSourceUsageModel = model('ExternalSourceUsage', externalSourceUsageSchema);

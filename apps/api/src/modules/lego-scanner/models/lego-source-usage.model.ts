import { Schema, model, type InferSchemaType } from 'mongoose';

// data-model.md (018): dnevni proračun zahtev po viru — en zapis na (vir, dan Europe/Ljubljana) za CELO
// namestitev (en ključ na vir, ena dnevna meja pri ponudniku). Rezervacija je atomaren
// `findOneAndUpdate` z `requests < limit` v filtru (sources/usage.ts), ne števec v pomnilniku (člen V).
// Namestitveni zapis brez lastnika (isti razred kot `ScannerAiUsage`).
//
// Hrambo uveljavlja TTL indeks, ne pometač (isti razlog kot pri `USAGE_RETENTION_DAYS`).

export const LEGO_USAGE_RETENTION_DAYS = 400;
export const LEGO_USAGE_SOURCES = ['rebrickable', 'bricklink', 'ebay'] as const;

const legoSourceUsageSchema = new Schema(
  {
    source: { type: String, enum: LEGO_USAGE_SOURCES, required: true },
    /** `yyyy-LL-dd` v coni Europe/Ljubljana. */
    day: { type: String, required: true },
    requests: { type: Number, required: true, default: 0 },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: false, versionKey: false },
);

legoSourceUsageSchema.index({ source: 1, day: 1 }, { unique: true });
legoSourceUsageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type LegoSourceUsageDoc = InferSchemaType<typeof legoSourceUsageSchema>;
export const LegoSourceUsageModel = model('LegoSourceUsage', legoSourceUsageSchema);

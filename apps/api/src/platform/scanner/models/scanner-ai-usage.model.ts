import { Schema, model, type InferSchemaType } from 'mongoose';

// data-model.md (017): dnevni proračun klicev modela — en zapis na koledarski dan (Europe/Ljubljana)
// za CELO namestitev (en ključ, en račun). Rezervacija je atomaren `findOneAndUpdate` z
// `requests < limit` v filtru (services/ai-usage.service.ts), ne števec v pomnilniku (člen V): dva
// izvoda API-ja delita isto mejo. Šteje se rezervacija, ne uspeh — tudi neuspel klic je bil klic.
//
// Hrambo uveljavlja TTL indeks (400 dni, kot `USAGE_RETENTION_DAYS`): prazen pometač se ne more
// zgoditi tiho (isti razlog kot pri 014).

export const AI_USAGE_RETENTION_DAYS = 400;

const scannerAiUsageSchema = new Schema(
  {
    /** `yyyy-LL-dd` v coni Europe/Ljubljana. */
    day: { type: String, required: true },
    requests: { type: Number, required: true, default: 0 },
    inputTokens: { type: Number, required: true, default: 0 },
    outputTokens: { type: Number, required: true, default: 0 },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: false, versionKey: false },
);

scannerAiUsageSchema.index({ day: 1 }, { unique: true });
scannerAiUsageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type ScannerAiUsageDoc = InferSchemaType<typeof scannerAiUsageSchema>;
export const ScannerAiUsageModel = model('ScannerAiUsage', scannerAiUsageSchema);

import { Schema, model, type InferSchemaType } from 'mongoose';
import { AI_CONFIDENCES, AI_RISK_LEVELS } from '../types.js';

// data-model.md (017): predpomnilnik analiz po VHODU. Ključ je `inputHash` (model + različica sheme +
// kanonični vhod): ista stvar pri drugem skenerju ali drugem uporabniku dobi isto analizo brez klica
// (FR-013). Namestitveni zapis brez lastnika — vsebina je objektivna ocena vhoda, ne osebni podatek
// (isti razred kot `ExternalCache`, tests/unit/no-owner-fields.spec.ts).
//
// `ExternalCache` ni uporabljen: ta hrani surove odgovore virov s svežino po URL-ju, tu pa je
// vsebina po vhodu s TTL `SCANNER_AI_CACHE_DAYS`.

export const aiAnalysisSchema = new Schema(
  {
    version: { type: Number, required: true },
    model: { type: String, required: true },
    analyzedAt: { type: Date, required: true },
    inputHash: { type: String, required: true },
    cached: { type: Boolean, required: true, default: false },
    summary: { type: String, required: true },
    riskLevel: { type: String, enum: AI_RISK_LEVELS, required: true },
    explanation: { type: String, required: true, default: '' },
    risks: { type: [String], default: [] },
    defects: { type: [String], default: [] },
    opportunities: { type: [String], default: [] },
    /** Zemljevid `snake_case` → besedilo; `Mixed`, ker so ključi last tipa/modela. */
    attributes: { type: Schema.Types.Mixed, default: () => ({}) },
    confidence: { type: String, enum: AI_CONFIDENCES, required: true },
  },
  { _id: false },
);

const scannerAiCacheSchema = new Schema(
  {
    key: { type: String, required: true },
    model: { type: String, required: true },
    analysis: { type: aiAnalysisSchema, required: true },
    createdAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: false, versionKey: false },
);

scannerAiCacheSchema.index({ key: 1 }, { unique: true });
scannerAiCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type ScannerAiCacheDoc = InferSchemaType<typeof scannerAiCacheSchema>;
export const ScannerAiCacheModel = model('ScannerAiCache', scannerAiCacheSchema);

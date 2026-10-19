import { Schema, model, type InferSchemaType } from 'mongoose';
import { CHANGE_TYPES } from '../types.js';

// data-model.md (016): opazovanje — ena vrstica na rezultat na zagon, v katerem je bil rezultat
// vrnjen ali zanesljivo ugotovljen kot nedosegljiv. `UNCHANGED` vrstice se pišejo — graf
// potrebuje točke, ne samo prelome (isti dogovor kot `FlightOfferHistory` v 015).

const moneySchema = new Schema(
  {
    amount: { type: Number, required: true },
    currency: { type: String, required: true },
  },
  { _id: false },
);

const scannerResultHistorySchema = new Schema(
  {
    resultId: { type: Schema.Types.ObjectId, ref: 'ScannerResult', required: true },
    runId: { type: Schema.Types.ObjectId, ref: 'ScannerRun', required: true },
    checkedAt: { type: Date, required: true },
    /** `null` pri `UNAVAILABLE` in pri rezultatih brez cene. */
    price: { type: moneySchema, default: null },
    previousPrice: { type: moneySchema, default: null },
    changeType: { type: String, enum: CHANGE_TYPES, required: true },
    /** `checkedAt` + SCANNER_HISTORY_RETENTION_DAYS → TTL. */
    expiresAt: { type: Date, required: true },
  },
  { timestamps: false, versionKey: false },
);

scannerResultHistorySchema.index({ resultId: 1, checkedAt: 1 });
scannerResultHistorySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type ScannerResultHistoryDoc = InferSchemaType<typeof scannerResultHistorySchema>;
export const ScannerResultHistoryModel = model('ScannerResultHistory', scannerResultHistorySchema);

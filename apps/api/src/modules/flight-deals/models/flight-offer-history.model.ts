import { Schema, model, type InferSchemaType } from 'mongoose';
import { CHANGE_TYPES } from '../domain/types.js';

// data-model.md (015): zgodovina cen — ena vrstica na ponudbo na zagon, v katerem je bila
// ponudba vrnjena ali zanesljivo ugotovljena kot nedosegljiva.
//
// `UNCHANGED` vrstice se PIŠEJO: graf potrebuje točke, ne samo prelome. Pri 50 ponudbah na
// iskanje in dveh zagonih dnevno je to 100 vrstic na iskanje na dan, s TTL 180 dni — obseg, ki
// ga ta namestitev brez težav nosi.
//
// Unikatnega `(offerId, runId)` ni: pisanje se zgodi znotraj zagona, ki je sam unikaten
// (`slotKey`), ponovni zagon istega termina pa ni mogoč.

const moneySchema = new Schema(
  {
    amount: { type: Number, required: true },
    currency: { type: String, required: true },
  },
  { _id: false },
);

const flightOfferHistorySchema = new Schema(
  {
    offerId: { type: Schema.Types.ObjectId, ref: 'FlightOffer', required: true },
    runId: { type: Schema.Types.ObjectId, ref: 'FlightSearchRun', required: true },
    checkedAt: { type: Date, required: true },
    /** `null` pri `UNAVAILABLE`. */
    price: { type: moneySchema, default: null },
    previousPrice: { type: moneySchema, default: null },
    changeType: { type: String, enum: CHANGE_TYPES, required: true },
    /** `checkedAt` + FLIGHT_HISTORY_RETENTION_DAYS → TTL. Rok hrambe uveljavlja indeks, ne pometač
     * (FR-029). */
    expiresAt: { type: Date, required: true },
  },
  { timestamps: false, versionKey: false },
);

flightOfferHistorySchema.index({ offerId: 1, checkedAt: 1 });
flightOfferHistorySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type FlightOfferHistoryDoc = InferSchemaType<typeof flightOfferHistorySchema>;
export const FlightOfferHistoryModel = model('FlightOfferHistory', flightOfferHistorySchema);

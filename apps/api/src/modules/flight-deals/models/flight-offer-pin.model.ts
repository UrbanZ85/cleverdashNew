import { Schema, model, type InferSchemaType } from 'mongoose';

// Ponudba, ki jo uporabnik posebej spremlja (pripeta). Ponudba je skupna in brez lastnika, zato pripetost
// ne sme biti na njej: je lastnost PARA (uporabnik, ponudba), osebni zapis z `userId`.
// `expiresAt` je kopija iz ponudbe (dan po odhodu + 7 dni) → TTL, pripetost zato ne preživi ponudbe.

const flightOfferPinSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    offerId: { type: Schema.Types.ObjectId, ref: 'FlightOffer', required: true },
    pinnedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: false, versionKey: false },
);

flightOfferPinSchema.index({ userId: 1, offerId: 1 }, { unique: true });
flightOfferPinSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type FlightOfferPinDoc = InferSchemaType<typeof flightOfferPinSchema>;
export const FlightOfferPinModel = model('FlightOfferPin', flightOfferPinSchema);

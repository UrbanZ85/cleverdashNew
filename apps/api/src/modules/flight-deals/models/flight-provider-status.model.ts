import { Schema, model, type InferSchemaType } from 'mongoose';
import { PROVIDER_IDS, PROVIDER_OUTCOMES } from '../domain/types.js';

// data-model.md (015): stanje vira — en zapis na vir, za administratorja (FR-053) in za dnevno
// mejo neuradnega vira (FR-020).
//
// Ali je vir vklopljen, uraden in kako se imenuje, NI tu — to je lastnost kode in okolja
// (providers/index.ts + FLIGHT_*_ENABLED). Tu je samo tisto, kar se spreminja z izvajanjem.

const flightProviderStatusSchema = new Schema(
  {
    providerId: { type: String, enum: PROVIDER_IDS, required: true },
    lastSuccessAt: { type: Date, default: null },
    lastErrorAt: { type: Date, default: null },
    /** Brez skrivnosti (žeton ni nikoli v sporočilu). */
    lastError: { type: String, default: null },
    lastOutcome: { type: String, enum: PROVIDER_OUTCOMES, default: null },
    /** Šteje ZAGONE, v katerih je bil vir vprašan, ne posameznih zahtev — meja "največ dvakrat
     * dnevno" pri neuradnem viru je meja zagonov. `day` je koledarski dan v Europe/Ljubljana. */
    requestsToday: {
      day: { type: String, default: null },
      count: { type: Number, required: true, default: 0 },
    },
  },
  { timestamps: false, versionKey: false },
);

flightProviderStatusSchema.index({ providerId: 1 }, { unique: true });

export type FlightProviderStatusDoc = InferSchemaType<typeof flightProviderStatusSchema>;
export const FlightProviderStatusModel = model('FlightProviderStatus', flightProviderStatusSchema);

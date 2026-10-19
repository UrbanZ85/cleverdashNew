import { Schema, model, type InferSchemaType } from 'mongoose';
import { AVAILABILITIES, CHANGE_TYPES } from '../types.js';

// data-model.md (016): rezultat v GENERIČNI shrambi (tipi z `results: 'generic'`). Rezultat je
// last enega skenerja: `{ definitionId, identityKey }` je unikat, `userId` je denormaliziran
// lastnik skenerja (zaseben zapis, bere ga samo lastnik). To je NAMERNA razlika do `FlightOffer`,
// ki je skupna referenčna tabela brez lastnika — leti zato ostanejo pri lastni shrambi
// (research.md §5).
//
// Cena je NEOBVEZNA (FR-022): rezultat slike ali domene je brez nje; sprememba se takrat ugotovi
// prek `comparableHash` (domain/change-detection.ts).

const moneySchema = new Schema(
  {
    amount: { type: Number, required: true },
    currency: { type: String, required: true },
  },
  { _id: false },
);

const scannerResultSchema = new Schema(
  {
    definitionId: { type: Schema.Types.ObjectId, ref: 'ScannerDefinition', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    scannerType: { type: String, required: true },
    /** sha256 nad kanoničnim nizom tipa, 32 hex (domain/identity.ts). */
    identityKey: { type: String, required: true },
    /** Oznaka adapterja/vira. */
    source: { type: String, required: true },
    externalId: { type: String, default: null },
    title: { type: String, required: true },
    /** Samo, če gostitelj pripada `allowedResultHosts` tipa; sicer `null`. */
    url: { type: String, default: null },
    price: { type: moneySchema, default: null },
    /** Podatki po kategoriji — oblika last tipa. */
    data: { type: Schema.Types.Mixed, default: null },
    /** Hash polja `comparable`; `CHANGED`, kadar se spremeni in cene ni. */
    comparableHash: { type: String, default: null },
    /** Čas podatka pri viru; brez njega = čas preverjanja. */
    dataAt: { type: Date, required: true },
    firstSeenAt: { type: Date, required: true },
    lastSeenAt: { type: Date, required: true },
    lastCheckedAt: { type: Date, required: true },
    availability: { type: String, enum: AVAILABILITIES, required: true, default: 'available' },
    /** Zadnja DRUGAČNA cena — za prikaz brez branja zgodovine. */
    previousPrice: {
      type: new Schema(
        {
          amount: { type: Number, required: true },
          currency: { type: String, required: true },
          at: { type: Date, required: true },
        },
        { _id: false },
      ),
      default: null,
    },
    lastChangeType: { type: String, enum: CHANGE_TYPES, required: true },
    /** Tip lahko poda; sicer `lastSeenAt` + 30 dni → TTL. */
    expiresAt: { type: Date, required: true },
  },
  { timestamps: false, versionKey: false },
);

// Idempotentnost zagona (člen V.3): isti rezultat istega skenerja nastane enkrat.
scannerResultSchema.index({ definitionId: 1, identityKey: 1 }, { unique: true });
scannerResultSchema.index({ definitionId: 1, lastChangeType: 1, lastSeenAt: -1 });
scannerResultSchema.index({ userId: 1, lastSeenAt: -1 });
scannerResultSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type ScannerResultDoc = InferSchemaType<typeof scannerResultSchema>;
export const ScannerResultModel = model('ScannerResult', scannerResultSchema);

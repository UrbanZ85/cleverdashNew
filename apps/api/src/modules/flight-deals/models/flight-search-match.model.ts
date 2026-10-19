import { Schema, model, type InferSchemaType } from 'mongoose';
import { CHANGE_TYPES, MATCH_STATUSES } from '../domain/types.js';

// data-model.md (015): vez iskanje ↔ ponudba.
//
// Razlog za obstoj: "NOVO" je lastnost PARA (iskanje, ponudba), ne ponudbe — ista ponudba je za
// uporabnika, ki je iskanje ustvaril danes, nova, za tistega, ki jo spremlja tri tedne, pa ne
// (edge case v spec.md). In vidnost prejemnika gre prek iskanja: prejemnik vidi ponudbe tistih
// iskanj, pri katerih je na seznamu, nič drugega (FR-041).
//
// `ruleOwnerId` je denormaliziran `userId` iskanja, da poizvedba "ponudbe mojih iskanj" ne
// potrebuje pridružitve. Ni `userId`: zapis ni zaseben (prejemniki ga berejo prek `ruleId`) in
// ime `userId` bi obljubljalo izolacijo, ki je ni (tests/unit/no-owner-fields.spec.ts).

const flightSearchMatchSchema = new Schema(
  {
    ruleId: { type: Schema.Types.ObjectId, ref: 'FlightSearchRule', required: true },
    ruleOwnerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    offerId: { type: Schema.Types.ObjectId, ref: 'FlightOffer', required: true },
    /** Kdaj je ponudba prvič ustrezala TEMU iskanju — od tod `NEW`. */
    firstMatchedAt: { type: Date, required: true },
    lastMatchedAt: { type: Date, required: true },
    /** Kaj je zadnji zagon pomenil za TO iskanje (`NEW` ob `firstMatchedAt`). */
    lastChangeType: { type: String, enum: CHANGE_TYPES, required: true },
    lastChangeAt: { type: Date, required: true },
    lastRunId: { type: Schema.Types.ObjectId, ref: 'FlightSearchRun', required: true },
    /** `stale` = ponudba še obstaja, a pravilom iskanja ne ustreza več (npr. cena čez mejo) — se
     * ne obvešča in se ne kaže med aktivnimi. */
    status: { type: String, enum: MATCH_STATUSES, required: true, default: 'active' },
    /** Kopija iz ponudbe → TTL. */
    expiresAt: { type: Date, required: true },
  },
  { timestamps: false, versionKey: false },
);

// Idempotentnost zagona (člen V.3): isti par nastane enkrat, ponovni zagon ga posodobi.
flightSearchMatchSchema.index({ ruleId: 1, offerId: 1 }, { unique: true });
// Nadzorna plošča lastnika: "nove ponudbe" in "spremembe cen" po času.
flightSearchMatchSchema.index({ ruleOwnerId: 1, lastChangeAt: -1 });
// Ponudbe enega iskanja (tudi za prejemnike, prek seznama ruleId).
flightSearchMatchSchema.index({ ruleId: 1, status: 1 });
// Podrobnosti ponudbe: komu vse ustreza.
flightSearchMatchSchema.index({ offerId: 1 });
flightSearchMatchSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type FlightSearchMatchDoc = InferSchemaType<typeof flightSearchMatchSchema>;
export const FlightSearchMatchModel = model('FlightSearchMatch', flightSearchMatchSchema);

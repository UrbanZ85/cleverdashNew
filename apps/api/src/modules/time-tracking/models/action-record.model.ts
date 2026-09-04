import { Schema, model, type InferSchemaType } from 'mongoose';

// data-model.md: trajna, nespremenljiva zgodovina (FR-052). Zaključena plannedAction se
// prepiše sem. NIKOLI samodejno brisano — to je evidenca, edina kolekcija te
// funkcionalnosti brez politike čiščenja. Popravek je nov zapis z `note`, ne sprememba.
const actionRecordSchema = new Schema(
  {
    // 004: denormaliziran — glej planned-action.model.ts.
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    localDate: { type: String, required: true },
    // US9, T101: ohranjena tudi, ko je izvirna plannedAction pozneje počiščena
    // (PLANNED_ACTION_RETENTION_DAYS) — edini način, da /history/{id}/attempts najde
    // poskuse (ActionAttempt.plannedActionId), ko akcija ni bila ad-hoc (US1).
    plannedActionId: { type: Schema.Types.ObjectId, ref: 'PlannedAction', default: null },
    // Neobvezno: ad-hoc ročna/API akcija brez ujemajoče se načrtovane akcije nima profila,
    // na katerega bi kazala (US1) — `profileName` spodaj to jasno pove v UI.
    profileId: { type: Schema.Types.ObjectId, ref: 'TrackingProfile', default: null },
    // Denormalizirano, da zgodovina ostane berljiva, tudi če je profil/lokacija pozneje
    // preimenovana ali izbrisana.
    profileName: { type: String, required: true },
    locationName: { type: String, required: true },
    actionName: { type: String, required: true },
    scheduledAt: { type: Date, required: true },
    completedAt: { type: Date, default: null },
    finalOutcome: {
      type: String,
      enum: ['succeeded', 'failed', 'missed', 'skipped', 'already_done', 'cancelled'],
      required: true,
    },
    source: { type: String, enum: ['schedule', 'manual', 'api', 'legacy'], default: 'schedule' },
    stateBefore: { type: String, enum: ['OFF_DUTY', 'ON_DUTY', 'ON_BREAK', 'UNKNOWN'], default: null },
    stateAfter: { type: String, enum: ['OFF_DUTY', 'ON_DUTY', 'ON_BREAK', 'UNKNOWN'], default: null },
    attemptSummary: {
      count: { type: Number, default: 0 },
      firstAt: { type: Date, default: null },
      lastAt: { type: Date, default: null },
    },
    failureReason: { type: String, default: null },
    note: { type: String, default: null },
  },
  { timestamps: true, versionKey: false },
);

actionRecordSchema.index({ userId: 1, localDate: -1 });
actionRecordSchema.index({ profileId: 1, localDate: -1 });
actionRecordSchema.index({ userId: 1, finalOutcome: 1, localDate: -1 });

export type ActionRecordDoc = InferSchemaType<typeof actionRecordSchema>;
export const ActionRecordModel = model('ActionRecord', actionRecordSchema);

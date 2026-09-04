import { Schema, model, type InferSchemaType } from 'mongoose';

// data-model.md: en poskus ene načrtovane akcije. BREZ TTL — poskusi se obdržijo (FR-032);
// briše se samo datoteka posnetka zaslona (§Čiščenje), zapis ostane.
const actionAttemptSchema = new Schema(
  {
    // 004: denormaliziran — glej planned-action.model.ts.
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // Neobvezno: ročna/API akcija (US1) brez ujemajoče se načrtovane akcije nima za kaj
    // kazati — to NI napaka, samo ad-hoc izvedba mimo urnika.
    plannedActionId: { type: Schema.Types.ObjectId, ref: 'PlannedAction', default: null },
    attemptNumber: { type: Number, required: true },
    startedAt: { type: Date, required: true },
    finishedAt: { type: Date, required: true },
    outcome: {
      type: String,
      enum: ['verified', 'not_verified', 'action_unavailable', 'unexpected_state', 'browser_error', 'session_expired', 'timeout'],
      required: true,
    },
    availableActionsBefore: { type: [String], default: [] },
    availableActionsAfter: { type: [String], default: [] },
    clockStateBefore: { type: String, enum: ['OFF_DUTY', 'ON_DUTY', 'ON_BREAK', 'UNKNOWN'], required: true },
    clockStateAfter: { type: String, enum: ['OFF_DUTY', 'ON_DUTY', 'ON_BREAK', 'UNKNOWN'], required: true },
    errorMessage: { type: String, default: null },
    screenshotPath: { type: String, default: null },
    durationMs: { type: Number, required: true },
  },
  { timestamps: false, versionKey: false },
);

actionAttemptSchema.index({ plannedActionId: 1, attemptNumber: 1 });
actionAttemptSchema.index({ userId: 1, startedAt: -1 });

export type ActionAttemptDoc = InferSchemaType<typeof actionAttemptSchema>;
export const ActionAttemptModel = model('ActionAttempt', actionAttemptSchema);

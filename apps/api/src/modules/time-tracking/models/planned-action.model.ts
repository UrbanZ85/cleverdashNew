import { Schema, model, type InferSchemaType } from 'mongoose';

// data-model.md: tekoči načrt. Unikatni indeks (localDate, profileId, actionName) je
// EDINI mehanizem, ki fizično onemogoči podvojen zapis, ne glede na to, koliko instanc
// tika teče vzporedno — docs/legacy-engine.md §4.3. Sestavljanje uporablja
// `updateOne(..., { upsert: true })` na tem ključu.
const plannedActionSchema = new Schema(
  {
    // 004: denormaliziran (ne samo prek profileId) — plan.md Complexity Tracking: neposreden
    // filter je varnejši od izpeljanega lastništva prek starša (SC-002).
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    localDate: { type: String, required: true }, // YYYY-MM-DD, Europe/Ljubljana
    profileId: { type: Schema.Types.ObjectId, ref: 'TrackingProfile', required: true },
    locationId: { type: Schema.Types.ObjectId, ref: 'TrackingLocation', required: true },
    actionName: { type: String, required: true },
    actionOrder: { type: Number, required: true },
    scheduledAt: { type: Date, required: true }, // UTC, že z vračunanim raztrosom
    baseLocalTime: { type: String, required: true },
    mode: { type: String, enum: ['AUTO', 'REMIND_ONLY', 'OFF'], required: true },
    state: {
      type: String,
      enum: ['planned', 'due', 'running', 'succeeded', 'failed', 'already_done', 'missed', 'skipped', 'cancelled'],
      default: 'planned',
    },
    attemptCount: { type: Number, default: 0 },
    nextAttemptAt: { type: Date, default: null },
    reminderCount: { type: Number, default: 0 },
    lastReminderAt: { type: Date, default: null },
    source: { type: String, enum: ['schedule', 'manual', 'api'], default: 'schedule' },
    stateBefore: { type: String, enum: ['OFF_DUTY', 'ON_DUTY', 'ON_BREAK', 'UNKNOWN'], default: null },
    stateAfter: { type: String, enum: ['OFF_DUTY', 'ON_DUTY', 'ON_BREAK', 'UNKNOWN'], default: null },
    completedAt: { type: Date, default: null },
    failureReason: { type: String, default: null },
    correlationId: { type: String, default: null },
  },
  { timestamps: true, versionKey: false },
);

plannedActionSchema.index({ localDate: 1, profileId: 1, actionName: 1 }, { unique: true });
plannedActionSchema.index({ userId: 1, state: 1, scheduledAt: 1 });
plannedActionSchema.index({ state: 1, nextAttemptAt: 1 });
plannedActionSchema.index({ userId: 1, localDate: -1 });

export type PlannedActionDoc = InferSchemaType<typeof plannedActionSchema>;
export const PlannedActionModel = model('PlannedAction', plannedActionSchema);

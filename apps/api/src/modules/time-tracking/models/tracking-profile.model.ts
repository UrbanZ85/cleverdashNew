import { Schema, model, type InferSchemaType } from 'mongoose';

// data-model.md: urniški profil. `actions` je seznam, NE fiksna polja (FR-002) — tako je
// mogoč dan brez malice ali z dvema odmoroma, brez spremembe sheme. `mode` privzeto `AUTO`
// (FR-007, odločitev 20. 8. 2026). 004: `userId` — več profilov ostaja os ZNOTRAJ ene osebe
// (komentar iz 002 drži še naprej), `userId` samo pove, KATERA oseba (research.md §5).
const actionPlanSchema = new Schema(
  {
    actionName: { type: String, required: true },
    localTime: {
      type: String,
      required: true,
      match: /^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/,
    },
    jitterSeconds: { type: Number, default: 300, min: 0, max: 3600 },
    order: { type: Number, required: true },
    enabled: { type: Boolean, default: true },
  },
  { _id: false },
);

const trackingProfileSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
    // ISO: 1 = ponedeljek … 7 = nedelja — NE Date.getDay() (0 = nedelja). Glej migracijsko
    // opozorilo v data-model.md.
    daysOfWeek: { type: [Number], required: true, validate: (v: number[]) => v.every((d) => d >= 1 && d <= 7) },
    locationId: { type: Schema.Types.ObjectId, ref: 'TrackingLocation', required: true },
    mode: { type: String, enum: ['AUTO', 'REMIND_ONLY', 'OFF'], default: 'AUTO' },
    actions: { type: [actionPlanSchema], default: [] },
    graceMinutes: { type: Number, default: 10 },
    maxDelayMinutes: { type: Number, default: 90 },
    maxAttempts: { type: Number, default: 3 },
    retryBackoffSeconds: { type: [Number], default: [30, 120, 300] },
    maxReminders: { type: Number, default: 3 },
    reminderIntervalMinutes: { type: Number, default: 10 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true, versionKey: false },
);

trackingProfileSchema.index({ userId: 1, active: 1 });
trackingProfileSchema.index({ userId: 1, daysOfWeek: 1 });

export type TrackingProfileDoc = InferSchemaType<typeof trackingProfileSchema>;
export const TrackingProfileModel = model('TrackingProfile', trackingProfileSchema);

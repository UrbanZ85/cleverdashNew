import { Schema, model, type InferSchemaType } from 'mongoose';

// data-model.md: najvišja prednost v odločitvi FR-014. `forceNonWorking` je simetrična
// razširitev `forceWorkday` (glej domain/calendar.ts) brez lastne uporabniške zgodbe.
const calendarOverrideSchema = new Schema(
  {
    // 004: denormaliziran — glej planned-action.model.ts.
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    localDate: { type: String, required: true },
    profileId: { type: Schema.Types.ObjectId, ref: 'TrackingProfile', default: null }, // null = vsi profili TEGA uporabnika
    kind: { type: String, enum: ['forceWorkday', 'forceNonWorking'], required: true },
    note: { type: String, default: null },
  },
  { timestamps: true, versionKey: false },
);

// 004: `userId` dodan v unikatni ključ — brez njega bi "profileId: null" (vsi profili)
// preprečil, da bi DVA RAZLIČNA uporabnika imela prekritje za isti datum.
calendarOverrideSchema.index({ userId: 1, localDate: 1, profileId: 1 }, { unique: true });

export type CalendarOverrideDoc = InferSchemaType<typeof calendarOverrideSchema>;
export const CalendarOverrideModel = model('CalendarOverride', calendarOverrideSchema);

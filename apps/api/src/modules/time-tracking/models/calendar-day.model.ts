import { Schema, model, type InferSchemaType } from 'mongoose';

// data-model.md: predpomnjena IZPELJANA odločitev — ni vir resnice (ta so holidays,
// absencePeriods, calendarOverrides in profil), ampak jo naredi vidno in revizijsko
// sledljivo (FR-015). Izračuna se NE GLEDE na `mode` profila (FR-008) — tudi za `OFF`
// profile, da je koledarski pregled smiseln in preklop nazaj v AUTO/REMIND_ONLY brez vrzeli.
const calendarDaySchema = new Schema(
  {
    // 004: denormaliziran — glej planned-action.model.ts.
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    localDate: { type: String, required: true },
    profileId: { type: Schema.Types.ObjectId, ref: 'TrackingProfile', required: true },
    status: {
      type: String,
      enum: ['workday', 'weekend', 'holiday', 'vacation', 'sick', 'other', 'forced'],
      required: true,
    },
    reason: { type: String, required: true },
    resolvedAt: { type: Date, default: () => new Date() },
  },
  { timestamps: false, versionKey: false },
);

calendarDaySchema.index({ localDate: 1, profileId: 1 }, { unique: true });
calendarDaySchema.index({ userId: 1, localDate: 1 });

export type CalendarDayDoc = InferSchemaType<typeof calendarDaySchema>;
export const CalendarDayModel = model('CalendarDay', calendarDaySchema);

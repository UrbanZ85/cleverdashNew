import { Schema, model, type InferSchemaType } from 'mongoose';

// data-model.md: `endDate` je VKLJUČEN — "od 1. do 15." pomeni, da je 15. še prost dan,
// najpogostejši vir napak za en dan pri tovrstnih modelih.
const absencePeriodSchema = new Schema(
  {
    // 004: denormaliziran — glej planned-action.model.ts.
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['vacation', 'sick', 'other'], required: true },
    startDate: { type: String, required: true }, // YYYY-MM-DD
    endDate: { type: String, required: true }, // YYYY-MM-DD, vključen
    note: { type: String, default: null },
    profileIds: { type: [Schema.Types.ObjectId], ref: 'TrackingProfile', default: null }, // null/prazno = vsi profili
  },
  { timestamps: true, versionKey: false },
);

absencePeriodSchema.index({ userId: 1, startDate: 1, endDate: 1 });

export type AbsencePeriodDoc = InferSchemaType<typeof absencePeriodSchema>;
export const AbsencePeriodModel = model('AbsencePeriod', absencePeriodSchema);

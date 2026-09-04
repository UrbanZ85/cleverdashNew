import { Schema, model, type InferSchemaType } from 'mongoose';

// data-model.md, research.md §5: `isHoliday` in `isWorkFree` sta ločeni polji — 17. avgust
// in 23. november sta praznika, ki NISTA dela prosta. Za urnik šteje samo `isWorkFree`.
// `source: manual` prevlada nad `computed` (FR-011).
const holidaySchema = new Schema(
  {
    date: { type: String, required: true }, // YYYY-MM-DD
    name: { type: String, required: true },
    isWorkFree: { type: Boolean, default: true },
    isHoliday: { type: Boolean, default: true },
    source: { type: String, enum: ['computed', 'manual', 'imported'], default: 'computed' },
  },
  { timestamps: true, versionKey: false },
);

holidaySchema.index({ date: 1 }, { unique: true });

export type HolidayDoc = InferSchemaType<typeof holidaySchema>;
export const HolidayModel = model('Holiday', holidaySchema);

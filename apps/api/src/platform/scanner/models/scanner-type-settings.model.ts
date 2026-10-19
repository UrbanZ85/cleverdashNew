import { Schema, model, type InferSchemaType } from 'mongoose';
import { SCHEDULE_PRESET_IDS } from '../types.js';

// data-model.md (016): urnik TIPA — en zapis na tip z batch izvajanjem (leti). Nasledil je
// `FlightSchedulerSettings` iz 015 (`key: 'default'` → `type: 'flights'`). Nastane ob prvem
// branju (`getOrCreateTypeSettings`), privzetek da tip (`ScannerType.defaultSchedule`).
//
// Zapis za tip, ki ni več registriran, ostane in ga tik ignorira — brisanje modula ne sme
// zahtevati čiščenja v jedru (člen I).

export const DEFAULT_TYPE_CRON_EXPRESSION = '0 6,18 * * *';
export const DEFAULT_TYPE_TIMEZONE = 'Europe/Ljubljana';

const scannerTypeSettingsSchema = new Schema(
  {
    type: { type: String, required: true },
    enabled: { type: Boolean, required: true, default: true },
    preset: { type: String, enum: SCHEDULE_PRESET_IDS, required: true, default: 'daily-06-18' },
    /** Pet polj, preverjen pred shranjevanjem (domain/schedule-slots.ts). */
    cronExpression: { type: String, required: true, default: DEFAULT_TYPE_CRON_EXPRESSION },
    timezone: { type: String, required: true, default: DEFAULT_TYPE_TIMEZONE },
    /** Zadnji termin, za katerega je zagon ŽE nastal; iz njega tik ugotovi zamujeni termin. */
    lastScheduledSlotAt: { type: Date, default: null },
    /** `req.actor` — človek za tipkovnico, ne prevzeto ime (012). */
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedAt: { type: Date, required: true },
  },
  { timestamps: false, versionKey: false },
);

scannerTypeSettingsSchema.index({ type: 1 }, { unique: true });

export type ScannerTypeSettingsDoc = InferSchemaType<typeof scannerTypeSettingsSchema>;
export const ScannerTypeSettingsModel = model('ScannerTypeSettings', scannerTypeSettingsSchema);

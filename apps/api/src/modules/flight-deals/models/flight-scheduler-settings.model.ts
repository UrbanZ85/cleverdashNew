import { Schema, model, type InferSchemaType } from 'mongoose';
import { SCHEDULE_PRESET_IDS } from '../domain/types.js';

// data-model.md (015): nastavitve urnika — EN zapis na namestitev (`key: 'default'`).
//
// Prva nastavitev v tej aplikaciji, ki velja za celo namestitev in jo nastavlja administrator v
// vmesniku (ne v okolju). Ni v `Settings` (ta je osebna, en dokument na uporabnika) in ni v env
// (sprememba mora veljati brez ponovnega zagona, FR-048). Singleton brez posebne logike: zapis
// nastane ob prvem branju (`getOrCreateSchedulerSettings`), kot `Settings` v 001.
//
// Urnik v bazi je tisto, kar členu V.1 ("baza je edini vir resnice") da pomen: tik ne nosi
// nobenega časovnika razen svojega intervala, vsak tik znova prebere ta zapis.

export const SCHEDULER_SETTINGS_KEY = 'default';
export const DEFAULT_CRON_EXPRESSION = '0 6,18 * * *';
export const DEFAULT_SCHEDULER_TIMEZONE = 'Europe/Ljubljana';

const flightSchedulerSettingsSchema = new Schema(
  {
    key: { type: String, required: true, default: SCHEDULER_SETTINGS_KEY },
    enabled: { type: Boolean, required: true, default: true },
    preset: { type: String, enum: SCHEDULE_PRESET_IDS, required: true, default: 'daily-06-18' },
    /** Pet polj, preverjen pred shranjevanjem (domain/schedule-slots.ts, FR-047). */
    cronExpression: { type: String, required: true, default: DEFAULT_CRON_EXPRESSION },
    timezone: { type: String, required: true, default: DEFAULT_SCHEDULER_TIMEZONE },
    /** Zadnji termin, za katerega je zagon ŽE nastal — iz njega tik ugotovi zamujeni termin
     * (FR-051). Posodobi se ob USTVARJANJU zagona, ne ob koncu, da restart sredi zagona ne
     * ustvari drugega zagona za isti termin. */
    lastScheduledSlotAt: { type: Date, default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedAt: { type: Date, required: true },
  },
  { timestamps: false, versionKey: false },
);

flightSchedulerSettingsSchema.index({ key: 1 }, { unique: true });

export type FlightSchedulerSettingsDoc = InferSchemaType<typeof flightSchedulerSettingsSchema>;
export const FlightSchedulerSettingsModel = model('FlightSchedulerSettings', flightSchedulerSettingsSchema);

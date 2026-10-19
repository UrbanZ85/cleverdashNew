import { Schema, model, type InferSchemaType } from 'mongoose';
import { DEFINITION_OUTCOMES, NOTIFICATION_MODES, SCHEDULE_MODES, SCHEDULE_PRESET_IDS } from '../types.js';

// data-model.md (016): skener — lastnikova opredelitev enega preverjanja, za tipe z GENERIČNO
// shrambo definicij (echo, bodoči tipi). Tip z lastnimi definicijami (leti: `FlightSearchRule`)
// sem NE piše; svoje vrstice prispeva na seznam prek `ScannerType.definitions` (research.md §3).
//
// Polje lastnika je `userId`: zaseben zapis, `{ _id, userId }` je pogoj vsakega dostopa (004).
// Prejemnikov tu ni — deljenje je lastnost tipa, ne jedra (spec, Out of Scope).
//
// `config` je `Mixed` NAMENOMA: obliko pozna samo tip in jo preveri s svojo Zod shemo ob vsakem
// pisanju (`services/definition-access.service.ts`); jedro vanj nikoli ne gleda. Vsebina je samo
// JSON (domain/definition-input.ts) — nič izvršljivega (FR-005).

const scheduleSchema = new Schema(
  {
    /** `own` = lasten izraz (tipi z izvajanjem na skener); `type` = urnik tipa (rezervirano). */
    mode: { type: String, enum: SCHEDULE_MODES, required: true, default: 'own' },
    preset: { type: String, enum: SCHEDULE_PRESET_IDS, required: true },
    /** Pet polj, preverjen pred shranjevanjem (domain/schedule-slots.ts). */
    cronExpression: { type: String, required: true },
    timezone: { type: String, required: true, default: 'Europe/Ljubljana' },
    /** Pokrito do: zadnji termin, za katerega je zagon ŽE nastal; premakne se ob spremembi
     * izraza ali cone, da nov urnik ne dohiti termina iz starega dneva. */
    lastScheduledSlotAt: { type: Date, default: null },
  },
  { _id: false },
);

const notificationsSchema = new Schema(
  {
    enabled: { type: Boolean, required: true, default: true },
    /** Edini način v 016; polje obstaja, da bodoči način ne zahteva migracije. */
    mode: { type: String, enum: NOTIFICATION_MODES, required: true, default: 'all-changes' },
  },
  { _id: false },
);

const statusSchema = new Schema(
  {
    lastRunId: { type: Schema.Types.ObjectId, ref: 'ScannerRun', default: null },
    lastRunAt: { type: Date, default: null },
    lastOutcome: { type: String, enum: [...DEFINITION_OUTCOMES, null], default: null },
    /** Slovensko, brez skrivnosti. */
    message: { type: String, default: null },
    lastSuccessAt: { type: Date, default: null },
  },
  { _id: false },
);

const scannerDefinitionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, maxlength: 80 },
    /** Oznaka registriranega tipa; tip lahko iz namestitve izgine — zapis ostane (FR-011). */
    type: { type: String, required: true },
    enabled: { type: Boolean, required: true, default: true },
    /** Analiza rezultatov z umetno inteligenco (017): vklop na skener, privzeto IZKLOPLJENO (plačljivo). */
    aiEnabled: { type: Boolean, required: true, default: false },
    schedule: { type: scheduleSchema, required: true },
    notifications: { type: notificationsSchema, required: true, default: () => ({}) },
    config: { type: Schema.Types.Mixed, required: true, default: () => ({}) },
    status: { type: statusSchema, required: true, default: () => ({}) },
  },
  { timestamps: true, versionKey: false },
);

// Moji skenerji: `{ userId }` + razvrstitev po zadnji spremembi — `updatedAt` na KONCU, da Mongo
// ne ureja v pomnilniku (ista opomba kot pri `flightSearchRuleSchema`).
scannerDefinitionSchema.index({ userId: 1, updatedAt: -1 });
// Tik: zapadle definicije enega tipa.
scannerDefinitionSchema.index({ type: 1, enabled: 1 });
// Meja na uporabnika in tip.
scannerDefinitionSchema.index({ userId: 1, type: 1 });

export type ScannerDefinitionDoc = InferSchemaType<typeof scannerDefinitionSchema>;
export const ScannerDefinitionModel = model('ScannerDefinition', scannerDefinitionSchema);

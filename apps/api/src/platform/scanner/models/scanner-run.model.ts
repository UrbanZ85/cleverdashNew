import { Schema, model, type InferSchemaType } from 'mongoose';
import { DEFINITION_OUTCOMES, RUN_SCOPE_KINDS, RUN_STATUSES, RUN_TRIGGERS } from '../types.js';

// data-model.md (016): en zagon. Nasledil je `FlightSearchRun` iz 015 z dvema novima poljema:
// `scannerType` in `scope` (cel tip ali en skener).
//
// `slotKey` je ZAPORA pred podvajanjem (FR-016, člen V.3): `schedule:type:<tip>:<termin v coni>`,
// `schedule:def:<id>:<termin v coni>` ali `manual:<ObjectId zagona>`. Dva izvoda aplikacije, ki ob
// istem tiku izračunata isti termin istega obsega, poskusita vstaviti isti ključ — drugi dobi
// E11000 in ga obravnava kot "že prevzet" (services/scheduler.service.ts). Obseg je v ključu, da
// imata dva tipa z istim izrazom vsak svoj termin. Zapore v pomnilniku ali ločene zbirke
// ključavnic ni (člen V.1).
//
// Prehodi stanja: queued → running → succeeded | partial | failed | cancelled; running brez
// utripa → interrupted (ob naslednjem tiku, FR-018). Prevzem `queued → running` je
// `findOneAndUpdate` s stanjem v filtru — isti vzorec kot `PlannedAction` v 002.
//
// `counters` je `Map`, ne fiksna shema: tip prispeva SVOJA imena števcev (leti osem), jedro doda
// `definitions` in `notifications*`. Fiksna shema z vsemi števci vseh tipov bi bila `switch` po
// tipu v modelu (plan.md, Complexity Tracking).

export const MAX_RUN_ERRORS = 100;

const scopeSchema = new Schema(
  {
    kind: { type: String, enum: RUN_SCOPE_KINDS, required: true },
    /** Pri `definition`. */
    definitionId: { type: Schema.Types.ObjectId, default: null },
    /** Lastnik skenerja pri `definition` — OZNAKA za pravico ogleda zagona, ne pogoj dostopa
     * (zagon je namestitveni zapis; glej tests/unit/no-owner-fields.spec.ts). */
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { _id: false },
);

const definitionOutcomeSchema = new Schema(
  {
    definitionId: { type: Schema.Types.ObjectId, required: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    outcome: { type: String, enum: DEFINITION_OUTCOMES, required: true },
    /** Slovensko, brez skrivnosti in brez e-naslovov. */
    message: { type: String, default: null },
  },
  { _id: false },
);

const runErrorSchema = new Schema(
  {
    at: { type: Date, required: true },
    definitionId: { type: Schema.Types.ObjectId, default: null },
    code: { type: String, required: true },
    /** Brez skrivnosti in brez e-naslovov (FR-019). */
    message: { type: String, required: true },
  },
  { _id: false },
);

const scannerRunSchema = new Schema(
  {
    scannerType: { type: String, required: true },
    scope: { type: scopeSchema, required: true },
    slotKey: { type: String, required: true },
    trigger: { type: String, enum: RUN_TRIGGERS, required: true },
    /** Človek pri ročnem zagonu — `req.actor`, ker gre za dejanje človeka, ne lastnika podatkov. */
    requestedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    status: { type: String, enum: RUN_STATUSES, required: true, default: 'queued' },
    /** Termin iz urnika; `null` pri ročnem. */
    scheduledFor: { type: Date, default: null },
    createdAt: { type: Date, required: true },
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
    /** Tip ga posodablja med delom (`ctx.heartbeat()`); star `running` → `interrupted`. */
    heartbeatAt: { type: Date, required: true },
    cancelRequested: { type: Boolean, required: true, default: false },
    counters: { type: Map, of: Number, default: () => new Map() },
    /** Izid na skener (FR-017); pri `batch` ena vrstica na obdelan skener. */
    definitions: { type: [definitionOutcomeSchema], default: [] },
    /** Dodatek tipa za admin (leti: izidi po virih). Brez skrivnosti. */
    extras: { type: Schema.Types.Mixed, default: null },
    /** `runErrors`, ne `errors`: slednje je rezervirano ime poti v Mongoose. V odgovoru API-ja je
     * polje `errors` (pogodba). */
    runErrors: { type: [runErrorSchema], default: [] },
    /** `createdAt` + SCANNER_RUN_RETENTION_DAYS → TTL. */
    expiresAt: { type: Date, required: true },
  },
  { timestamps: false, versionKey: false },
);

scannerRunSchema.index({ slotKey: 1 }, { unique: true });
// Reclaim prekinjenih in "ali kaj teče".
scannerRunSchema.index({ status: 1, heartbeatAt: 1 });
// Admin po tipu, `latestFinishedRun(type)`.
scannerRunSchema.index({ scannerType: 1, createdAt: -1 });
// Zagoni enega skenerja.
scannerRunSchema.index({ 'scope.definitionId': 1, createdAt: -1 });
scannerRunSchema.index({ createdAt: -1 });
scannerRunSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type ScannerRunDoc = InferSchemaType<typeof scannerRunSchema>;
export const ScannerRunModel = model('ScannerRun', scannerRunSchema);

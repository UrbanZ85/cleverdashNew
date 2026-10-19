import { Schema, model, type InferSchemaType } from 'mongoose';
import { PROVIDER_IDS, RUN_STATUSES, RUN_TRIGGERS } from '../domain/types.js';

// data-model.md (015): eno preverjanje.
//
// `slotKey` je ZAPORA pred podvajanjem (FR-050, člen V.3): `schedule:<ISO termina v coni urnika>`
// ali `manual:<ObjectId zagona>`. Dva izvoda aplikacije, ki ob istem tiku izračunata isti
// termin, poskusita vstaviti isti ključ — drugi dobi E11000 in ga obravnava kot "že prevzet"
// (services/tick.ts). Zapore v pomnilniku ali ločene zbirke ključavnic ni (člen V.1).
//
// Prehodi stanja (data-model.md): queued → running → succeeded | partial | failed | cancelled;
// running brez utripa → interrupted (ob naslednjem tiku, FR-051). Prevzem `queued → running` je
// `findOneAndUpdate` s stanjem v filtru — isti vzorec kot `PlannedAction` v 002.

export const MAX_RUN_ERRORS = 100;

const runErrorSchema = new Schema(
  {
    at: { type: Date, required: true },
    providerId: { type: String, enum: PROVIDER_IDS, default: null },
    ruleId: { type: Schema.Types.ObjectId, default: null },
    code: { type: String, required: true },
    /** Brez skrivnosti in brez e-naslovov (FR-054). */
    message: { type: String, required: true },
  },
  { _id: false },
);

const providerTallySchema = new Schema(
  {
    providerId: { type: String, enum: PROVIDER_IDS, required: true },
    enabled: { type: Boolean, required: true },
    ok: { type: Number, required: true, default: 0 },
    noFlights: { type: Number, required: true, default: 0 },
    unsupported: { type: Number, required: true, default: 0 },
    unreachable: { type: Number, required: true, default: 0 },
    rateLimited: { type: Number, required: true, default: 0 },
    incomplete: { type: Number, required: true, default: 0 },
  },
  { _id: false },
);

const flightSearchRunSchema = new Schema(
  {
    slotKey: { type: String, required: true },
    trigger: { type: String, enum: RUN_TRIGGERS, required: true },
    /** Admin pri ročnem zagonu — `req.actor`, ker gre za dejanje človeka, ne lastnika podatkov. */
    requestedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    status: { type: String, enum: RUN_STATUSES, required: true, default: 'queued' },
    /** Termin iz urnika; `null` pri ročnem. */
    scheduledFor: { type: Date, default: null },
    createdAt: { type: Date, required: true },
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
    /** Zagon ga posodablja po vsakem iskanju; star `running` → `interrupted`. */
    heartbeatAt: { type: Date, required: true },
    cancelRequested: { type: Boolean, required: true, default: false },
    counters: {
      rules: { type: Number, required: true, default: 0 },
      queries: { type: Number, required: true, default: 0 },
      /** Dejanski klici na vire — manj od `queries`, kadar predpomnilnik zadene. */
      providerRequests: { type: Number, required: true, default: 0 },
      offersSeen: { type: Number, required: true, default: 0 },
      newMatches: { type: Number, required: true, default: 0 },
      priceDrops: { type: Number, required: true, default: 0 },
      priceRises: { type: Number, required: true, default: 0 },
      unavailable: { type: Number, required: true, default: 0 },
      notificationsPending: { type: Number, required: true, default: 0 },
      notificationsSent: { type: Number, required: true, default: 0 },
      notificationsSuppressed: { type: Number, required: true, default: 0 },
      notificationsFailed: { type: Number, required: true, default: 0 },
    },
    providers: { type: [providerTallySchema], default: [] },
    /** `runErrors`, ne `errors`: slednje je rezervirano ime poti v Mongoose (validacijske napake dokumenta).
     * V odgovoru API-ja je polje `errors` (pogodba). */
    runErrors: { type: [runErrorSchema], default: [] },
    /** `createdAt` + FLIGHT_RUN_RETENTION_DAYS → TTL. */
    expiresAt: { type: Date, required: true },
  },
  { timestamps: false, versionKey: false },
);

flightSearchRunSchema.index({ slotKey: 1 }, { unique: true });
// Reclaim prekinjenih in "ali kaj teče".
flightSearchRunSchema.index({ status: 1, heartbeatAt: 1 });
flightSearchRunSchema.index({ createdAt: -1 });
flightSearchRunSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type FlightSearchRunDoc = InferSchemaType<typeof flightSearchRunSchema>;
export const FlightSearchRunModel = model('FlightSearchRun', flightSearchRunSchema);

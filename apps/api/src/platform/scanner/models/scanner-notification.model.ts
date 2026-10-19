import { Schema, model, type InferSchemaType } from 'mongoose';
import { NOTIFIABLE_CHANGE_TYPES, NOTIFICATION_CHANNELS, NOTIFICATION_STATUSES, SUPPRESSED_REASONS } from '../types.js';

// data-model.md (016): en zbirni dopis enemu prejemniku za en zagon — OUTBOX. Nasledil je
// `FlightNotification` iz 015; razlika je `scannerType` (izbira kavljev `verify`/`render` ob
// pošiljanju) in postavka s `payload`, katerega obliko pozna samo tip.
//
// Zagon dopisa NE pošlje sam: ustvari zapis `pending`, pošilja pa tik z atomarnim prevzemom
// (`pending → sending`) in ponovitvami z naraščajočim zamikom — isti vzorec kot
// `platform/webhooks/dispatcher.service.ts`. Padec procesa med pošiljanjem tako ne izgubi
// dopisa; dvojni dopis prepreči unikatni indeks `(recipientUserId, runId)` (FR-028).
//
// E-naslov prejemnika se NE shrani: prebere se ob pošiljanju iz `User` prek
// `platform/users/readUserEmails` in gre samo v poštno sejo (FR-033). `definitionName` in
// `ownerName` sta POSNETKA — skener je lahko preimenovan ali izbrisan, preden ponovitev uspe.

const notificationItemSchema = new Schema(
  {
    definitionId: { type: Schema.Types.ObjectId, required: true },
    definitionName: { type: String, required: true },
    /** Samo pri deljenem skenerju (prejemnik ni lastnik); pri lastnem `null`. */
    ownerName: { type: String, default: null },
    /** Id rezultata — v generični shrambi `ScannerResult`, pri letih `FlightOffer`. */
    resultRef: { type: String, required: true },
    changeType: { type: String, enum: NOTIFIABLE_CHANGE_TYPES, required: true },
    /** Posnetek, ki ga sestavi tip in ga `verify` dobi nazaj. */
    payload: { type: Schema.Types.Mixed, default: null },
  },
  { _id: false },
);

const scannerNotificationSchema = new Schema(
  {
    recipientUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    runId: { type: Schema.Types.ObjectId, ref: 'ScannerRun', required: true },
    scannerType: { type: String, required: true },
    /** Rezervirano za drugi kanal (FR-034); v 016 vedno `email`. */
    channel: { type: String, enum: NOTIFICATION_CHANNELS, required: true, default: 'email' },
    items: { type: [notificationItemSchema], default: [] },
    status: { type: String, enum: NOTIFICATION_STATUSES, required: true, default: 'pending' },
    suppressedReason: { type: String, enum: [...SUPPRESSED_REASONS, null], default: null },
    attemptCount: { type: Number, required: true, default: 0 },
    /** Kdaj sme naslednji poskus; `null` pri končnih stanjih. */
    nextAttemptAt: { type: Date, default: null },
    /** Kdaj je bil zapis prevzet v `sending` — za vračanje obtičalih v `pending`. */
    sendingSince: { type: Date, default: null },
    sentAt: { type: Date, default: null },
    messageId: { type: String, default: null },
    /** Brez naslovov in skrivnosti. */
    lastError: { type: String, default: null },
    createdAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: false, versionKey: false },
);

// En dopis na prejemnika na zagon — tudi ob ponovitvi sestavljanja.
scannerNotificationSchema.index({ recipientUserId: 1, runId: 1 }, { unique: true });
// Outbox: kaj je zrelo za pošiljanje.
scannerNotificationSchema.index({ status: 1, nextAttemptAt: 1 });
scannerNotificationSchema.index({ runId: 1 });
scannerNotificationSchema.index({ scannerType: 1, createdAt: -1 });
scannerNotificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type ScannerNotificationDoc = InferSchemaType<typeof scannerNotificationSchema>;
export const ScannerNotificationModel = model('ScannerNotification', scannerNotificationSchema);

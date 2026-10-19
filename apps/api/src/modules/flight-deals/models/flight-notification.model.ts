import { Schema, model, type InferSchemaType } from 'mongoose';
import { CHANGE_TYPES, NOTIFICATION_STATUSES, SUPPRESSED_REASONS } from '../domain/types.js';

// data-model.md (015): en zbirni dopis enemu prejemniku za eno izvajanje — OUTBOX.
//
// Zagon dopisa NE pošlje sam: ustvari zapis `pending`, pošilja pa tik z atomarnim prevzemom
// (`pending → sending`) in ponovitvami z naraščajočim zamikom — isti vzorec kot
// `platform/webhooks/dispatcher.service.ts`. Padec procesa med pošiljanjem tako ne izgubi
// dopisa; dvojni dopis prepreči unikatni indeks `(recipientUserId, runId)` (FR-034, SC-004).
//
// E-naslov prejemnika se NE shrani: prebere se ob pošiljanju iz `User` prek
// `platform/users/readUserEmails` in gre samo v poštno sejo (FR-044). `ruleName` in
// `ruleOwnerName` sta POSNETKA — iskanje je lahko preimenovano ali izbrisano, preden ponovitev
// uspe, dopis pa mora biti še vedno sestavljiv.

const moneySchema = new Schema(
  {
    amount: { type: Number, required: true },
    currency: { type: String, required: true },
  },
  { _id: false },
);

const notificationItemSchema = new Schema(
  {
    ruleId: { type: Schema.Types.ObjectId, ref: 'FlightSearchRule', required: true },
    ruleName: { type: String, required: true },
    /** Samo pri deljenem iskanju (prejemnik ni lastnik); pri lastnem `null`. */
    ruleOwnerName: { type: String, default: null },
    offerId: { type: Schema.Types.ObjectId, ref: 'FlightOffer', required: true },
    changeType: { type: String, enum: CHANGE_TYPES, required: true },
    price: { type: moneySchema, required: true },
    previousPrice: { type: moneySchema, default: null },
  },
  { _id: false },
);

const flightNotificationSchema = new Schema(
  {
    recipientUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    runId: { type: Schema.Types.ObjectId, ref: 'FlightSearchRun', required: true },
    items: { type: [notificationItemSchema], default: [] },
    status: { type: String, enum: NOTIFICATION_STATUSES, required: true, default: 'pending' },
    suppressedReason: { type: String, enum: SUPPRESSED_REASONS, default: null },
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
flightNotificationSchema.index({ recipientUserId: 1, runId: 1 }, { unique: true });
// Outbox: kaj je zrelo za pošiljanje.
flightNotificationSchema.index({ status: 1, nextAttemptAt: 1 });
flightNotificationSchema.index({ recipientUserId: 1, createdAt: -1 });
flightNotificationSchema.index({ runId: 1 });
flightNotificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type FlightNotificationDoc = InferSchemaType<typeof flightNotificationSchema>;
export const FlightNotificationModel = model('FlightNotification', flightNotificationSchema);

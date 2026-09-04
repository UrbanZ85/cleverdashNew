import { Schema, model, type InferSchemaType } from 'mongoose';

// data-model.md, FR-072/FR-073: 001 obvestila pošilja, a jih ni beležila trajno. Živi v
// platform/notifications/, ne v modules/time-tracking/, ker je to splošna zmogljivost
// dnevniškega beleženja dostave, uporabna tudi za obvestila iz drugih modulov (člen I).
const notificationRecordSchema = new Schema(
  {
    type: { type: String, enum: ['reminder', 'confirmation', 'failure', 'health', 'session'], required: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    deviceId: { type: Schema.Types.ObjectId, ref: 'Device', default: null },
    plannedActionId: { type: Schema.Types.ObjectId, ref: 'PlannedAction', default: null },
    deliveryStatus: { type: String, enum: ['sent', 'failed', 'suppressed'], required: true },
    error: { type: String, default: null },
    // FR-073: en dedupeKey na (plannedActionId, tip, interval opozarjanja) — preprečuje
    // dve vsebinsko enaki obvestili za isto akcijo v istem intervalu.
    dedupeKey: { type: String, required: true },
  },
  { timestamps: true, versionKey: false },
);

notificationRecordSchema.index({ dedupeKey: 1, createdAt: -1 });
notificationRecordSchema.index({ createdAt: -1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 }); // TTL 90 dni — operativni dnevnik, ne evidenca

export type NotificationRecordDoc = InferSchemaType<typeof notificationRecordSchema>;
export const NotificationRecordModel = model('NotificationRecord', notificationRecordSchema);

import { Schema, model, type InferSchemaType } from 'mongoose';

// data-model.md: naprava, registrirana za potisna obvestila. Nosi `userId`, ker je
// naprava vezana na prijavo (FR-017) — uporabnik je predmet zapisa, ne njegov lastnik v
// smislu FR-016 (glej data-model.md, "Načelo lastništva zapisov").
const deviceSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    pushToken: { type: String, required: true, unique: true },
    platform: { type: String, enum: ['web', 'android'], required: true },
    channels: { type: [String], default: ['system'] },
    lastSeenAt: { type: Date, default: () => new Date() },
    lastDeliveryAt: { type: Date, default: null },
    failureCount: { type: Number, default: 0 },
  },
  { versionKey: false },
);

deviceSchema.index({ userId: 1 });

export type DeviceDoc = InferSchemaType<typeof deviceSchema>;
export const DeviceModel = model('Device', deviceSchema);

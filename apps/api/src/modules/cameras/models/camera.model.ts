import { Schema, model, type InferSchemaType } from 'mongoose';

// data-model.md, "cameras". 004: `userId` — kamere so zdaj osebni podatek (research.md §5),
// v nasprotju s prejšnjim enouporabniškim FR-038. `credentialsEncrypted` je AES-256-GCM prek
// `platform/crypto/secret-box.ts` (FR-005) — nikoli golo besedilo, nikoli vrnjeno prek
// API-ja (glej router.ts, `toResponse`).
const cameraSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
    type: {
      type: String,
      enum: ['snapshot', 'mjpeg', 'hls', 'iframe', 'snapshot+iframe'],
      required: true,
    },
    previewUrl: { type: String, required: true },
    fullUrl: { type: String, default: null },
    refreshIntervalSeconds: { type: Number, default: 30 },
    groupId: { type: Schema.Types.ObjectId, ref: 'CameraGroup', default: null },
    timeOfDay: { type: String, enum: ['morning', 'afternoon', 'always'], default: 'always' },
    order: { type: Number, required: true },
    active: { type: Boolean, default: true },
    credentialsEncrypted: { type: String, default: null },
    sourceTemplate: { type: String, enum: ['manual', 'arso-webcam'], default: 'manual' },
  },
  { timestamps: true, versionKey: false },
);

cameraSchema.index({ userId: 1, groupId: 1, order: 1 });
cameraSchema.index({ userId: 1, active: 1 });

export type CameraDoc = InferSchemaType<typeof cameraSchema>;
export const CameraModel = model('Camera', cameraSchema);

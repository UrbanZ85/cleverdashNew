import { Schema, model, type InferSchemaType } from 'mongoose';

// data-model.md, "cameraEmbedAllowlist". Razširitev osnovnega seznama iz
// `CAMERA_ALLOWED_EMBED_HOSTS` (research.md §6) — gostitelji, ki jih je uporabnik izrecno
// odobril prek zaslona za urejanje (POST /cameras/embed-hosts).
const cameraEmbedAllowlistSchema = new Schema(
  {
    host: { type: String, required: true, unique: true },
    addedReason: { type: String, default: null },
  },
  { timestamps: true, versionKey: false },
);

export type CameraEmbedAllowlistDoc = InferSchemaType<typeof cameraEmbedAllowlistSchema>;
export const CameraEmbedAllowlistModel = model('CameraEmbedAllowlist', cameraEmbedAllowlistSchema);

import { Schema, model, type InferSchemaType } from 'mongoose';

// data-model.md, "cameraGroups". FR-015. 004: `userId` — kamere so zdaj osebni podatek
// (research.md §5), skupine kamer z njimi.
const cameraGroupSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
    order: { type: Number, required: true },
    collapsed: { type: Boolean, default: false },
  },
  { timestamps: true, versionKey: false },
);

cameraGroupSchema.index({ userId: 1, order: 1 });

export type CameraGroupDoc = InferSchemaType<typeof cameraGroupSchema>;
export const CameraGroupModel = model('CameraGroup', cameraGroupSchema);

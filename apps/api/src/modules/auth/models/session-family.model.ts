import { Schema, model, type InferSchemaType } from 'mongoose';

// data-model.md: ena družina na napravo. FR-017 — preklic ene družine ne vpliva na druge.
const sessionFamilySchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    deviceLabel: { type: String, default: 'Neznana naprava' },
    platform: { type: String, enum: ['web', 'android'], required: true },
    state: { type: String, enum: ['active', 'revoked'], default: 'active' },
    revokedReason: {
      type: String,
      enum: ['logout', 'reuseDetected', 'expired', null],
      default: null,
    },
    lastUsedAt: { type: Date, default: () => new Date() },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

sessionFamilySchema.index({ userId: 1 });
sessionFamilySchema.index({ state: 1 });

export type SessionFamilyDoc = InferSchemaType<typeof sessionFamilySchema>;
export const SessionFamilyModel = model('SessionFamily', sessionFamilySchema);

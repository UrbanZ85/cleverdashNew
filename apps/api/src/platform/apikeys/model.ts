import { Schema, model, type InferSchemaType } from 'mongoose';

// data-model.md: ključ brez obsegov ne sme obstajati — obseg je bistvo omejenosti ključa
// (člen III). Preklic je `revokedAt`, ne brisanje, da ostane sled v dnevniku.
const apiKeySchema = new Schema(
  {
    label: { type: String, required: true },
    keyHash: { type: String, required: true, unique: true },
    keyPrefix: { type: String, required: true },
    scopes: {
      type: [String],
      required: true,
      validate: {
        validator: (v: string[]) => Array.isArray(v) && v.length > 0,
        message: 'Ključ brez obsegov ni dovoljen (člen III).',
      },
    },
    lastUsedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: false, versionKey: false },
);

apiKeySchema.index({ keyPrefix: 1 });

export type ApiKeyDoc = InferSchemaType<typeof apiKeySchema>;
export const ApiKeyModel = model('ApiKey', apiKeySchema);

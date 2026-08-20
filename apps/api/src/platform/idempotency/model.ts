import { Schema, model, type InferSchemaType } from 'mongoose';

// data-model.md: hrama 24 h. TTL indeks je tu PRAVILEN (nasprotno od externalCache) — star
// idempotentni zapis nima uporabne vrednosti.
const idempotencyKeySchema = new Schema(
  {
    key: { type: String, required: true },
    endpoint: { type: String, required: true },
    requestHash: { type: String, required: true },
    statusCode: { type: Number, required: true },
    responseBody: { type: Schema.Types.Mixed },
    createdAt: { type: Date, default: () => new Date(), expires: '24h' },
  },
  { versionKey: false },
);

idempotencyKeySchema.index({ key: 1, endpoint: 1 }, { unique: true });

export type IdempotencyKeyDoc = InferSchemaType<typeof idempotencyKeySchema>;
export const IdempotencyKeyModel = model('IdempotencyKey', idempotencyKeySchema);

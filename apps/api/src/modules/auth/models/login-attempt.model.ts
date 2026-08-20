import { Schema, model, type InferSchemaType } from 'mongoose';

// data-model.md: TTL indeks je tu pravilen (nasprotno od externalCache) — star poskus
// prijave nima uporabne vrednosti po 30 dneh.
const loginAttemptSchema = new Schema(
  {
    email: { type: String, required: true, lowercase: true },
    ipHash: { type: String, required: true },
    success: { type: Boolean, required: true },
    attemptedAt: { type: Date, default: () => new Date(), expires: '30d' },
  },
  { versionKey: false },
);

loginAttemptSchema.index({ email: 1, attemptedAt: 1 });

export type LoginAttemptDoc = InferSchemaType<typeof loginAttemptSchema>;
export const LoginAttemptModel = model('LoginAttempt', loginAttemptSchema);

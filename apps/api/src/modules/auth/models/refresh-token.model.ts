import { Schema, model, type InferSchemaType } from 'mongoose';

// data-model.md: veriga rotirajočih žetonov. Delni unikatni indeks zagotavlja največ en
// aktiven žeton na družino — brez njega je zaznava zlorabe (FR-012) brez pomena, ker bi
// bilo v družini lahko več "veljavnih" žetonov hkrati.
const refreshTokenSchema = new Schema(
  {
    familyId: { type: Schema.Types.ObjectId, ref: 'SessionFamily', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    tokenHash: { type: String, required: true, unique: true },
    state: { type: String, enum: ['active', 'used', 'revoked'], default: 'active' },
    replacedBy: { type: Schema.Types.ObjectId, ref: 'RefreshToken', default: null },
    issuedAt: { type: Date, default: () => new Date() },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
  },
  { versionKey: false },
);

refreshTokenSchema.index(
  { familyId: 1, state: 1 },
  { unique: true, partialFilterExpression: { state: 'active' } },
);
refreshTokenSchema.index({ familyId: 1 });
refreshTokenSchema.index({ expiresAt: 1 });

export type RefreshTokenDoc = InferSchemaType<typeof refreshTokenSchema>;
export const RefreshTokenModel = model('RefreshToken', refreshTokenSchema);

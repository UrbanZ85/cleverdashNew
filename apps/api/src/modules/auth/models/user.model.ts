import { Schema, model, type InferSchemaType } from 'mongoose';

// data-model.md: edini uporabnik sistema (FR-016). Ne nosi lastnika — je lastnik.
const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    scopes: { type: [String], default: ['admin'] },
    mustChangePassword: { type: Boolean, default: true },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);

export type UserDoc = InferSchemaType<typeof userSchema>;
export const UserModel = model('User', userSchema);

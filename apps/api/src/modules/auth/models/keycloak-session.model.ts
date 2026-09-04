import { Schema, model, type InferSchemaType } from 'mongoose';

// data-model.md "KeycloakSession" (004): nadomesti SessionFamily + RefreshToken. Za razliko
// od prejšnjega modela rotacijo obnovitvenega žetona izvaja Keycloak sam (research.md §2) —
// ta zapis hrani samo TRENUTNO veljavno šifrirano vrednost, ne verigo `used`/`replacedBy`.
const keycloakSessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    deviceLabel: { type: String, default: 'Neznana naprava' },
    platform: { type: String, enum: ['web', 'android'], required: true },
    // AES-256-GCM prek platform/crypto/secret-box.ts (ponovna uporaba iz 003), NIKOLI golo
    // besedilo na disku — glej session.service.ts.
    encryptedRefreshToken: { type: String, required: true },
    state: { type: String, enum: ['active', 'revoked'], default: 'active' },
    lastUsedAt: { type: Date, default: () => new Date() },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

keycloakSessionSchema.index({ userId: 1 });
keycloakSessionSchema.index({ state: 1 });

export type KeycloakSessionDoc = InferSchemaType<typeof keycloakSessionSchema>;
export const KeycloakSessionModel = model('KeycloakSession', keycloakSessionSchema);

import { Schema, model, type InferSchemaType } from 'mongoose';

// data-model.md: seja pri delodajalcu. Ločena od lokacije, ker se en piškotek lahko
// uporabi za več lokacij in ker se menja pogosto, neodvisno od vsega ostalega (FR-091).
// `cookieValue` je občutljivo — middleware odgovorov ga MORA odstraniti iz vsakega JSON
// izhoda razen ob internem branju (FR-092). 004: `userId` — osebni podatek (research.md §5).
const remoteSessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
    cookieName: { type: String, required: true },
    cookieValue: { type: String, required: true },
    cookieDomain: { type: String, required: true },
    expiresAt: { type: Date, default: null },
    status: { type: String, enum: ['active', 'expiring', 'expired', 'unknown'], default: 'unknown' },
    lastVerifiedAt: { type: Date, default: null },
    lastVerifyError: { type: String, default: null },
  },
  { timestamps: true, versionKey: false },
);

remoteSessionSchema.index({ userId: 1, status: 1, expiresAt: 1 });

export type RemoteSessionDoc = InferSchemaType<typeof remoteSessionSchema>;
export const RemoteSessionModel = model('RemoteSession', remoteSessionSchema);

/** Maskira vrednost piškotka za API odgovore — FR-092: nikoli v celoti. */
export function maskCookieValue(value: string): string {
  if (value.length <= 8) return '••••';
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

import { Schema, model, type InferSchemaType } from 'mongoose';

// data-model.md, research.md §8 "Integracijska podrobnost": 001 je imela samo modulsko
// spremenljivko v pomnilniku, brez zgodovine. Ta kolekcija naredi zdravje vidno tudi TAKOJ
// po restartu API procesa, preden je nov tik sploh minil. TTL 14 dni — operativni dnevnik.
const heartbeatSchema = new Schema(
  {
    tickAt: { type: Date, required: true },
    durationMs: { type: Number, required: true },
    plansBuilt: { type: Number, default: 0 },
    actionsProcessed: { type: Number, default: 0 },
    errors: { type: Number, default: 0 },
    externalPingOk: { type: Boolean, default: false },
  },
  { timestamps: false, versionKey: false },
);

heartbeatSchema.index({ tickAt: -1 }, { expireAfterSeconds: 60 * 60 * 24 * 14 });

export type HeartbeatDoc = InferSchemaType<typeof heartbeatSchema>;
export const HeartbeatModel = model('Heartbeat', heartbeatSchema);

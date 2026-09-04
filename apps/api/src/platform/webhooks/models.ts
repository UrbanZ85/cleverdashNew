import { Schema, model, type InferSchemaType } from 'mongoose';

// data-model.md, research.md §7, FR-083: izhodni webhooki ob dogodkih — splošen
// mehanizem v platform/, ne last enega modula (verjetna ponovna uporaba v 003, člen I).

const webhookEndpointSchema = new Schema(
  {
    url: { type: String, required: true },
    events: {
      type: [String],
      required: true,
      enum: ['action.succeeded', 'action.failed', 'action.missed', 'session.expiring'],
    },
    secret: { type: String, required: true }, // občutljivo — nikoli v odgovorih API-ja
    active: { type: Boolean, default: true },
  },
  { timestamps: true, versionKey: false },
);

export type WebhookEndpointDoc = InferSchemaType<typeof webhookEndpointSchema>;
export const WebhookEndpointModel = model('WebhookEndpoint', webhookEndpointSchema);

const webhookDeliverySchema = new Schema(
  {
    endpointId: { type: Schema.Types.ObjectId, ref: 'WebhookEndpoint', required: true },
    event: { type: String, required: true },
    payload: { type: Schema.Types.Mixed, required: true },
    attemptCount: { type: Number, default: 0 },
    responseStatus: { type: Number, default: null },
    deliveredAt: { type: Date, default: null },
    nextAttemptAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);

// Operativni dnevnik, ne evidenca — TTL 30 dni (data-model.md, §Čiščenje).
webhookDeliverySchema.index({ createdAt: -1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });

export type WebhookDeliveryDoc = InferSchemaType<typeof webhookDeliverySchema>;
export const WebhookDeliveryModel = model('WebhookDelivery', webhookDeliverySchema);

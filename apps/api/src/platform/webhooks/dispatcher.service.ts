import { createHmac } from 'node:crypto';
import { WebhookEndpointModel, WebhookDeliveryModel } from './models.js';

// research.md §7, FR-083: podpisan HMAC-SHA256 v `X-CleverDash-Signature`, s časovnim
// žigom proti ponovnemu predvajanju. Ponovni poskusi z eksponentnim zamikom.

export type WebhookEvent = 'action.succeeded' | 'action.failed' | 'action.missed' | 'session.expiring';

const RETRY_BACKOFF_SECONDS = [60, 300, 900, 3600]; // 1min, 5min, 15min, 1h
const MAX_ATTEMPTS = RETRY_BACKOFF_SECONDS.length + 1;

export function signPayload(secret: string, timestampSeconds: string, body: string): string {
  return createHmac('sha256', secret).update(`${timestampSeconds}.${body}`).digest('hex');
}

/** Pošlje dogodek vsem aktivnim endpointom, ki so nanj naročeni. Klicati ob vsakem
 * dogodku (action.succeeded/failed/missed, session.expiring) — glej scheduler-steps.ts. */
export async function dispatchEvent(event: WebhookEvent, payload: Record<string, unknown>): Promise<void> {
  const endpoints = await WebhookEndpointModel.find({ active: true, events: event });
  for (const endpoint of endpoints) {
    const delivery = await WebhookDeliveryModel.create({ endpointId: endpoint._id, event, payload, attemptCount: 0 });
    await attemptDelivery(delivery, endpoint);
  }
}

/** Poskusi ponovno dostaviti vse zapadle, še nedostavljene webhooke — kliče se iz tika
 * schedulerja, enako kot ostali "preveri in po potrebi ukrepaj" koraki (research.md §3). */
export async function processPendingDeliveries(): Promise<void> {
  const due = await WebhookDeliveryModel.find({
    deliveredAt: null,
    nextAttemptAt: { $lte: new Date() },
    attemptCount: { $lt: MAX_ATTEMPTS },
  });
  for (const delivery of due) {
    const endpoint = await WebhookEndpointModel.findById(delivery.endpointId);
    if (!endpoint || !endpoint.active) continue;
    await attemptDelivery(delivery, endpoint);
  }
}

async function attemptDelivery(
  delivery: InstanceType<typeof WebhookDeliveryModel>,
  endpoint: InstanceType<typeof WebhookEndpointModel>,
): Promise<void> {
  const body = JSON.stringify({ event: delivery.event, payload: delivery.payload });
  const timestampSeconds = Math.floor(Date.now() / 1000).toString();
  const signature = signPayload(endpoint.secret, timestampSeconds, body);

  delivery.attemptCount = (delivery.attemptCount ?? 0) + 1;

  try {
    const res = await fetch(endpoint.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CleverDash-Signature': `t=${timestampSeconds},v1=${signature}`,
      },
      body,
    });
    delivery.responseStatus = res.status;
    if (res.ok) {
      delivery.deliveredAt = new Date();
      delivery.nextAttemptAt = null;
    } else {
      delivery.nextAttemptAt = nextRetryAt(delivery.attemptCount);
    }
  } catch {
    delivery.responseStatus = null;
    delivery.nextAttemptAt = nextRetryAt(delivery.attemptCount);
  }

  await delivery.save();
}

function nextRetryAt(attemptCount: number): Date | null {
  const backoff = RETRY_BACKOFF_SECONDS[attemptCount - 1];
  if (backoff === undefined) return null; // poskusi izčrpani — obupa, ne poskuša več
  return new Date(Date.now() + backoff * 1000);
}

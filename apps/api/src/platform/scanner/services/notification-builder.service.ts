import { Types } from 'mongoose';
import type { Env } from '../../config/env.js';
import type { Logger } from '../../logging/logger.js';
import { readUserSummaries } from '../../users/directory.service.js';
import { ScannerNotificationModel } from '../models/scanner-notification.model.js';
import type { NotifiableChangeType, ScannerEvent } from '../types.js';

// Sestavljanje zbirnih dopisov (FR-028, FR-029): EN zapis `pending` na prejemnika na zagon, s
// postavkami. Pošiljanje je drugje (notification-sender.service.ts) — ta funkcija nikoli ne
// kliče pošte in se sme ponoviti: unikatni indeks `(recipientUserId, runId)` drugi vnos zavrne.
//
// Deduplikacija: isti rezultat (`resultRef`), ki ustreza dvema skenerjema istega prejemnika, je
// ena postavka z obema imenoma. Kdo je prejemnik, določi TIP v dogodku (`recipients`) — jedro ne
// pozna deljenja; pri generičnih definicijah je to lastnik, pri letih še prejemniki z vklopljenim
// obveščanjem. Preseljeno iz 015 `notification-builder.service.ts`, brez letalskih polj.

export interface BuildNotificationsResult {
  created: number;
  recipients: number;
}

interface ItemDraft {
  definitionId: Types.ObjectId;
  definitionNames: string[];
  ownerName: string | null;
  resultRef: string;
  changeType: NotifiableChangeType;
  payload: unknown;
}

/** Ohrani "močnejši" tip: NOVO pred pocenitvijo pred podražitvijo in spremembo vsebine. */
const PRIORITY: Record<NotifiableChangeType, number> = { NEW: 3, PRICE_DOWN: 2, PRICE_UP: 1, CHANGED: 1 };

export async function buildNotificationsForRun(params: {
  runId: Types.ObjectId;
  scannerType: string;
  events: readonly ScannerEvent[];
  now: Date;
  env: Pick<Env, 'SCANNER_RUN_RETENTION_DAYS'>;
  logger?: Logger;
}): Promise<BuildNotificationsResult> {
  const { runId, scannerType, events, now } = params;
  if (events.length === 0) return { created: 0, recipients: 0 };

  const ownerIds = [...new Set(events.map((e) => e.ownerId))];
  const owners = await readUserSummaries(ownerIds);

  // prejemnik → (resultRef → postavka)
  const perRecipient = new Map<string, Map<string, ItemDraft>>();

  for (const event of events) {
    for (const recipientUserId of new Set(event.recipients)) {
      const items = perRecipient.get(recipientUserId) ?? new Map<string, ItemDraft>();
      perRecipient.set(recipientUserId, items);
      const isOwner = recipientUserId === event.ownerId;
      const existing = items.get(event.resultRef);
      if (existing) {
        if (!existing.definitionNames.includes(event.definitionName)) existing.definitionNames.push(event.definitionName);
        if (PRIORITY[event.changeType] > PRIORITY[existing.changeType]) existing.changeType = event.changeType;
        continue;
      }
      items.set(event.resultRef, {
        definitionId: new Types.ObjectId(event.definitionId),
        definitionNames: [event.definitionName],
        ownerName: isOwner ? null : (owners.get(event.ownerId)?.displayName ?? null),
        resultRef: event.resultRef,
        changeType: event.changeType,
        payload: event.payload,
      });
    }
  }

  const expiresAt = new Date(now.getTime() + params.env.SCANNER_RUN_RETENTION_DAYS * 86_400_000);
  let created = 0;
  for (const [recipientUserId, items] of perRecipient) {
    if (items.size === 0) continue;
    try {
      await ScannerNotificationModel.create({
        recipientUserId: new Types.ObjectId(recipientUserId),
        runId,
        scannerType,
        channel: 'email',
        items: [...items.values()].map((i) => ({
          definitionId: i.definitionId,
          definitionName: i.definitionNames.join(' · '),
          ownerName: i.ownerName,
          resultRef: i.resultRef,
          changeType: i.changeType,
          payload: i.payload,
        })),
        status: 'pending',
        suppressedReason: null,
        attemptCount: 0,
        nextAttemptAt: now,
        sendingSince: null,
        sentAt: null,
        messageId: null,
        lastError: null,
        createdAt: now,
        expiresAt,
      });
      created += 1;
    } catch (err) {
      // E11000: dopis za ta par (prejemnik, zagon) že obstaja — ponovljen klic sestavljanja po
      // prekinjenem zagonu. To ni napaka, to je zapora, ki dela (FR-028).
      if ((err as { code?: number })?.code !== 11000) throw err;
    }
  }

  return { created, recipients: perRecipient.size };
}

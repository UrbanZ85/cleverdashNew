import { Types } from 'mongoose';
import type { Env } from '../../../platform/config/env.js';
import type { Logger } from '../../../platform/logging/logger.js';
import { readUserSummaries } from '../../../platform/users/directory.service.js';
import { FlightNotificationModel } from '../models/flight-notification.model.js';
import type { ChangeType, Money } from '../domain/types.js';
import type { MatchEvent, OfferChange } from './reconcile.service.js';
import type { RuleLean } from './rule-access.service.js';

// Sestavljanje zbirnih dopisov (FR-033, FR-034): EN zapis `pending` na prejemnika na zagon, s
// postavkami. Pošiljanje je drugje (notification-sender.service.ts) — ta funkcija nikoli ne
// kliče pošte in se sme ponoviti: unikatni indeks `(recipientUserId, runId)` drugi vnos zavrne.
//
// Deduplikacija (FR-034): ista ponudba, ki ustreza dvema iskanjema istega prejemnika, je ena
// postavka z obema imenoma iskanj. Prejemnik iskanja prejme postavke samo za iskanja, pri
// katerih je na seznamu z `notify: true`; lastnik vedno.

export interface BuildNotificationsResult {
  created: number;
  recipients: number;
}

interface ItemDraft {
  ruleId: Types.ObjectId;
  ruleNames: string[];
  ruleOwnerName: string | null;
  offerId: Types.ObjectId;
  changeType: ChangeType;
  price: Money;
  previousPrice: Money | null;
}

const PRIORITY: Record<ChangeType, number> = { NEW: 3, PRICE_DOWN: 2, PRICE_UP: 1, UNCHANGED: 0, UNAVAILABLE: 0 };

export async function buildNotificationsForRun(params: {
  runId: Types.ObjectId;
  events: readonly MatchEvent[];
  offerChanges: Map<string, OfferChange>;
  rules: readonly RuleLean[];
  now: Date;
  env: Pick<Env, 'FLIGHT_RUN_RETENTION_DAYS'>;
  logger?: Logger;
}): Promise<BuildNotificationsResult> {
  const { runId, events, offerChanges, rules, now } = params;
  if (events.length === 0) return { created: 0, recipients: 0 };

  const rulesById = new Map(rules.map((r) => [String(r._id), r]));
  const ownerIds = [...new Set(rules.map((r) => String(r.userId)))];
  const owners = await readUserSummaries(ownerIds);

  // prejemnik → (offerId → postavka)
  const perRecipient = new Map<string, Map<string, ItemDraft>>();

  for (const event of events) {
    const rule = rulesById.get(event.ruleId);
    if (!rule) continue;
    const change = offerChanges.get(event.offerId);
    if (!change) continue;

    const recipients: Array<{ userId: string; isOwner: boolean }> = [
      { userId: String(rule.userId), isOwner: true },
      ...rule.recipients.filter((r) => r.notify).map((r) => ({ userId: String(r.userId), isOwner: false })),
    ];

    for (const recipient of recipients) {
      const items = perRecipient.get(recipient.userId) ?? new Map<string, ItemDraft>();
      perRecipient.set(recipient.userId, items);
      const existing = items.get(event.offerId);
      if (existing) {
        if (!existing.ruleNames.includes(rule.name)) existing.ruleNames.push(rule.name);
        // Ohrani "močnejši" tip: NOVO pred pocenitvijo pred podražitvijo.
        if (PRIORITY[event.changeType] > PRIORITY[existing.changeType]) existing.changeType = event.changeType;
        continue;
      }
      items.set(event.offerId, {
        ruleId: rule._id,
        ruleNames: [rule.name],
        ruleOwnerName: recipient.isOwner ? null : (owners.get(String(rule.userId))?.displayName ?? null),
        offerId: new Types.ObjectId(event.offerId),
        changeType: event.changeType,
        price: change.price,
        previousPrice: event.changeType === 'NEW' ? null : change.previousPrice,
      });
    }
  }

  const expiresAt = new Date(now.getTime() + params.env.FLIGHT_RUN_RETENTION_DAYS * 86_400_000);
  let created = 0;
  for (const [recipientUserId, items] of perRecipient) {
    if (items.size === 0) continue;
    try {
      await FlightNotificationModel.create({
        recipientUserId: new Types.ObjectId(recipientUserId),
        runId,
        items: [...items.values()].map((i) => ({
          ruleId: i.ruleId,
          ruleName: i.ruleNames.join(' · '),
          ruleOwnerName: i.ruleOwnerName,
          offerId: i.offerId,
          changeType: i.changeType,
          price: i.price,
          previousPrice: i.previousPrice,
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
      // prekinjenem zagonu. To ni napaka, to je zapora, ki dela (FR-034).
      if ((err as { code?: number })?.code !== 11000) throw err;
    }
  }

  return { created, recipients: perRecipient.size };
}

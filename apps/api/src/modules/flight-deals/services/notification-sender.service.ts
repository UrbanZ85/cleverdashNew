import { Types } from 'mongoose';
import type { Env } from '../../../platform/config/env.js';
import type { Logger } from '../../../platform/logging/logger.js';
import { isEmailConfigured, sendEmail } from '../../../platform/email/mailer.service.js';
import { readUserEmails } from '../../../platform/users/directory.service.js';
import { FlightNotificationModel } from '../models/flight-notification.model.js';
import { FlightOfferModel } from '../models/flight-offer.model.js';
import { FlightSearchRunModel } from '../models/flight-search-run.model.js';
import { FlightSearchRuleModel } from '../models/flight-search-rule.model.js';
import { findAirport } from '../domain/airports.js';
import { computeWindows } from '../domain/date-window.js';
import { renderDigest, type DigestItem } from '../domain/email-template.js';
import { offerMatchesRule } from '../domain/rule-matcher.js';
import type { ChangeType, Money, NotificationStatus, SuppressedReason } from '../domain/types.js';
import { providerById } from '../providers/index.js';
import { auditNotificationFailed, auditNotificationSent, auditNotificationSuppressed } from '../flight-deals.audit.js';
import type { OfferLean } from './offer-query.service.js';
import { toNormalized } from './reconcile.service.js';
import { originTimezoneOf } from './rule-response.service.js';
import { ruleToInput, type RuleLean } from './rule-access.service.js';

// Outbox dopisov (FR-036 do FR-038, SC-004) — research.md §9. Isti vzorec kot
// platform/webhooks/dispatcher.service.ts: zapis, poskusi, naraščajoč zamik, končno stanje.
//
// Prevzem je ATOMAREN (`pending → sending` s pogojem v filtru), zato dva izvoda ne pošljeta
// istega dopisa. Padec procesa med pošiljanjem pusti `sending`, ki ga naslednji tik po
// FLIGHT_RUN_STALE_MINUTES vrne v `pending` — tveganje dvojnega dopisa v tem oknu je sprejeto in
// zapisano (data-model.md), ker ga brez potrditve strežnika ni mogoče izključiti.
//
// Pred pošiljanjem se vsaka postavka ZNOVA preveri (FR-036, FR-042): iskanje obstaja in je
// aktivno, prejemnik je še lastnik ali na seznamu z vklopljenim obveščanjem, ponudba obstaja, je
// na voljo in še ustreza pravilom. Kar ne prestane, izpade; prazen dopis je `suppressed`.

export const RETRY_BACKOFF_SECONDS = [60, 300, 900, 3600] as const;
export const MAX_ATTEMPTS = RETRY_BACKOFF_SECONDS.length + 1;
const MAX_PER_TICK = 200;

interface NotificationLean {
  _id: Types.ObjectId;
  recipientUserId: Types.ObjectId;
  runId: Types.ObjectId;
  items: Array<{
    ruleId: Types.ObjectId;
    ruleName: string;
    ruleOwnerName: string | null;
    offerId: Types.ObjectId;
    changeType: ChangeType;
    price: Money;
    previousPrice: Money | null;
  }>;
  status: NotificationStatus;
  attemptCount: number;
}

export interface OutboxSummary {
  claimed: number;
  sent: number;
  failed: number;
  suppressed: number;
  retried: number;
}

export async function reclaimStuckSending(now: Date, staleMinutes: number): Promise<number> {
  const threshold = new Date(now.getTime() - staleMinutes * 60_000);
  const res = await FlightNotificationModel.updateMany(
    { status: 'sending', sendingSince: { $lte: threshold } },
    { $set: { status: 'pending', sendingSince: null, nextAttemptAt: now } },
  );
  return res.modifiedCount;
}

async function bumpRunCounter(runId: Types.ObjectId, field: 'notificationsSent' | 'notificationsFailed' | 'notificationsSuppressed'): Promise<void> {
  await FlightSearchRunModel.updateOne({ _id: runId }, { $inc: { [`counters.${field}`]: 1, 'counters.notificationsPending': -1 } }).catch(() => undefined);
}

async function finishSuppressed(n: NotificationLean, reason: SuppressedReason, logger: Logger | undefined): Promise<void> {
  await FlightNotificationModel.updateOne(
    { _id: n._id },
    { $set: { status: 'suppressed', suppressedReason: reason, nextAttemptAt: null, sendingSince: null } },
  );
  await bumpRunCounter(n.runId, 'notificationsSuppressed');
  auditNotificationSuppressed(logger, { notificationId: String(n._id), recipientUserId: String(n.recipientUserId), runId: String(n.runId), reason });
}

/** Postavke, ki še držijo — in DigestItems zanje. */
async function verifyItems(n: NotificationLean, now: Date): Promise<DigestItem[]> {
  const out: DigestItem[] = [];
  const ruleCache = new Map<string, RuleLean | null>();
  const recipientId = String(n.recipientUserId);

  for (const item of n.items) {
    const ruleIdStr = String(item.ruleId);
    let rule = ruleCache.get(ruleIdStr);
    if (rule === undefined) {
      rule = await FlightSearchRuleModel.findById(item.ruleId).lean<RuleLean | null>();
      ruleCache.set(ruleIdStr, rule);
    }
    if (!rule || !rule.active) continue;
    const isOwner = String(rule.userId) === recipientId;
    const stillRecipient = rule.recipients.some((r) => String(r.userId) === recipientId && r.notify);
    if (!isOwner && !stillRecipient) continue;

    const offer = await FlightOfferModel.findById(item.offerId).lean<OfferLean | null>();
    if (!offer || offer.availability !== 'available') continue;
    const input = ruleToInput(rule);
    const windows = computeWindows(input, now, originTimezoneOf(rule));
    const verdict = offerMatchesRule(toNormalized(offer), input, { windows, airports: findAirport });
    if (!verdict.ok) continue;

    const origin = findAirport(offer.origin);
    const destination = findAirport(offer.destination);
    if (!origin || !destination) continue;
    const provider = providerById(offer.providerId);

    out.push({
      ruleName: item.ruleName,
      ruleOwnerName: isOwner ? null : item.ruleOwnerName,
      offerId: String(offer._id),
      origin,
      destination,
      airline: offer.airline,
      airlineName: offer.airlineName,
      outbound: {
        departureAt: offer.outbound.departureAt,
        departureTz: origin.tz,
        arrivalAt: offer.outbound.arrivalAt,
        arrivalTz: destination.tz,
        flightNumbers: offer.outbound.flightNumbers,
        stops: offer.outbound.stops,
      },
      inbound: offer.inbound
        ? {
            departureAt: offer.inbound.departureAt,
            departureTz: destination.tz,
            arrivalAt: offer.inbound.arrivalAt,
            arrivalTz: origin.tz,
            flightNumbers: offer.inbound.flightNumbers,
            stops: offer.inbound.stops,
          }
        : null,
      nights: offer.nights,
      passengers: offer.passengers,
      // Cena iz AKTUALNE ponudbe, ne iz posnetka: če se je med zagonom in pošiljanjem spremenila,
      // naj dopis pove današnjo; prejšnja ostane iz posnetka dogodka.
      price: offer.price,
      previousPrice: item.changeType === 'NEW' ? null : item.previousPrice,
      priceIncludes: offer.priceIncludes,
      changeType: item.changeType,
      bookingUrl: offer.bookingUrl,
      providerLabel: provider?.label ?? offer.providerId,
      providerOfficial: provider?.official ?? false,
      dataAt: offer.dataAt,
    });
  }
  return out;
}

/** Obdela outbox: en prevzem naenkrat, do MAX_PER_TICK zapisov. */
export async function processNotificationOutbox(env: Env, logger: Logger | undefined, now = new Date()): Promise<OutboxSummary> {
  const summary: OutboxSummary = { claimed: 0, sent: 0, failed: 0, suppressed: 0, retried: 0 };
  await reclaimStuckSending(now, env.FLIGHT_RUN_STALE_MINUTES);
  const emailConfigured = isEmailConfigured(env);

  for (let i = 0; i < MAX_PER_TICK; i += 1) {
    const claimed = await FlightNotificationModel.findOneAndUpdate(
      { status: 'pending', nextAttemptAt: { $lte: now } },
      { $set: { status: 'sending', sendingSince: now }, $inc: { attemptCount: 1 } },
      { new: true, sort: { createdAt: 1 } },
    ).lean<NotificationLean | null>();
    if (!claimed) break;
    summary.claimed += 1;

    const items = await verifyItems(claimed, now);
    if (items.length === 0) {
      await finishSuppressed(claimed, 'no-items', logger);
      summary.suppressed += 1;
      continue;
    }
    if (!emailConfigured) {
      await finishSuppressed(claimed, 'smtp-not-configured', logger);
      summary.suppressed += 1;
      continue;
    }
    const emails = await readUserEmails([String(claimed.recipientUserId)]);
    const recipient = emails.get(String(claimed.recipientUserId));
    if (!recipient) {
      await finishSuppressed(claimed, 'user-missing', logger);
      summary.suppressed += 1;
      continue;
    }

    const rendered = renderDigest(items, {
      baseUrl: env.PUBLIC_BASE_URL.replace(/\/+$/, ''),
      checkedAt: now,
      appName: env.APP_NAME,
    });
    const result = await sendEmail(env, { to: recipient.email, ...rendered });

    if (result.ok) {
      await FlightNotificationModel.updateOne(
        { _id: claimed._id },
        { $set: { status: 'sent', sentAt: now, messageId: result.messageId, nextAttemptAt: null, sendingSince: null, lastError: null } },
      );
      await bumpRunCounter(claimed.runId, 'notificationsSent');
      auditNotificationSent(logger, {
        notificationId: String(claimed._id),
        recipientUserId: String(claimed.recipientUserId),
        runId: String(claimed.runId),
        items: items.length,
        attempt: claimed.attemptCount,
      });
      summary.sent += 1;
      continue;
    }

    const final = result.permanent || claimed.attemptCount >= MAX_ATTEMPTS;
    if (final) {
      await FlightNotificationModel.updateOne(
        { _id: claimed._id },
        { $set: { status: 'failed', nextAttemptAt: null, sendingSince: null, lastError: `${result.code}: ${result.message}` } },
      );
      await bumpRunCounter(claimed.runId, 'notificationsFailed');
      summary.failed += 1;
    } else {
      const delay = RETRY_BACKOFF_SECONDS[Math.min(claimed.attemptCount - 1, RETRY_BACKOFF_SECONDS.length - 1)]!;
      await FlightNotificationModel.updateOne(
        { _id: claimed._id },
        {
          $set: {
            status: 'pending',
            nextAttemptAt: new Date(now.getTime() + delay * 1000),
            sendingSince: null,
            lastError: `${result.code}: ${result.message}`,
          },
        },
      );
      summary.retried += 1;
    }
    auditNotificationFailed(logger, {
      notificationId: String(claimed._id),
      recipientUserId: String(claimed.recipientUserId),
      runId: String(claimed.runId),
      attempt: claimed.attemptCount,
      final,
      code: result.code,
    });
  }

  return summary;
}

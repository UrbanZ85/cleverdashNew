import { Types } from 'mongoose';
import type { Env } from '../../config/env.js';
import type { Logger } from '../../logging/logger.js';
import { isEmailConfigured, sendEmail } from '../../email/mailer.service.js';
import { readUserEmails } from '../../users/directory.service.js';
import { ScannerNotificationModel } from '../models/scanner-notification.model.js';
import { ScannerRunModel } from '../models/scanner-run.model.js';
import { findScannerType } from '../registry.js';
import { auditNotificationFailed, auditNotificationSent, auditNotificationSuppressed } from '../scanner.audit.js';
import type { NotifiableChangeType, NotificationItem, NotificationStatus, SuppressedReason } from '../types.js';

// Outbox dopisov (FR-030, FR-031) — isti vzorec kot platform/webhooks/dispatcher.service.ts in
// 015: zapis, poskusi, naraščajoč zamik, končno stanje.
//
// Prevzem je ATOMAREN (`pending → sending` s pogojem v filtru), zato dva izvoda ne pošljeta
// istega dopisa. Padec procesa med pošiljanjem pusti `sending`, ki ga naslednji tik po
// SCANNER_RUN_STALE_MINUTES vrne v `pending` — tveganje dvojnega dopisa v tem oknu je sprejeto in
// zapisano (data-model.md), ker ga brez potrditve strežnika ni mogoče izključiti.
//
// Vsebino določi TIP prek dveh kavljev: `verify` pred pošiljanjem ZNOVA preveri vsako postavko
// (FR-030) in vrne samo tiste, ki še držijo; `render` iz njih sestavi zadevo, HTML in besedilo.
// Jedro o obliki postavke ne ve ničesar (`payload`).

export const RETRY_BACKOFF_SECONDS = [60, 300, 900, 3600] as const;
export const MAX_ATTEMPTS = RETRY_BACKOFF_SECONDS.length + 1;
const MAX_PER_TICK = 200;

interface NotificationLean {
  _id: Types.ObjectId;
  recipientUserId: Types.ObjectId;
  runId: Types.ObjectId;
  scannerType: string;
  items: Array<{
    definitionId: Types.ObjectId;
    definitionName: string;
    ownerName: string | null;
    resultRef: string;
    changeType: NotifiableChangeType;
    payload: unknown;
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
  const res = await ScannerNotificationModel.updateMany(
    { status: 'sending', sendingSince: { $lte: threshold } },
    { $set: { status: 'pending', sendingSince: null, nextAttemptAt: now } },
  );
  return res.modifiedCount;
}

async function bumpRunCounter(runId: Types.ObjectId, field: 'notificationsSent' | 'notificationsFailed' | 'notificationsSuppressed'): Promise<void> {
  await ScannerRunModel.updateOne({ _id: runId }, { $inc: { [`counters.${field}`]: 1, 'counters.notificationsPending': -1 } }).catch(() => undefined);
}

async function finishSuppressed(n: NotificationLean, reason: SuppressedReason, logger: Logger | undefined): Promise<void> {
  await ScannerNotificationModel.updateOne(
    { _id: n._id },
    { $set: { status: 'suppressed', suppressedReason: reason, nextAttemptAt: null, sendingSince: null } },
  );
  await bumpRunCounter(n.runId, 'notificationsSuppressed');
  auditNotificationSuppressed(logger, {
    notificationId: String(n._id),
    scannerType: n.scannerType,
    recipientUserId: String(n.recipientUserId),
    runId: String(n.runId),
    reason,
  });
}

function toItems(n: NotificationLean): NotificationItem[] {
  return n.items.map((i) => ({
    definitionId: String(i.definitionId),
    definitionName: i.definitionName,
    ownerName: i.ownerName,
    resultRef: i.resultRef,
    changeType: i.changeType,
    payload: i.payload,
  }));
}

/** Obdela outbox: en prevzem naenkrat, do MAX_PER_TICK zapisov. */
export async function processNotificationOutbox(env: Env, logger: Logger | undefined, now = new Date()): Promise<OutboxSummary> {
  const summary: OutboxSummary = { claimed: 0, sent: 0, failed: 0, suppressed: 0, retried: 0 };
  await reclaimStuckSending(now, env.SCANNER_RUN_STALE_MINUTES);
  const emailConfigured = isEmailConfigured(env);

  for (let i = 0; i < MAX_PER_TICK; i += 1) {
    const claimed = await ScannerNotificationModel.findOneAndUpdate(
      { status: 'pending', nextAttemptAt: { $lte: now } },
      { $set: { status: 'sending', sendingSince: now }, $inc: { attemptCount: 1 } },
      { new: true, sort: { createdAt: 1 } },
    ).lean<NotificationLean | null>();
    if (!claimed) break;
    summary.claimed += 1;

    const type = findScannerType(claimed.scannerType);
    if (!type) {
      // Tip je bil odstranjen, preden je dopis odšel: brez kavljev ga ni mogoče ne preveriti ne
      // izrisati. Zadržan z razlogom, ne izgubljen tiho (člen VII).
      await finishSuppressed(claimed, 'type-unavailable', logger);
      summary.suppressed += 1;
      continue;
    }

    const verified = await type.notifications.verify(toItems(claimed), String(claimed.recipientUserId), now);
    if (verified.length === 0) {
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

    const rendered = type.notifications.render(verified, {
      baseUrl: env.PUBLIC_BASE_URL.replace(/\/+$/, ''),
      checkedAt: now,
      appName: env.APP_NAME,
    });
    const result = await sendEmail(env, { to: recipient.email, ...rendered });

    if (result.ok) {
      await ScannerNotificationModel.updateOne(
        { _id: claimed._id },
        { $set: { status: 'sent', sentAt: now, messageId: result.messageId, nextAttemptAt: null, sendingSince: null, lastError: null } },
      );
      await bumpRunCounter(claimed.runId, 'notificationsSent');
      auditNotificationSent(logger, {
        notificationId: String(claimed._id),
        scannerType: claimed.scannerType,
        recipientUserId: String(claimed.recipientUserId),
        runId: String(claimed.runId),
        items: verified.length,
        attempt: claimed.attemptCount,
      });
      summary.sent += 1;
      continue;
    }

    const final = result.permanent || claimed.attemptCount >= MAX_ATTEMPTS;
    if (final) {
      await ScannerNotificationModel.updateOne(
        { _id: claimed._id },
        { $set: { status: 'failed', nextAttemptAt: null, sendingSince: null, lastError: `${result.code}: ${result.message}` } },
      );
      await bumpRunCounter(claimed.runId, 'notificationsFailed');
      summary.failed += 1;
    } else {
      const delay = RETRY_BACKOFF_SECONDS[Math.min(claimed.attemptCount - 1, RETRY_BACKOFF_SECONDS.length - 1)]!;
      await ScannerNotificationModel.updateOne(
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
      scannerType: claimed.scannerType,
      recipientUserId: String(claimed.recipientUserId),
      runId: String(claimed.runId),
      attempt: claimed.attemptCount,
      final,
      code: result.code,
    });
  }

  return summary;
}

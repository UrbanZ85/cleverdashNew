import type { Logger } from '../../platform/logging/logger.js';

// Revizijski dogodki modula Leti — tanki ovoji nad `logger.info`, isti vzorec kot
// `modules/todos/todos.audit.ts`. Zbirke za revizijo ni; dnevnik je strukturiran in nosi
// korelacijo (člen VII).
//
// V dogodkih so IZKLJUČNO identifikatorji: nikoli e-naslovi, nikoli imena, nikoli vsebina
// dopisa (FR-054). Dnevnik bere operater; ne sme biti drugi imenik namestitve.

export function auditSearchCreated(logger: Logger | undefined, p: { userId: string; ruleId: string }): void {
  logger?.info({ event: 'flight.search.created', ...p }, 'Iskanje letov ustvarjeno');
}

export function auditSearchUpdated(
  logger: Logger | undefined,
  p: { userId: string; ruleId: string; fields: string[] },
): void {
  logger?.info({ event: 'flight.search.updated', ...p }, 'Iskanje letov spremenjeno');
}

export function auditSearchDeleted(logger: Logger | undefined, p: { userId: string; ruleId: string }): void {
  logger?.info({ event: 'flight.search.deleted', ...p }, 'Iskanje letov izbrisano');
}

export function auditSearchShared(
  logger: Logger | undefined,
  p: { userId: string; ruleId: string; targetUserId: string; notify: boolean; created: boolean },
): void {
  logger?.info({ event: 'flight.search.shared', ...p }, 'Prejemnik obvestil dodan ali spremenjen');
}

export function auditSearchUnshared(
  logger: Logger | undefined,
  p: { userId: string; ruleId: string; targetUserId: string },
): void {
  logger?.info({ event: 'flight.search.unshared', ...p }, 'Prejemnik obvestil odstranjen');
}

export function auditRunStarted(
  logger: Logger | undefined,
  p: { runId: string; trigger: string; slotKey: string; rules: number },
): void {
  logger?.info({ event: 'flight.run.started', ...p }, 'Zagon preverjanja letov se je začel');
}

export function auditRunFinished(
  logger: Logger | undefined,
  p: { runId: string; status: string; durationMs: number; counters: Record<string, number> },
): void {
  logger?.info({ event: 'flight.run.finished', ...p }, 'Zagon preverjanja letov končan');
}

export function auditRunInterrupted(logger: Logger | undefined, p: { runId: string; heartbeatAt: Date }): void {
  logger?.warn({ event: 'flight.run.interrupted', ...p }, 'Zagon brez utripa označen kot prekinjen');
}

export function auditRunCancelled(logger: Logger | undefined, p: { runId: string; actorUserId: string }): void {
  logger?.info({ event: 'flight.run.cancelled', ...p }, 'Zagon preverjanja letov preklican');
}

export function auditSchedulerUpdated(
  logger: Logger | undefined,
  p: { actorUserId: string; enabled: boolean; cronExpression: string; timezone: string },
): void {
  logger?.info({ event: 'flight.scheduler.updated', ...p }, 'Urnik preverjanja letov spremenjen');
}

export function auditNotificationSent(
  logger: Logger | undefined,
  p: { notificationId: string; recipientUserId: string; runId: string; items: number; attempt: number },
): void {
  logger?.info({ event: 'flight.notification.sent', ...p }, 'Dopis o letih poslan');
}

export function auditNotificationFailed(
  logger: Logger | undefined,
  p: { notificationId: string; recipientUserId: string; runId: string; attempt: number; final: boolean; code: string },
): void {
  logger?.warn({ event: 'flight.notification.failed', ...p }, 'Pošiljanje dopisa o letih ni uspelo');
}

export function auditNotificationSuppressed(
  logger: Logger | undefined,
  p: { notificationId: string; recipientUserId: string; runId: string; reason: string },
): void {
  logger?.info({ event: 'flight.notification.suppressed', ...p }, 'Dopis o letih zadržan');
}

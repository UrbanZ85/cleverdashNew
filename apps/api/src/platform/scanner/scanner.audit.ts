import type { Logger } from '../logging/logger.js';
import type { RunStatus, SuppressedReason } from './types.js';

// Revizijski dogodki jedra skenerjev — tanki ovoji nad `logger.info`, isti vzorec kot
// `modules/flight-deals/flight-deals.audit.ts` (od koder so dogodki zagonov, urnika in dopisov
// preseljeni sem). Zbirke za revizijo ni; dnevnik je strukturiran in nosi korelacijo (člen VII).
//
// V dogodkih so IZKLJUČNO identifikatorji in oznake tipov: nikoli e-naslovi, nikoli imena, nikoli
// vsebina dopisa, nikoli `config` skenerja. Dnevnik bere operater; ne sme biti drugi imenik.

export function auditDefinitionCreated(logger: Logger | undefined, p: { userId: string; definitionId: string; scannerType: string }): void {
  logger?.info({ event: 'scanner.definition.created', ...p }, 'Skener ustvarjen');
}

export function auditDefinitionUpdated(
  logger: Logger | undefined,
  p: { userId: string; definitionId: string; scannerType: string; fields: string[] },
): void {
  logger?.info({ event: 'scanner.definition.updated', ...p }, 'Skener spremenjen');
}

export function auditDefinitionDeleted(logger: Logger | undefined, p: { userId: string; definitionId: string; scannerType: string }): void {
  logger?.info({ event: 'scanner.definition.deleted', ...p }, 'Skener izbrisan');
}

export function auditRunStarted(
  logger: Logger | undefined,
  p: { runId: string; scannerType: string; scope: string; trigger: 'schedule' | 'manual'; slotKey: string },
): void {
  logger?.info({ event: 'scanner.run.started', ...p }, 'Zagon skenerja začet');
}

export function auditRunFinished(
  logger: Logger | undefined,
  p: { runId: string; scannerType: string; status: RunStatus; durationMs: number; counters: Record<string, number> },
): void {
  logger?.info({ event: 'scanner.run.finished', ...p }, 'Zagon skenerja končan');
}

export function auditRunInterrupted(logger: Logger | undefined, p: { runId: string; scannerType: string; heartbeatAt: Date }): void {
  logger?.warn({ event: 'scanner.run.interrupted', ...p }, 'Zagon brez utripa označen kot prekinjen');
}

export function auditRunCancelled(logger: Logger | undefined, p: { runId: string; scannerType: string; actorUserId: string }): void {
  logger?.info({ event: 'scanner.run.cancelled', ...p }, 'Zahtevana prekinitev zagona');
}

export function auditScheduleUpdated(
  logger: Logger | undefined,
  p: { scannerType: string; actorUserId: string; enabled: boolean; cronExpression: string; timezone: string },
): void {
  logger?.info({ event: 'scanner.schedule.updated', ...p }, 'Urnik tipa spremenjen');
}

export function auditNotificationSent(
  logger: Logger | undefined,
  p: { notificationId: string; scannerType: string; recipientUserId: string; runId: string; items: number; attempt: number },
): void {
  logger?.info({ event: 'scanner.notification.sent', ...p }, 'Dopis poslan');
}

export function auditNotificationFailed(
  logger: Logger | undefined,
  p: { notificationId: string; scannerType: string; recipientUserId: string; runId: string; attempt: number; final: boolean; code: string },
): void {
  logger?.warn({ event: 'scanner.notification.failed', ...p }, p.final ? 'Dopis dokončno neuspel' : 'Pošiljanje dopisa spodletelo; ponovni poskus');
}

export function auditNotificationSuppressed(
  logger: Logger | undefined,
  p: { notificationId: string; scannerType: string; recipientUserId: string; runId: string; reason: SuppressedReason },
): void {
  logger?.info({ event: 'scanner.notification.suppressed', ...p }, 'Dopis zadržan');
}

/** Enkrat na tip na proces (scheduler.service.ts) — ne ob vsakem tiku. */
export function auditTypeUnavailable(logger: Logger | undefined, p: { scannerType: string; definitions: number }): void {
  logger?.warn({ event: 'scanner.type.unavailable', ...p }, 'Skenerji tipa, ki ni registriran ali vklopljen, se ne izvajajo');
}

export function auditLegacyDropped(logger: Logger | undefined, p: { collection: string; documents: number }): void {
  logger?.warn({ event: 'scanner.legacy.dropped', ...p }, 'Zastarela zbirka modula Leti (015) izbrisana — nadomešča jo jedro skenerjev (016)');
}

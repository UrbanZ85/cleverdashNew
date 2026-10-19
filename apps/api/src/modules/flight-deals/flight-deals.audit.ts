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

// 016: dogodki zagonov, urnika in dopisov so v platform/scanner/scanner.audit.ts.

import type { Logger } from '../../platform/logging/logger.js';

// FR-015: prijave, odjave in preklici sej so strukturirano zabeleženi. Nikoli ne beleži
// gesla ali obnovitvenega žetona v čistopisu — samo identifikatorje. 004: `familyId` je
// povsod postal `sessionId` (KeycloakSession, ne SessionFamily).
export function auditLogin(logger: Logger, params: { userId: string; sessionId: string }) {
  logger.info({ event: 'auth.login', ...params }, 'Uspešna prijava');
}

export function auditLoginFailed(logger: Logger, params: { reason: string }) {
  logger.warn({ event: 'auth.login_failed', ...params }, 'Neuspela prijava');
}

export function auditLogout(logger: Logger, params: { userId: string; sessionId: string }) {
  logger.info({ event: 'auth.logout', ...params }, 'Odjava');
}

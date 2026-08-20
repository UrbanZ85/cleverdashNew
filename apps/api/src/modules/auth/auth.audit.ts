import type { Logger } from '../../platform/logging/logger.js';

// FR-015: prijave, odjave in preklici družin so strukturirano zabeleženi. Nikoli ne
// beleži gesla ali obnovitvenega žetona v čistopisu — samo identifikatorje.
export function auditLogin(logger: Logger, params: { userId: string; familyId: string }) {
  logger.info({ event: 'auth.login', ...params }, 'Uspešna prijava');
}

export function auditLoginFailed(logger: Logger, params: { email: string }) {
  logger.warn({ event: 'auth.login_failed', ...params }, 'Neuspela prijava');
}

export function auditLogout(logger: Logger, params: { userId: string; familyId: string }) {
  logger.info({ event: 'auth.logout', ...params }, 'Odjava');
}

export function auditFamilyRevoked(
  logger: Logger,
  params: { familyId: string; reason: string },
) {
  logger.warn({ event: 'auth.family_revoked', ...params }, 'Družina sej preklicana');
}

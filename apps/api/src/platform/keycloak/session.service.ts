import jwt from 'jsonwebtoken';
import { KeycloakSessionModel, type KeycloakSessionDoc } from '../../modules/auth/models/keycloak-session.model.js';
import { encrypt, decrypt } from '../crypto/secret-box.js';
import type { Env } from '../config/env.js';

// research.md §2, data-model.md "KeycloakSession": ta modul je edino mesto, ki bere/piše
// `encryptedRefreshToken` v čistem besedilu, in edino mesto, ki izda/preveri notranji sejni
// piškotek. Piškotek sam nosi samo `sid` (KeycloakSession._id) — avtoriteta o tem, ali je
// seja še veljavna, je VEDNO baza (`state === 'active'`), ne podpis piškotka sam po sebi.

type SessionEnv = Pick<Env, 'SESSION_COOKIE_SECRET' | 'CREDENTIALS_ENCRYPTION_KEY'>;

interface SessionCookiePayload {
  sid: string;
}

/** Piškotek referencira sejo, ne nosi je same — dolga veljavnost je varna, ker je dejanska
 * avtoriteta preklic v bazi (research.md §2), ne izteka JWT-ja samega. */
const COOKIE_TTL = '180d';

export function issueSessionCookieValue(env: SessionEnv, keycloakSessionId: string): string {
  return jwt.sign({ sid: keycloakSessionId } satisfies SessionCookiePayload, env.SESSION_COOKIE_SECRET, {
    expiresIn: COOKIE_TTL,
  });
}

/** Vrne `KeycloakSession._id`, če je piškotek veljavno podpisan — NE preverja stanja seje v
 * bazi (to naredi klicatelj, glej access-token.service.ts). `null` ob neveljavnem/manjkajočem
 * podpisu, ne vrže napake — klicna mesta to obravnavajo kot "ni prijavljen". */
export function readSessionCookieValue(env: SessionEnv, cookieValue: string | undefined): string | null {
  if (!cookieValue) return null;
  try {
    const payload = jwt.verify(cookieValue, env.SESSION_COOKIE_SECRET) as SessionCookiePayload;
    return payload.sid;
  } catch {
    return null;
  }
}

export interface CreateSessionParams {
  userId: string;
  deviceLabel?: string;
  platform: 'web' | 'android';
  refreshToken: string;
}

export async function createSession(
  env: SessionEnv,
  params: CreateSessionParams,
): Promise<{ session: KeycloakSessionDoc & { _id: unknown }; cookieValue: string }> {
  const session = await KeycloakSessionModel.create({
    userId: params.userId,
    deviceLabel: params.deviceLabel ?? 'Neznana naprava',
    platform: params.platform,
    encryptedRefreshToken: encrypt(params.refreshToken, env.CREDENTIALS_ENCRYPTION_KEY),
  });
  const cookieValue = issueSessionCookieValue(env, String(session._id));
  return { session, cookieValue };
}

/** Aktivna seja po ID-ju, ali `null` (ne obstaja/preklicana) — edino mesto, ki odloči, ali je
 * seja "trenutno veljavna" (FR-005/FR-006). */
export async function getActiveSession(sessionId: string) {
  return KeycloakSessionModel.findOne({ _id: sessionId, state: 'active' });
}

export function decryptSessionRefreshToken(env: SessionEnv, session: Pick<KeycloakSessionDoc, 'encryptedRefreshToken'>): string {
  return decrypt(session.encryptedRefreshToken, env.CREDENTIALS_ENCRYPTION_KEY);
}

export async function rotateSessionRefreshToken(
  env: SessionEnv,
  sessionId: string,
  newRefreshToken: string,
): Promise<void> {
  await KeycloakSessionModel.updateOne(
    { _id: sessionId },
    { encryptedRefreshToken: encrypt(newRefreshToken, env.CREDENTIALS_ENCRYPTION_KEY), lastUsedAt: new Date() },
  );
}

export async function revokeSession(sessionId: string): Promise<void> {
  await KeycloakSessionModel.updateOne({ _id: sessionId }, { state: 'revoked' });
}

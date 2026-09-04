import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { startTestDb, stopTestDb, clearTestDb } from '../setup/mongo-memory.js';
import {
  createSession,
  getActiveSession,
  readSessionCookieValue,
  decryptSessionRefreshToken,
  revokeSession,
} from '../../src/platform/keycloak/session.service.js';

// research.md §2: session.service.ts je edino mesto, ki bere/piše encryptedRefreshToken v
// čistem besedilu, in edino mesto, ki izda/preveri sejni piškotek.

const ENV = {
  SESSION_COOKIE_SECRET: 'a'.repeat(32),
  CREDENTIALS_ENCRYPTION_KEY: Buffer.alloc(32, 5).toString('base64'),
};

beforeAll(startTestDb);
afterAll(stopTestDb);
afterEach(clearTestDb);

describe('session.service', () => {
  it('createSession izda piškotek, ki se pravilno prebere nazaj v isti KeycloakSession._id', async () => {
    const { session, cookieValue } = await createSession(ENV, {
      userId: '507f1f77bcf86cd799439011',
      platform: 'web',
      refreshToken: 'kc-refresh-secret-1',
    });
    const sessionId = readSessionCookieValue(ENV, cookieValue);
    expect(sessionId).toBe(String(session._id));
  });

  it('shrani obnovitveni žeton šifriran, ne v čistem besedilu', async () => {
    const { session } = await createSession(ENV, {
      userId: '507f1f77bcf86cd799439011',
      platform: 'web',
      refreshToken: 'skrivnost-ki-ne-sme-biti-vidna',
    });
    expect(session.encryptedRefreshToken).not.toContain('skrivnost-ki-ne-sme-biti-vidna');
    expect(decryptSessionRefreshToken(ENV, session)).toBe('skrivnost-ki-ne-sme-biti-vidna');
  });

  it('preklicane seje getActiveSession ne vrne več', async () => {
    const { session } = await createSession(ENV, {
      userId: '507f1f77bcf86cd799439011',
      platform: 'web',
      refreshToken: 'kc-refresh-secret-2',
    });
    await revokeSession(String(session._id));
    expect(await getActiveSession(String(session._id))).toBeNull();
  });

  it('neveljaven/manjkajoč piškotek vrne null, ne vrže napake', () => {
    expect(readSessionCookieValue(ENV, undefined)).toBeNull();
    expect(readSessionCookieValue(ENV, 'popolnoma-neveljaven-niz')).toBeNull();
  });
});

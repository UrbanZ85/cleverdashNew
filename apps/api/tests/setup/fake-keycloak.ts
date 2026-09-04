import { createHash, randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import express from 'express';
import type { Server } from 'node:http';

// research.md §3: pravi Keycloak je težka JVM aplikacija — v testih ga nadomesti minimalen
// HTTP strežnik, ki servira isti OIDC "obris" (discovery, authorize, token, introspect,
// userinfo), s testno nastavljivo identiteto. `openid-client` (client.ts) proti temu
// strežniku dela enako kot proti pravemu Keycloaku — ista PKCE preverba, isti kod.

export interface TestIdentity {
  sub: string;
  email: string;
  name: string;
  /** Realm vloge, kot bi jih vrnil pravi Keycloak v `realm_access.roles` (role-mapping.ts). */
  roles: string[];
}

interface PendingCode {
  identity: TestIdentity;
  redirectUri: string;
  codeChallenge: string;
}

interface IssuedRefreshToken {
  identity: TestIdentity;
}

function base64url(input: Buffer): string {
  return input.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomId(): string {
  return base64url(randomBytes(24));
}

export interface FakeKeycloak {
  /** `KEYCLOAK_ISSUER_URL` za `setTestEnv({ KEYCLOAK_ISSUER_URL: ... })`. */
  issuerUrl: string;
  /** Nastavi identiteto, ki jo bo "avtenticiral" NASLEDNJI klic `/auth` (en na prijavo —
   * simulira uporabnika, ki se je pri Keycloaku prijavil in privolil). */
  setNextIdentity(identity: TestIdentity): void;
  /** T056: spremeni vloge VSEH trenutno izdanih dostopnih žetonov za dan `sub` — simulira
   * skrbnika, ki v Keycloaku doda/odvzame vlogo MED aktivno sejo. Naslednja introspekcija
   * ISTEGA žetona (brez nove prijave) mora odražati novo stanje (FR-011/FR-012). */
  setRolesForSub(sub: string, roles: string[]): void;
  close(): Promise<void>;
}

/** Zažene ponarejen Keycloak na naključnih vratih (`127.0.0.1`, en na testni proces/datoteko
 * — glej vzorec `mongo-memory.ts`). Vsak klic vrne SVOJ strežnik, brez skupnega stanja med
 * testnimi datotekami. */
export async function startFakeKeycloak(): Promise<FakeKeycloak> {
  const app = express();
  app.use(express.urlencoded({ extended: false }));

  const server: Server = await new Promise((resolve, reject) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
    s.on('error', reject);
  });
  const { port } = server.address() as AddressInfo;
  const issuerUrl = `http://127.0.0.1:${port}/realms/test`;
  const base = `${issuerUrl}/protocol/openid-connect`;

  let nextIdentity: TestIdentity | null = null;
  const pendingCodes = new Map<string, PendingCode>();
  // accessToken -> identiteta (za introspekcijo/userinfo); refreshToken -> identiteta.
  const accessTokens = new Map<string, TestIdentity>();
  const refreshTokens = new Map<string, IssuedRefreshToken>();

  app.get('/realms/test/.well-known/openid-configuration', (_req, res) => {
    res.json({
      issuer: issuerUrl,
      authorization_endpoint: `${base}/auth`,
      token_endpoint: `${base}/token`,
      introspection_endpoint: `${base}/token/introspect`,
      end_session_endpoint: `${base}/logout`,
      userinfo_endpoint: `${base}/userinfo`,
      response_types_supported: ['code'],
      subject_types_supported: ['public'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
    });
  });

  app.get('/realms/test/protocol/openid-connect/auth', (req, res) => {
    const redirectUri = req.query.redirect_uri;
    const state = req.query.state;
    const codeChallenge = req.query.code_challenge;
    if (typeof redirectUri !== 'string' || typeof codeChallenge !== 'string') {
      res.status(400).send('fake-keycloak: manjka redirect_uri/code_challenge');
      return;
    }
    if (!nextIdentity) {
      res.status(500).send('fake-keycloak: setNextIdentity() ni bil poklican pred /auth');
      return;
    }
    const code = randomId();
    pendingCodes.set(code, { identity: nextIdentity, redirectUri, codeChallenge });
    nextIdentity = null; // en kod, ena identiteta — naslednja prijava zahteva nov setNextIdentity()
    const location = new URL(redirectUri);
    location.searchParams.set('code', code);
    if (typeof state === 'string') location.searchParams.set('state', state);
    res.redirect(302, location.toString());
  });

  app.post('/realms/test/protocol/openid-connect/token', (req, res) => {
    const body = req.body as Record<string, string | undefined>;
    if (body.grant_type === 'authorization_code') {
      const code = body.code;
      const pending = code ? pendingCodes.get(code) : undefined;
      if (!pending || !code) {
        res.status(400).json({ error: 'invalid_grant' });
        return;
      }
      pendingCodes.delete(code);
      if (pending.codeChallenge) {
        const computed = base64url(createHash('sha256').update(body.code_verifier ?? '').digest());
        if (computed !== pending.codeChallenge) {
          res.status(400).json({ error: 'invalid_grant', error_description: 'PKCE code_verifier se ne ujema' });
          return;
        }
      }
      const accessToken = randomId();
      const refreshToken = randomId();
      accessTokens.set(accessToken, pending.identity);
      refreshTokens.set(refreshToken, { identity: pending.identity });
      res.json({ access_token: accessToken, refresh_token: refreshToken, token_type: 'Bearer', expires_in: 300 });
      return;
    }
    if (body.grant_type === 'refresh_token') {
      const presented = body.refresh_token;
      const issued = presented ? refreshTokens.get(presented) : undefined;
      if (!issued || !presented) {
        res.status(400).json({ error: 'invalid_grant' });
        return;
      }
      refreshTokens.delete(presented);
      const accessToken = randomId();
      const refreshToken = randomId();
      accessTokens.set(accessToken, issued.identity);
      refreshTokens.set(refreshToken, { identity: issued.identity });
      res.json({ access_token: accessToken, refresh_token: refreshToken, token_type: 'Bearer', expires_in: 300 });
      return;
    }
    res.status(400).json({ error: 'unsupported_grant_type' });
  });

  app.post('/realms/test/protocol/openid-connect/token/introspect', (req, res) => {
    const body = req.body as Record<string, string | undefined>;
    const identity = body.token ? accessTokens.get(body.token) : undefined;
    if (!identity) {
      res.json({ active: false });
      return;
    }
    res.json({ active: true, sub: identity.sub, realm_access: { roles: identity.roles } });
  });

  app.get('/realms/test/protocol/openid-connect/userinfo', (req, res) => {
    const header = req.header('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
    const identity = accessTokens.get(token);
    if (!identity) {
      res.status(401).json({ error: 'invalid_token' });
      return;
    }
    res.json({ sub: identity.sub, email: identity.email, name: identity.name, preferred_username: identity.email });
  });

  return {
    issuerUrl,
    setNextIdentity(identity: TestIdentity) {
      nextIdentity = identity;
    },
    setRolesForSub(sub: string, roles: string[]) {
      for (const identity of accessTokens.values()) {
        if (identity.sub === sub) identity.roles = roles;
      }
    },
    close() {
      return new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}

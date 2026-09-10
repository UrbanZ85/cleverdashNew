import { Router } from 'express';
import jwt from 'jsonwebtoken';
import * as client from 'openid-client';
import { KeycloakUnreachableError, getKeycloakConfig } from '../../platform/keycloak/client.js';
import { mapRolesToAccess } from '../../platform/keycloak/role-mapping.js';
import { findOrCreateUser } from './services/user-provisioning.service.js';
import { migrateLegacyDataIfNeeded } from '../../platform/migration/legacy-userless-migration.service.js';
import {
  createSession,
  getActiveSession,
  decryptSessionRefreshToken,
  rotateSessionRefreshToken,
  revokeSession,
  readSessionCookieValue,
} from '../../platform/keycloak/session.service.js';
import { KeycloakSessionModel } from './models/keycloak-session.model.js';
import { requireScopes } from '../../platform/auth/scopes.js';
import { auditLogin, auditLoginFailed, auditLogout } from './auth.audit.js';
import { unauthorized, notFound, serviceUnavailable } from '../../platform/errors/problem.js';
import { loadEnv } from '../../platform/config/env.js';
import { UserModel } from './models/user.model.js';
import { readUserSummaries } from '../../platform/users/directory.service.js';

// 004, contracts/openapi.yaml, research.md §1/§2/§9/§10: nadomesti celotno prejšnjo
// e-pošta/geslo pot. `/auth/login`, `/auth/callback` in `/auth/refresh` NE sprejemajo
// `Idempotency-Key` (izjema za izdajo/rotacijo žetonov, člen III ustave) — `/auth/login` in
// `/auth/callback` sta GET (preusmeritvi, ne mutaciji), zato vprašanje niti ne nastopi;
// `/auth/refresh` izjemo eksplicitno podeduje iz 001.
export const authRouter = Router();

const SESSION_COOKIE = 'cd_session';
const SESSION_COOKIE_PATH = '/api/v1/auth';
const OIDC_FLOW_COOKIE = 'cd_oidc_flow';

/**
 * Loči "Keycloak je obnovo ZAVRNIL" od "Keycloaka ni bilo mogoče doseči". Samo prvo pomeni,
 * da seje ni več, in samo ob prvem se sme seja preklicati (`/auth/refresh` spodaj).
 *
 * Zavrnitev je odgovor iz Keycloaka s telesom OAuth napake in stanjem 4xx — v praksi
 * `invalid_grant` / "Token is not active". Vse drugo (zavrnjena povezava, časovna omejitev,
 * 5xx, nepričakovan izjemek v naši kodi) je ŠTETO ZA DOSEGLJIVOST in ne za veljavnost: v dvomu
 * seja OSTANE. Napačna smer te presoje je bila draga — vsak kratek izpad Keycloaka je prej
 * odjavil vse prijavljene.
 */
function isRefreshRejected(err: unknown): boolean {
  return err instanceof client.ResponseBodyError && err.status >= 400 && err.status < 500;
}

interface OidcFlowPayload {
  codeVerifier: string;
  state: string;
  redirectTo: string;
}

/**
 * Sprejme samo pot ZNOTRAJ te aplikacije. Vrednost pride iz naslovne vrstice, po prijavi pa
 * gre naravnost v `res.redirect` — brez tega bi bil `?redirectTo=https://tuja.si` odprta
 * preusmeritev z videzom domače prijave (uporabnik se prijavi pri nas in konča drugje).
 *
 * Zavrnjeno je vse, kar ni ena sama poševnica na začetku: `//gostitelj` (protokolno
 * relativno) in `/\gostitelj` brskalniki razumejo kot ZUNANJI naslov, ne kot pot.
 */
function safeRedirectPath(value: unknown): string {
  if (typeof value !== 'string') return '/';
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return '/';
  return value;
}

function callbackRedirectUri(publicBaseUrl: string): string {
  return new URL('/api/v1/auth/callback', publicBaseUrl).toString();
}

/**
 * Odgovor za poti, na katere pride BRSKALNIK (`/auth/login`, `/auth/callback`) — torej ne
 * XHR. Tam je dokument `application/problem+json` neuporaben, gola napaka 500 pa še slabša:
 * uporabnik dobi Chromovo stran "This page isn't working" in nima pojma, ali je narobe
 * aplikacija, njegova seja ali ponudnik prijave (člen VII).
 *
 * Stran je namenoma brez zunanjih virov in brez uporabnikovega besedila — samo naša
 * sporočila in `correlationId`, s katerim se dogodek najde v dnevniku.
 */
function sendAuthErrorPage(
  req: import('express').Request,
  res: import('express').Response,
  params: { status: number; title: string; detail: string; retryPath?: string },
): void {
  const escape = (value: string) => value.replace(/[<>&"]/g, (c) => `&#${c.charCodeAt(0)};`);
  const retry = params.retryPath ?? '/api/v1/auth/login';
  res
    .status(params.status)
    .type('text/html; charset=utf-8')
    .send(
      `<!doctype html><html lang="sl"><head><meta charset="utf-8">` +
        `<meta name="viewport" content="width=device-width,initial-scale=1">` +
        `<title>${escape(params.title)} — CleverDash</title>` +
        `<style>
          body { margin:0; min-height:100vh; display:grid; place-items:center;
                 font: 16px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif;
                 background:#0f1115; color:#e6e8ee; padding:24px; }
          main { max-width:34rem; }
          h1 { font-size:1.35rem; margin:0 0 .75rem; }
          p { margin:0 0 1rem; color:#b6bcca; }
          a { display:inline-block; padding:.6rem 1.1rem; border-radius:8px;
              background:#3b82f6; color:#fff; text-decoration:none; font-weight:600; }
          code { color:#8b93a7; font-size:.85rem; }
        </style></head><body><main>` +
        `<h1>${escape(params.title)}</h1>` +
        `<p>${escape(params.detail)}</p>` +
        `<p><a href="${escape(retry)}">Poskusi znova</a></p>` +
        `<p><code>ID dogodka: ${escape(req.correlationId ?? '—')}</code></p>` +
        `</main></body></html>`,
    );
}

function setSessionCookie(res: import('express').Response, env: ReturnType<typeof loadEnv>, cookieValue: string): void {
  res.cookie(SESSION_COOKIE, cookieValue, {
    httpOnly: true,
    // `Secure` zahteva HTTPS — produkcija je izključno https://app.si (člen II).
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: SESSION_COOKIE_PATH,
  });
}

function extractRoles(introspection: unknown): string[] {
  const rec = introspection as Record<string, unknown>;
  const realmAccess = rec.realm_access as { roles?: unknown } | undefined;
  const roles = Array.isArray(realmAccess?.roles) ? (realmAccess.roles as string[]) : [];
  const groups = Array.isArray(rec.groups) ? (rec.groups as string[]) : [];
  return [...roles, ...groups];
}

authRouter.get('/auth/login', async (req, res) => {
  try {
    const env = loadEnv();
    const config = await getKeycloakConfig(env);

    const codeVerifier = client.randomPKCECodeVerifier();
    const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
    const state = client.randomState();
    const redirectTo = safeRedirectPath(req.query.redirectTo);

    // Express je brez stanja med zahtevami — kratkoživ, podpisan piškotek je edini
    // prenosnik PKCE/state prek skoka na Keycloak in nazaj (FR-002).
    const flowPayload: OidcFlowPayload = { codeVerifier, state, redirectTo };
    const flowToken = jwt.sign(flowPayload, env.SESSION_COOKIE_SECRET, { expiresIn: '10m' });
    res.cookie(OIDC_FLOW_COOKIE, flowToken, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      // `Lax`, NE `Strict`: ta piškotek MORA priti nazaj na vrhnji-nivojski GET, ki pride s
      // cross-site preusmeritve od Keycloaka — Strict bi ga tam izpustil.
      sameSite: 'lax',
      path: SESSION_COOKIE_PATH,
      maxAge: 10 * 60 * 1000,
    });

    const authorizationUrl = client.buildAuthorizationUrl(config, {
      redirect_uri: callbackRedirectUri(env.PUBLIC_BASE_URL),
      scope: 'openid profile email',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state,
    });
    res.redirect(302, authorizationUrl.toString());
  } catch (err) {
    // Na tej poti je uporabnik BRSKALNIK, ne XHR: napaka mora biti berljiva stran, ne gol
    // 500. Najpogostejši primer je Keycloak, ki se (še) ne odziva — takrat je 503 tudi
    // pravi status, ne 500: aplikacija ni pokvarjena, ponudnik prijave ni dosegljiv.
    const unreachable = err instanceof KeycloakUnreachableError;
    req.log.error({ err, event: 'auth.login.failed' }, 'Prijave ni bilo mogoče začeti');
    sendAuthErrorPage(req, res, {
      status: unreachable ? 503 : 500,
      title: unreachable ? 'Prijava trenutno ni mogoča' : 'Prijave ni bilo mogoče začeti',
      detail: unreachable
        ? 'Ponudnika prijave (Keycloak) ni bilo mogoče doseči. Če se je pravkar zaganjal, počakaj nekaj trenutkov in poskusi znova.'
        : 'Pri začetku prijave je prišlo do nepričakovane napake. Poskusi znova; če se ponovi, pogledaj dnevnik strežnika po spodnjem ID-ju dogodka.',
    });
  }
});

authRouter.get('/auth/callback', async (req, res) => {
  try {
    const env = loadEnv();
    const flowCookieRaw = req.cookies?.[OIDC_FLOW_COOKIE] as string | undefined;
    res.clearCookie(OIDC_FLOW_COOKIE, { path: SESSION_COOKIE_PATH });

    let flow: OidcFlowPayload;
    try {
      if (!flowCookieRaw) throw new Error('missing');
      flow = jwt.verify(flowCookieRaw, env.SESSION_COOKIE_SECRET) as unknown as OidcFlowPayload;
    } catch {
      // Tudi tu je klicatelj brskalnik (vrnitev s Keycloaka), zato stran in ne JSON.
      sendAuthErrorPage(req, res, {
        status: 401,
        title: 'Prijavni tok je potekel',
        detail:
          'Med prijavo je minilo preveč časa ali pa je bil prijavni piškotek izgubljen. Začni prijavo znova.',
      });
      return;
    }

    const config = await getKeycloakConfig(env);
    const currentUrl = new URL(req.originalUrl, env.PUBLIC_BASE_URL);

    let tokens;
    try {
      tokens = await client.authorizationCodeGrant(config, currentUrl, {
        pkceCodeVerifier: flow.codeVerifier,
        expectedState: flow.state,
      });
    } catch (err) {
      auditLoginFailed(req.log, { reason: err instanceof Error ? err.message : String(err) });
      sendAuthErrorPage(req, res, {
        status: 401,
        title: 'Prijava ni uspela',
        detail: 'Keycloak je zavrnil zaključek prijave. Poskusi znova.',
      });
      return;
    }

    const accessToken = tokens.access_token;
    const refreshToken = tokens.refresh_token;
    if (!refreshToken) {
      sendAuthErrorPage(req, res, {
        status: 500,
        title: 'Prijava ni uspela',
        detail:
          'Keycloak ni izdal obnovitvenega žetona. To je napaka v nastavitvah odjemalca na Keycloaku, ne v tvoji prijavi — sporoči skrbniku namestitve.',
      });
      return;
    }

    const introspection = await client.tokenIntrospection(config, accessToken);
    if (!introspection.active || typeof introspection.sub !== 'string') {
      sendAuthErrorPage(req, res, {
        status: 401,
        title: 'Prijava ni uspela',
        detail: 'Keycloak je izdal žeton, ki ni aktiven. Poskusi znova.',
      });
      return;
    }

    const roles = extractRoles(introspection);
    const { hasAccess, scopes } = mapRolesToAccess(roles, env.KEYCLOAK_ADMIN_ROLE, env.KEYCLOAK_USER_ROLE);
    if (!hasAccess) {
      // FR-007: ločeno sporočilo od napačnih poverilnic — oseba JE potrjena pri Keycloaku,
      // samo nima nobene vloge/skupine, ki bi jo CleverDash prepoznal.
      auditLoginFailed(req.log, { reason: `subjekt ${introspection.sub} nima prepoznane vloge/skupine` });
      sendAuthErrorPage(req, res, {
        status: 401,
        title: 'Nimaš dostopa do te aplikacije',
        detail:
          'Prijava pri Keycloaku je uspela, a tvoj račun nima vloge, ki jo CleverDash zahteva. Za dodelitev vloge se obrni na skrbnika.',
      });
      return;
    }

    const userInfo = await client.fetchUserInfo(config, accessToken, introspection.sub);
    const user = await findOrCreateUser({
      keycloakSubject: introspection.sub,
      email: typeof userInfo.email === 'string' ? userInfo.email : `${introspection.sub}@unknown.local`,
      displayName:
        (typeof userInfo.name === 'string' && userInfo.name) ||
        (typeof userInfo.preferred_username === 'string' && userInfo.preferred_username) ||
        String(introspection.sub),
      scopes,
    });
    await migrateLegacyDataIfNeeded(String(user._id), scopes.includes('admin'));

    const { session, cookieValue } = await createSession(env, {
      userId: String(user._id),
      deviceLabel: req.header('user-agent')?.slice(0, 200) ?? 'Neznana naprava',
      platform: 'web',
      refreshToken,
    });
    setSessionCookie(res, env, cookieValue);
    auditLogin(req.log, { userId: String(user._id), sessionId: String(session._id) });

    res.redirect(302, safeRedirectPath(flow.redirectTo));
  } catch (err) {
    const unreachable = err instanceof KeycloakUnreachableError;
    req.log.error({ err, event: 'auth.callback.failed' }, 'Prijave ni bilo mogoče zaključiti');
    sendAuthErrorPage(req, res, {
      status: unreachable ? 503 : 500,
      title: unreachable ? 'Prijava trenutno ni mogoča' : 'Prijave ni bilo mogoče zaključiti',
      detail: unreachable
        ? 'Ponudnika prijave (Keycloak) ni bilo mogoče doseči. Počakaj nekaj trenutkov in poskusi znova.'
        : 'Pri zaključku prijave je prišlo do nepričakovane napake. Poskusi znova; če se ponovi, pogledaj dnevnik strežnika po spodnjem ID-ju dogodka.',
    });
  }
});

authRouter.post('/auth/refresh', async (req, res, next) => {
  try {
    const env = loadEnv();
    const cookieValue = req.cookies?.[SESSION_COOKIE] as string | undefined;
    const sessionId = readSessionCookieValue(env, cookieValue);
    if (!sessionId) {
      next(unauthorized('Seja manjka ali je neveljavna.'));
      return;
    }

    const session = await getActiveSession(sessionId);
    if (!session) {
      next(unauthorized('Seja ne obstaja ali je preklicana.'));
      return;
    }

    const config = await getKeycloakConfig(env);
    const currentRefreshToken = decryptSessionRefreshToken(env, session);

    let tokens;
    try {
      tokens = await client.refreshTokenGrant(config, currentRefreshToken);
    } catch (err) {
      // FR-005/FR-007. Prej sta bili tu DVE zelo različni napaki ena sama, in oba izida sta
      // bila napačna:
      //
      //  1. Keycloak obnovo ZAVRNE (`invalid_grant`: obnovitveni žeton je potekel, bil
      //     preklican ali porabljen). Seje res ni več — ampak stara koda je vrnila samo 401 in
      //     sejo pustila `active` v bazi, piškotek pa v brskalniku. Mrtva seja je zato ostala
      //     in vsaka osvežitev strani je znova sprožila isti obsojen klic proti Keycloaku.
      //     Zdaj se seja prekliče in piškotek pobriše TU, ob prvi zavrnitvi.
      //  2. Keycloak NI DOSEGLJIV (omrežje, ponoven zagon, 5xx). To o veljavnosti seje ne
      //     pove nič — 401 je pomenil, da je vsaka minuta izpada Keycloaka uporabnika odjavila
      //     in vrgla na prijavo. Zdaj gre ven 503: odjemalec (auth.service.ts
      //     `performRefresh`) 401/403 bere kot "seje ni več", vse drugo pa kot "poskusi znova".
      if (isRefreshRejected(err)) {
        req.log.warn({ err, sessionId }, 'Keycloak je zavrnil obnovitev seje — seja se preklicuje');
        await revokeSession(sessionId);
        res.clearCookie(SESSION_COOKIE, { path: SESSION_COOKIE_PATH });
        next(unauthorized('Obnovitev seje ni uspela.'));
        return;
      }
      req.log.warn({ err, sessionId }, 'Keycloaka ni bilo mogoče doseči za obnovitev seje');
      next(serviceUnavailable('Ponudnika prijave trenutno ni mogoče doseči. Poskusi znova.'));
      return;
    }

    if (tokens.refresh_token) {
      await rotateSessionRefreshToken(env, sessionId, tokens.refresh_token);
    }

    res.json({
      accessToken: tokens.access_token,
      expiresIn: tokens.expiresIn() ?? 300,
    });
  } catch (err) {
    next(err);
  }
});

// Odjava se avtenticira s SEJNIM PIŠKOTKOM in ne z dostopnim žetonom — tu je prej stal
// `requireScopes()`, kar je pomenilo, da odjava ne more uspeti natanko v edinem trenutku, ko
// jo odjemalec potrebuje: ko žetona ni več. `performRefresh` (auth.service.ts) ga ob izidu
// `session-invalid` pobriše, PREDEN pokliče `logout()`, zato je vsak takšen poskus dobil
// 401 "Zahtevana je avtentikacija.". Ker `/auth/logout` takrat tudi ni bil izvzet iz
// prestreznika (auth.interceptor.ts, `AUTH_EXEMPT`), je tisti 401 sprožil novo obnovo, ta
// novo odjavo, in tako naprej — neskončna zanka, ki je API-ju pošiljala približno trideset
// zahtev na sekundo na odprt zavihek, dokler ga ni nekdo zaprl.
//
// Piškotek je za to pot povsem zadostna dovolilnica: `readSessionCookieValue` preveri podpis,
// in edino, kar klicatelj s tem doseže, je preklic LASTNE seje.
authRouter.post('/auth/logout', async (req, res, next) => {
  try {
    const env = loadEnv();
    const cookieValue = req.cookies?.[SESSION_COOKIE] as string | undefined;
    const sessionId = readSessionCookieValue(env, cookieValue);
    if (!sessionId) {
      // Brez seje ni česa odjaviti. 401 ostaja (pogodba iz contracts/openapi.yaml), a je za
      // odjemalca zdaj slepa ulica in ne sprožilec: `logout()` se ob napaki vseeno preusmeri
      // na Keycloakovo enotno odjavo.
      next(unauthorized('Seja manjka ali je neveljavna.'));
      return;
    }

    // Uporabnik za dnevnik pride iz SEJE, ne iz `req.auth` — ta je ob potekelem žetonu prazen,
    // torej prav v primeru, ki mu je odjava namenjena.
    const session = await getActiveSession(sessionId);
    await revokeSession(sessionId);
    auditLogout(req.log, {
      userId: req.actor?.subjectId ?? (session ? String(session.userId) : null),
      sessionId,
    });
    res.clearCookie(SESSION_COOKIE, { path: SESSION_COOKIE_PATH });

    const config = await getKeycloakConfig(env);
    const endSessionUrl = client.buildEndSessionUrl(config, {
      post_logout_redirect_uri: env.PUBLIC_BASE_URL,
    });
    res.json({ endSessionUrl: endSessionUrl.toString() });
  } catch (err) {
    next(err);
  }
});

// 012: `req.actor` in NE `req.auth` — ta pot mora povedati, kdo je PRIJAVLJEN, tudi (in prav
// takrat) kadar admin dela v imenu drugega. `actingAs` je edini vir resnice o prevzemu imena
// za odjemalca: web si izbiro sicer hrani v `localStorage`, a ta lahko obvisi (uporabnik je
// izbrisan, admin vloga odvzeta), zato je odgovor te poti tisti, ki ga popravi — glej
// platform/auth/acting-user.ts, `NO_EFFECT_PREFIXES`.
authRouter.get('/auth/me', requireScopes(), async (req, res, next) => {
  try {
    const user = await UserModel.findById(req.actor!.subjectId).lean();
    if (!user) {
      next(notFound('Uporabnik ne obstaja.'));
      return;
    }

    const actingAsId = req.actor!.actingAsUserId;
    // Zamaskirana e-pošta in ne cela — ista projekcija kot v imeniku (`GET /users`, FR-072).
    // Prevzem imena pravice do celega naslova ne prinese; za razločevanje soimenjakov v pasu
    // "delaš kot …" pa namig zadošča.
    const actingAs = actingAsId ? (await readUserSummaries([actingAsId])).get(actingAsId) ?? null : null;

    res.json({
      id: String(user._id),
      email: user.email,
      displayName: user.displayName,
      scopes: req.actor!.scopes,
      lastLoginAt: user.lastLoginAt,
      actingAs,
    });
  } catch (err) {
    next(err);
  }
});

authRouter.get('/auth/sessions', requireScopes(), async (req, res, next) => {
  try {
    const env = loadEnv();
    const currentSessionId = readSessionCookieValue(env, req.cookies?.[SESSION_COOKIE] as string | undefined);
    // 012: `req.actor` — seje pripadajo prijavljenemu človeku. Prevzem tujega imena ne sme
    // pokazati (in `DELETE` spodaj ne preklicati) tujih sej.
    const sessions = await KeycloakSessionModel.find({
      userId: req.actor!.subjectId,
      state: 'active',
    }).lean();
    res.json(
      sessions.map((s) => ({
        id: String(s._id),
        deviceLabel: s.deviceLabel,
        platform: s.platform,
        createdAt: (s as { createdAt?: Date }).createdAt,
        lastUsedAt: s.lastUsedAt,
        current: String(s._id) === currentSessionId,
      })),
    );
  } catch (err) {
    next(err);
  }
});

authRouter.delete('/auth/sessions/:sessionId', requireScopes(), async (req, res, next) => {
  try {
    const session = await KeycloakSessionModel.findOne({
      _id: req.params.sessionId,
      userId: req.actor!.subjectId,
    });
    if (!session) {
      next(notFound('Seja ne obstaja.'));
      return;
    }
    await revokeSession(String(session._id));
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

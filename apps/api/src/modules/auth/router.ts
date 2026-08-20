import { Router } from 'express';
import { z } from 'zod';
import { UserModel } from './models/user.model.js';
import { SessionFamilyModel } from './models/session-family.model.js';
import { hashPassword, verifyPassword } from './services/password.service.js';
import { issueAccessToken } from './services/access-token.service.js';
import { issueInitialRefreshToken, rotateRefreshToken, revokeFamily } from './services/refresh-token.service.js';
import { assertNotThrottled, recordAttempt } from './services/login-throttle.service.js';
import { auditLogin, auditLoginFailed, auditLogout, auditFamilyRevoked } from './auth.audit.js';
import { requireScopes } from '../../platform/auth/scopes.js';
import { unauthorized, notFound, badRequest } from '../../platform/errors/problem.js';
import { loadEnv } from '../../platform/config/env.js';

// Poti za izdajo/rotacijo žetonov (`/auth/login`, `/auth/refresh`) NE sprejemata
// `Idempotency-Key` — uveljavljena izjema po členu III (ustava v1.1.0), zapisana tudi v
// specs/001-app-shell-dashboard/contracts/openapi.yaml.
export const authRouter = Router();

const REFRESH_COOKIE = 'cd_refresh';
const REFRESH_COOKIE_PATH = '/api/v1/auth';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  deviceLabel: z.string().optional(),
  platform: z.enum(['web', 'android']).default('web'),
});

function setRefreshCookie(res: import('express').Response, token: string): void {
  const env = loadEnv();
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    // `Secure` zahteva HTTPS — produkcija je izključno https://app.si (člen II), razvoj
    // in testi pa tečejo prek navadnega HTTP-ja, kjer brskalnik tak piškotek zavrže.
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: REFRESH_COOKIE_PATH,
  });
}

authRouter.post('/auth/login', async (req, res, next) => {
  try {
    const env = loadEnv();
    const body = loginSchema.parse(req.body);
    const ip = req.ip ?? 'unknown';

    await assertNotThrottled(body.email);

    const user = await UserModel.findOne({ email: body.email.toLowerCase() }).select('+passwordHash');
    const ok = user ? await verifyPassword(user.passwordHash, body.password) : false;

    if (!user || !ok) {
      await recordAttempt(body.email, ip, false);
      auditLoginFailed(req.log, { email: body.email });
      // Sporočilo ne razkriva, ali račun obstaja (FR-015).
      next(unauthorized('Napačna e-pošta ali geslo.'));
      return;
    }

    await recordAttempt(body.email, ip, true);

    const family = await SessionFamilyModel.create({
      userId: user._id,
      deviceLabel: body.deviceLabel ?? 'Neznana naprava',
      platform: body.platform,
    });
    const refreshSecret = await issueInitialRefreshToken(env, String(user._id), String(family._id));
    const { token: accessToken, expiresIn } = issueAccessToken(
      env,
      String(user._id),
      user.scopes,
      String(family._id),
    );

    user.lastLoginAt = new Date();
    await user.save();
    auditLogin(req.log, { userId: String(user._id), familyId: String(family._id) });

    if (body.platform === 'web') {
      setRefreshCookie(res, refreshSecret);
      res.json({ accessToken, expiresIn, mustChangePassword: user.mustChangePassword });
    } else {
      res.json({
        accessToken,
        expiresIn,
        refreshToken: refreshSecret,
        mustChangePassword: user.mustChangePassword,
      });
    }
  } catch (err) {
    next(err);
  }
});

authRouter.post('/auth/refresh', async (req, res, next) => {
  try {
    const env = loadEnv();
    const presented: string | undefined =
      req.cookies?.[REFRESH_COOKIE] ?? (req.body as { refreshToken?: string } | undefined)?.refreshToken;

    if (!presented) {
      next(unauthorized('Obnovitveni žeton manjka.'));
      return;
    }

    let rotation;
    try {
      rotation = await rotateRefreshToken(env, presented);
    } catch (err) {
      if (err instanceof Error && err.message.includes('ponovna uporaba')) {
        auditFamilyRevoked(req.log, { familyId: 'unknown', reason: 'reuseDetected' });
      }
      throw err;
    }

    const user = await UserModel.findById(rotation.userId);
    if (!user) {
      next(unauthorized('Uporabnik ne obstaja več.'));
      return;
    }

    const { token: accessToken, expiresIn } = issueAccessToken(
      env,
      rotation.userId,
      user.scopes,
      rotation.familyId,
    );

    if (req.cookies?.[REFRESH_COOKIE]) {
      setRefreshCookie(res, rotation.newSecret);
      res.json({ accessToken, expiresIn, mustChangePassword: user.mustChangePassword });
    } else {
      res.json({
        accessToken,
        expiresIn,
        refreshToken: rotation.newSecret,
        mustChangePassword: user.mustChangePassword,
      });
    }
  } catch (err) {
    next(err);
  }
});

authRouter.post('/auth/logout', requireScopes(), async (req, res, next) => {
  try {
    if (req.auth?.familyId) {
      await revokeFamily(req.auth.familyId, 'logout');
      auditLogout(req.log, { userId: req.auth.subjectId, familyId: req.auth.familyId });
    }
    res.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(12),
});

authRouter.post('/auth/password', requireScopes(), async (req, res, next) => {
  try {
    const body = passwordChangeSchema.parse(req.body);
    const user = await UserModel.findById(req.auth!.subjectId).select('+passwordHash');
    if (!user || !(await verifyPassword(user.passwordHash, body.currentPassword))) {
      next(badRequest('Trenutno geslo ni pravilno.'));
      return;
    }
    user.passwordHash = await hashPassword(body.newPassword);
    user.mustChangePassword = false;
    await user.save();

    // Menjava gesla prekliče vse OSTALE družine sej te osebe — samo trenutna ostane.
    const otherFamilies = await SessionFamilyModel.find({
      userId: user._id,
      _id: { $ne: req.auth!.familyId },
      state: 'active',
    }).lean();
    await Promise.all(otherFamilies.map((f) => revokeFamily(String(f._id), 'logout')));

    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

authRouter.get('/auth/me', requireScopes(), async (req, res, next) => {
  try {
    const user = await UserModel.findById(req.auth!.subjectId).lean();
    if (!user) {
      next(notFound('Uporabnik ne obstaja.'));
      return;
    }
    res.json({
      id: String(user._id),
      email: user.email,
      scopes: user.scopes,
      mustChangePassword: user.mustChangePassword,
      lastLoginAt: user.lastLoginAt,
    });
  } catch (err) {
    next(err);
  }
});

authRouter.get('/auth/sessions', requireScopes(), async (req, res, next) => {
  try {
    const families = await SessionFamilyModel.find({
      userId: req.auth!.subjectId,
      state: 'active',
    }).lean();
    res.json(
      families.map((f) => ({
        id: String(f._id),
        deviceLabel: f.deviceLabel,
        platform: f.platform,
        createdAt: (f as { createdAt?: Date }).createdAt,
        lastUsedAt: f.lastUsedAt,
        current: String(f._id) === req.auth!.familyId,
      })),
    );
  } catch (err) {
    next(err);
  }
});

authRouter.delete('/auth/sessions/:familyId', requireScopes(), async (req, res, next) => {
  try {
    const family = await SessionFamilyModel.findOne({
      _id: req.params.familyId,
      userId: req.auth!.subjectId,
    });
    if (!family) {
      next(notFound('Seja ne obstaja.'));
      return;
    }
    await revokeFamily(String(family._id), 'logout');
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

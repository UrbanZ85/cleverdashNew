import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import type { Env } from '../../../platform/config/env.js';
import { unauthorized } from '../../../platform/errors/problem.js';
import type { AuthContext } from '../../../platform/auth/scopes.js';

// FR-011: dostopni žeton velja kratko (15 min privzeto) in ni shranjen trajno — živi v
// pomnilniku odjemalca. To je edini JWT v sistemu; obnovitveni žeton je naključna
// vrednost, ne JWT (research.md §7), zato se tu ne pojavlja.

interface AccessTokenPayload {
  sub: string; // userId
  scopes: string[];
  fam: string; // familyId — glej AuthContext.familyId
}

export function issueAccessToken(
  env: Pick<Env, 'JWT_ACCESS_SECRET' | 'ACCESS_TOKEN_TTL'>,
  userId: string,
  scopes: string[],
  familyId: string,
): { token: string; expiresIn: number } {
  const token = jwt.sign(
    { sub: userId, scopes, fam: familyId } satisfies AccessTokenPayload,
    env.JWT_ACCESS_SECRET,
    { expiresIn: env.ACCESS_TOKEN_TTL },
  );
  const decoded = jwt.decode(token) as { exp?: number; iat?: number } | null;
  const expiresIn = decoded?.exp && decoded?.iat ? decoded.exp - decoded.iat : 15 * 60;
  return { token, expiresIn };
}

export function verifyAccessToken(
  env: Pick<Env, 'JWT_ACCESS_SECRET'>,
  token: string,
): AuthContext {
  const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
  return {
    subjectType: 'user',
    subjectId: payload.sub,
    scopes: payload.scopes,
    familyId: payload.fam,
  };
}

/** Bere `Authorization: Bearer <token>`, preveri veljavnost in nastavi `req.auth`. Ne
 * zavrne zahteve brez glave — pusti odločitev naslednjemu vratarju (apiKeyGuard je
 * mounted vzporedno; requireScopes na koncu terja, da je req.auth sploh nastavljen). */
export function accessTokenGuard(env: Pick<Env, 'JWT_ACCESS_SECRET'>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const header = req.header('authorization');
    if (!header?.startsWith('Bearer ')) {
      next();
      return;
    }
    const token = header.slice('Bearer '.length);
    try {
      req.auth = verifyAccessToken(env, token);
      next();
    } catch {
      next(unauthorized('Neveljaven ali potekel dostopni žeton.'));
    }
  };
}

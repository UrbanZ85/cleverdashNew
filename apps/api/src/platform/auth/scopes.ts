import type { NextFunction, Request, Response } from 'express';
import { forbidden, unauthorized } from '../errors/problem.js';

/** Kdo je izvedel zahtevo: prijavljen uporabnik (dostopni JWT) ali avtomatizacija
 * (`X-API-Key`). Veljaven identifikator sam po sebi NE pomeni administratorskih pravic —
 * FR-013, člen III. Vse avtorizacijske odločitve gredo prek `scopes`. */
export interface AuthContext {
  subjectType: 'user' | 'apiKey';
  subjectId: string;
  scopes: string[];
  /** Samo za subjectType "user": družina sej te naprave, iz JWT payloada. Uporabljata jo
   * odjava in seznam sej, da vesta, katero družino gledata brez dodatnega branja žetona. */
  familyId?: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthContext;
  }
}

/** Middleware tovarna: zahteva, da ima `req.auth` vse navedene obsege. Uporabljena za
 * JWT in za API ključe enako — obe poti nastavita `req.auth` in se tu srečata. */
export function requireScopes(...required: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) {
      next(unauthorized('Zahtevana je avtentikacija.'));
      return;
    }
    const missing = required.filter((s) => !req.auth!.scopes.includes(s));
    if (missing.length > 0) {
      next(forbidden(`Manjkajo obsegi: ${missing.join(', ')}.`));
      return;
    }
    next();
  };
}

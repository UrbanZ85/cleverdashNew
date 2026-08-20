import type { NextFunction, Request, Response } from 'express';
import { UserModel } from '../models/user.model.js';
import { forbidden } from '../../../platform/errors/problem.js';

// FR-014: dokler je mustChangePassword resničen, so vsi endpointi razen odjave in
// menjave gesla zavrnjeni s 403. Nameščen je globalno v main.ts, poti pa so izvzete
// eksplicitno, da izjema ne postane privzeto stanje.
const EXEMPT_PATHS = new Set(['/auth/logout', '/auth/password', '/auth/login', '/auth/refresh']);

export function mustChangePasswordGuard() {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    if (!req.auth || req.auth.subjectType !== 'user' || EXEMPT_PATHS.has(req.path)) {
      next();
      return;
    }
    const user = await UserModel.findById(req.auth.subjectId).select('mustChangePassword').lean();
    if (user?.mustChangePassword) {
      next(forbidden('Pred nadaljevanjem je treba zamenjati geslo.'));
      return;
    }
    next();
  };
}

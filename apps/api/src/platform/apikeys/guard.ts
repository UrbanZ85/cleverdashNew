import { createHash } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { ApiKeyModel } from './model.js';
import { unauthorized } from '../errors/problem.js';

function hashKey(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

/** Prepozna `X-API-Key`, preveri zgoščeno vrednost proti bazi in nastavi `req.auth` z
 * obsegi ključa. Preklican (`revokedAt`) ali potekel (`expiresAt`) ključ je zavrnjen.
 * Ne posreduje naprej, če glave ni — pusti odločitev naslednjemu avtentikacijskemu
 * middlewaru (JWT), da je pot dosegljiva prek obeh mehanizmov. */
export function apiKeyGuard() {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const secret = req.header('X-API-Key');
    if (!secret) {
      next();
      return;
    }
    const keyHash = hashKey(secret);
    const record = await ApiKeyModel.findOne({ keyHash }).lean();
    if (!record || record.revokedAt || (record.expiresAt && record.expiresAt < new Date())) {
      next(unauthorized('Neveljaven ali preklican API ključ.'));
      return;
    }
    req.auth = { subjectType: 'apiKey', subjectId: String(record._id), scopes: record.scopes };
    void ApiKeyModel.updateOne({ _id: record._id }, { lastUsedAt: new Date() }).exec();
    next();
  };
}

import { createHash } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { ApiKeyModel } from './model.js';
import { unauthorized } from '../errors/problem.js';

/**
 * Kar o ključu ve zahteva, poleg obsegov.
 *
 * LOČENO od `req.auth` in ne zlito vanj: `AuthContext` je skupna oblika za človeka IN za ključ,
 * in vsako polje, ki ga ima samo ena od obeh poti, bi bilo pri drugi `undefined` — torej past za
 * vsakega bodočega bralca, ki bi ga prebral brez preverbe `subjectType`. Tu je izrecno: `req.apiKey`
 * obstaja natanko takrat, kadar je zahteva prišla s ključem.
 */
export interface ApiKeyGrant {
  id: string;
  /** Uporabnik, v čigar imenu ključ piše; `null` za ključe, izdane pred vezavo na uporabnika. */
  ownerId: string | null;
  /** Dovoljeni cilji uvoza (`platform/ingest/`). */
  targets: string[];
}

declare module 'express-serve-static-core' {
  interface Request {
    apiKey?: ApiKeyGrant;
  }
}

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
    // Lastnik in cilji se preberejo TU in ne v vsaki poti posebej: ključ je že prebran iz baze,
    // ponovno branje v `POST /ingest` bi bila druga poizvedba za podatek, ki ga imamo v roki.
    req.apiKey = {
      id: String(record._id),
      ownerId: record.ownerId ? String(record.ownerId) : null,
      targets: record.targets ?? [],
    };
    void ApiKeyModel.updateOne({ _id: record._id }, { lastUsedAt: new Date() }).exec();
    next();
  };
}

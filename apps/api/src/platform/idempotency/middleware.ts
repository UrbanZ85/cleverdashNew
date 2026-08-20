import { createHash } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { IdempotencyKeyModel } from './model.js';
import { ProblemError } from '../errors/problem.js';

// Člen III ustave (v1.1.0): mutacijski endpointi MORAJO sprejemati `Idempotency-Key`, z
// izjemo za endpointe, ki izdajajo ali zavrtijo žeton (`/auth/login`, `/auth/refresh`) —
// glej EXEMPT_PATHS spodaj. Izjema je izrecno zapisana tudi v OpenAPI pogodbi.
const EXEMPT_PATHS = new Set(['/auth/login', '/auth/refresh']);
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function hashBody(body: unknown): string {
  return createHash('sha256').update(JSON.stringify(body ?? null)).digest('hex');
}

/** Ponovljen klic z isto vrednostjo `Idempotency-Key` na isti poti vrne prvotni rezultat.
 * Ista vrednost z drugačnim telesom je napaka `422` — ključ je obljuba, da gre za isto
 * zahtevo (research.md, Complexity Tracking v plan.md). */
export function idempotencyMiddleware() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!MUTATING_METHODS.has(req.method) || EXEMPT_PATHS.has(req.path)) {
      next();
      return;
    }
    const key = req.header('Idempotency-Key');
    if (!key) {
      next();
      return;
    }

    const endpoint = `${req.method} ${req.path}`;
    const requestHash = hashBody(req.body);
    const existing = await IdempotencyKeyModel.findOne({ key, endpoint }).lean();

    if (existing) {
      if (existing.requestHash !== requestHash) {
        next(
          new ProblemError(
            422,
            'Neujemajoč Idempotency-Key',
            'Isti Idempotency-Key je bil že uporabljen z drugačnim telesom zahteve.',
          ),
        );
        return;
      }
      res.status(existing.statusCode).json(existing.responseBody);
      return;
    }

    const originalJson = res.json.bind(res);
    res.json = ((body: unknown) => {
      IdempotencyKeyModel.create({
        key,
        endpoint,
        requestHash,
        statusCode: res.statusCode,
        responseBody: body,
      }).catch((err) => req.log?.error({ err }, 'Shranjevanje Idempotency-Key je spodletelo'));
      return originalJson(body);
    }) as typeof res.json;

    next();
  };
}

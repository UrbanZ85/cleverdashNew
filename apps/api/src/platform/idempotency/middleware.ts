import { createHash } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { IdempotencyKeyModel } from './model.js';
import { ProblemError } from '../errors/problem.js';

// Člen III ustave (v1.1.0): mutacijski endpointi MORAJO sprejemati `Idempotency-Key`, z
// izjemo za endpointe, ki izdajajo ali zavrtijo žeton (`/auth/login`, `/auth/refresh`) —
// glej EXEMPT_PATHS spodaj. Izjema je izrecno zapisana tudi v OpenAPI pogodbi.
const EXEMPT_PATHS = new Set(['/auth/login', '/auth/refresh']);

// 009: ista izjema, po predponi. `POST /share/{token}/unlock` IZDA dovolilnico za prevzem —
// natanko primer, ki ga izjema opisuje. Brez izvzetja bi bil odgovor z dovolilnico shranjen
// pod uporabnikovim ključem in ponovljen tudi po tem, ko je bila povezava PREKLICANA: shranjen
// odgovor bi preživel preklic, kar je ista okvara, ki jo člen opisuje za rotacijo žetonov.
//
// Predpona in ne točna pot, ker je v poti spremenljiv žeton — `EXEMPT_PATHS` primerja `req.path`
// točno in take poti ne more zajeti.
//
// Drugi razlog je javnost teh poti: `Idempotency-Key` je zapis v bazo, ki ga sproži zahteva
// BREZ poverilnic. Neomejeno pisanje v `IdempotencyKey` z javne poti je pot do polnjenja zbirke.
const EXEMPT_PREFIXES = ['/share/'];

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function isExempt(path: string): boolean {
  return EXEMPT_PATHS.has(path) || EXEMPT_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function hashBody(body: unknown): string {
  return createHash('sha256').update(JSON.stringify(body ?? null)).digest('hex');
}

/** Ponovljen klic z isto vrednostjo `Idempotency-Key` na isti poti vrne prvotni rezultat.
 * Ista vrednost z drugačnim telesom je napaka `422` — ključ je obljuba, da gre za isto
 * zahtevo (research.md, Complexity Tracking v plan.md). */
export function idempotencyMiddleware() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!MUTATING_METHODS.has(req.method) || isExempt(req.path)) {
      next();
      return;
    }
    const key = req.header('Idempotency-Key');
    if (!key) {
      next();
      return;
    }

    // 007: zahteve z BINARNIM telesom se preskočijo. Ta varovalka primerja telesi prek
    // `hashBody(req.body)`, telo pa razčleni šele `express.json()` — pri poti, ki telo bere
    // sama (`POST /notes/{id}/audio` prek `express.raw`), je `req.body` tukaj še `undefined`
    // in vsaka taka zahteva bi dala isto zgoščitev. Dva RAZLIČNA posnetka z istim ključem bi
    // bila zato videti kot ponovljena zahteva in drugi bi dobil odgovor prvega — torej tiho
    // izgubljen posnetek. Ključ, katerega obljube ("isto telo") ni mogoče preveriti, je
    // slabši od nobenega ključa.
    //
    // Zahteve BREZ telesa (DELETE, POST brez vsebine) gredo naprej kot doslej — te imajo
    // prazno telo po definiciji in njihova zgoščitev nič ne trdi po krivem.
    const contentType = req.header('content-type');
    if (contentType && !req.is('application/json')) {
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

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
//
// 009b: `/drop/` je tu iz OBEH razlogov. `POST /drop/{token}/unlock` izda dovolilnico za oddajo
// (isti primer kot zgoraj), poti pod njim pa so javne — in shranjen odgovor na `POST
// /drop/{token}/files` bi ponovil identifikator rezervacije, ki je bila medtem že porabljena ali
// pobrisana. Pri binarnem telesu (`PUT .../content`) glava tako ali tako odpade, ker primerjava
// teles ni mogoča (glej varovalko za `content-type` spodaj).
const EXEMPT_PREFIXES = ['/share/', '/drop/'];

// 009b, najdba varnostnega pregleda: izjema člena III ne velja samo za poti, ki izdajo ŽETON,
// ampak za vsako, ki izda SKRIVNOST. Shranjeni odgovor je namreč zapis v bazi, in odgovori teh
// treh poti so edina mesta v celi pogodbi, kjer se geslo za prevzem oz. koda za oddajo pojavita v
// čistopisu (FR-011, FR-082). Brez izjeme bi ju `responseBody` hranil 24 ur v berljivi obliki —
// natanko tisto, kar modul o sebi trdi, da ne počne, saj je v njegovih zbirkah samo `scrypt`
// povzetek.
//
// Drugi razlog je isti kot pri rotaciji žetonov: shranjen odgovor bi po zamenjavi kode vrnil
// STARO kodo in bi bila zamenjava videti opravljena, čeprav ni bila.
//
// Vzorci in ne predpone, ker je v sredini poti spremenljiv identifikator.
const EXEMPT_PATTERNS = [/^\/inboxes\/[^/]+\/code$/, /^\/files\/[^/]+\/password$/];
const EXEMPT_SECRET_PATHS = new Set(['/inboxes']);

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function isExempt(path: string): boolean {
  return (
    EXEMPT_PATHS.has(path) ||
    EXEMPT_SECRET_PATHS.has(path) ||
    EXEMPT_PREFIXES.some((prefix) => path.startsWith(prefix)) ||
    EXEMPT_PATTERNS.some((pattern) => pattern.test(path))
  );
}

/** Klicatelj, na katerega je ključ vezan. `null`, kadar zahteva ni avtenticirana. */
function subjectOf(req: Request): string | null {
  if (!req.auth) return null;
  return `${req.auth.subjectType}:${req.auth.subjectId}`;
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

    // Brez poverilnic ni ne shranjevanja ne ponovitve. Vsaka mutacijska pot, ki pride do sem, je
    // za prijavljenega (javne poti so izvzete zgoraj), zato bo takšna zahteva tako ali tako
    // zavrnjena s 401 — shranjen odgovor pa ne sme biti dosegljiv nekomu, ki pozna samo vrednost
    // ključa.
    const subject = subjectOf(req);
    if (!subject) {
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
      // Neujemanje klicatelja se obravnava ENAKO kot neujemanje telesa in z istim besedilom: kdor
      // ključ ponovi, ne sme izvedeti, ali je bil uporabljen z drugačnim telesom ali od nekoga
      // drugega.
      if (existing.requestHash !== requestHash || existing.subject !== subject) {
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
        subject,
        requestHash,
        statusCode: res.statusCode,
        responseBody: body,
      }).catch((err) => req.log?.error({ err }, 'Shranjevanje Idempotency-Key je spodletelo'));
      return originalJson(body);
    }) as typeof res.json;

    next();
  };
}

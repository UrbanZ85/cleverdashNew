import type { NextFunction, Request, Response } from 'express';
import { forbidden, unauthorized } from '../../platform/errors/problem.js';
import { ADMIN_SCOPE } from '../../platform/auth/scopes.js';

/**
 * Dovolilnica za administratorski del modula Leti (FR-045): urnik, ročni zagon, zgodovina
 * zagonov, stanje virov, outbox dopisov.
 *
 * To je KOPIJA vzorca iz `modules/analytics/admin-guard.ts`, ne uvoz: modul ne sme uvažati iz
 * drugega modula (člen I), dvig v `platform/auth/` pa bi bil sprememba modula 014 in je
 * predlagan kot ločen refaktor (specs/015-flight-deals/research.md §14). Pogoj in razlog zanj
 * sta ista:
 *
 * `requireScopes(ADMIN_SCOPE)` bi deloval, ker API ključ obsega `admin` ne more dobiti — a to je
 * zapora, ki stoji na tem, da nekdo DRUGJE ni pozabil. Urnik velja za celo namestitev in dopisi
 * gredo vsem uporabnikom; pogoj "klicatelj je prijavljen človek z admin vlogo" je zato zapisan
 * tukaj in se na kodo v drugi mapi ne zanaša.
 *
 * ENAK STATUS ZA OBA PRIMERA ("nisi admin", "si ključ"): razlika klicatelju ne koristi in bi
 * povedala, kako je zapora sestavljena.
 *
 * Prevzem imena (012) tega varuha ne odpre in ne zapre: `scopes` ostanejo adminovi tudi med
 * prevzemom (platform/auth/acting-user.ts). Administracija je lastnost človeka za tipkovnico,
 * zato poti pod njim beležijo `req.actor`, ne `req.auth` (ročni zagon pripada tistemu, ki ga je
 * sprožil).
 */
export function requireFlightAdmin() {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) {
      next(unauthorized('Zahtevana je avtentikacija.'));
      return;
    }
    if (req.auth.subjectType !== 'user' || !req.auth.scopes.includes(ADMIN_SCOPE)) {
      next(forbidden('Administracija iskanja letov je na voljo izključno prijavljenemu administratorju.'));
      return;
    }
    next();
  };
}
